"""
multi_provider_router.py

Python equivalent of templates/multi-provider-router.ts.
Universal multi-provider LLM router with OpenAI-compatible format translation,
custom provider registration, and multi-account pool.

Usage:
    from multi_provider_router import MultiProviderRouter, PROVIDER_CATALOG

    router = MultiProviderRouter()
    router.register_provider({"id": "my-llm", "baseUrl": "...", "format": "openai", "apiKey": "..."})
    result = await router.chat("my-llm", {"model": "gpt-4o", "messages": [...]})
"""
from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Optional


# === Format identifiers ===
FORMATS = {
    "OPENAI": "openai",
    "OPENAI_RESPONSES": "openai-responses",
    "CLAUDE": "claude",
    "GEMINI": "gemini",
}

FormatId = str


# === Data classes ===
@dataclass
class AccountState:
    id: str
    api_key: str
    rate_limited_until: Optional[float] = None  # ms epoch
    consecutive_use_count: int = 0
    consecutive_limit: int = 5  # sticky: rotate every 5 requests


@dataclass
class ProviderConfig:
    id: str
    base_url: str
    format: FormatId
    api_key: Optional[str] = None
    headers: dict[str, str] = field(default_factory=dict)
    auth_header: Optional[str] = None  # default "Authorization: Bearer"
    no_auth: bool = False
    is_custom: bool = False
    retry: dict[int, int] = field(default_factory=dict)
    timeout_ms: int = 60_000
    client_id: Optional[str] = None
    token_url: Optional[str] = None
    auth_url: Optional[str] = None


@dataclass
class ProviderState:
    config: ProviderConfig
    accounts: list[AccountState] = field(default_factory=list)
    cursor: int = 0


@dataclass
class UsageRecord:
    timestamp: float
    provider: str
    model: str
    account_id: str
    input_tokens: int = 0
    output_tokens: int = 0
    cost: Optional[float] = None
    latency_ms: float = 0.0
    success: bool = True


class UsageTracker:
    """Track usage by provider, model, and account."""

    def __init__(self) -> None:
        self.records: list[UsageRecord] = []

    def record(self, r: UsageRecord) -> None:
        self.records.append(r)

    def by_provider(self) -> dict[str, dict[str, int]]:
        out: dict[str, dict[str, int]] = {}
        for r in self.records:
            if r.provider not in out:
                out[r.provider] = {"calls": 0, "tokens": 0}
            out[r.provider]["calls"] += 1
            out[r.provider]["tokens"] += r.input_tokens + r.output_tokens
        return out

    def by_model(self) -> dict[str, dict[str, int]]:
        out: dict[str, dict[str, int]] = {}
        for r in self.records:
            key = f"{r.provider}/{r.model}"
            if key not in out:
                out[key] = {"calls": 0, "tokens": 0}
            out[key]["calls"] += 1
            out[key]["tokens"] += r.input_tokens + r.output_tokens
        return out

    def recent(self, limit: int = 50) -> list[UsageRecord]:
        return self.records[-limit:]


# === Format translator registry ===
RequestTranslator = Callable[[str, dict, Optional[AccountState]], Any]
ResponseTranslator = Callable[[Any, dict], Any]


class TranslatorRegistry:
    def __init__(self) -> None:
        self._request: dict[str, RequestTranslator] = {}
        self._response: dict[str, ResponseTranslator] = {}

    def register(
        self,
        from_fmt: FormatId,
        to_fmt: FormatId,
        request_fn: Optional[RequestTranslator] = None,
        response_fn: Optional[ResponseTranslator] = None,
    ) -> None:
        key = f"{from_fmt}:{to_fmt}"
        if request_fn:
            self._request[key] = request_fn
        if response_fn:
            self._response[key] = response_fn

    def get_request(self, from_fmt: FormatId, to_fmt: FormatId) -> Optional[RequestTranslator]:
        return self._request.get(f"{from_fmt}:{to_fmt}")

    def get_response(self, from_fmt: FormatId, to_fmt: FormatId) -> Optional[ResponseTranslator]:
        return self._response.get(f"{from_fmt}:{to_fmt}")


# === Built-in translators ===
def _identity(model: str, body: dict, creds: Optional[AccountState]) -> dict:
    return body


def _openai_to_claude(model: str, body: dict, creds: Optional[AccountState]) -> dict:
    """Convert OpenAI request to Claude format."""
    system_msg = next((m for m in body["messages"] if m["role"] == "system"), None)
    rest_messages = [m for m in body["messages"] if m["role"] != "system"]
    return {
        "model": model,
        "max_tokens": body.get("max_tokens", 4096),
        **({"system": system_msg["content"]} if system_msg and isinstance(system_msg["content"], str) else {}),
        "messages": [{"role": m["role"], "content": m["content"]} for m in rest_messages],
        **(
            {
                "tools": [
                    {
                        "name": t["function"]["name"],
                        "description": t["function"].get("description", ""),
                        "input_schema": t["function"].get("parameters", {}),
                    }
                    for t in body.get("tools", [])
                ]
            }
        ),
    }


def _openai_to_gemini(model: str, body: dict, creds: Optional[AccountState]) -> dict:
    """Convert OpenAI request to Gemini format."""
    contents = []
    system_text = None
    for m in body["messages"]:
        if m["role"] == "system":
            if isinstance(m["content"], str):
                system_text = m["content"]
            continue
        contents.append(
            {
                "role": "model" if m["role"] == "assistant" else "user",
                "parts": [{"text": m["content"] if isinstance(m["content"], str) else ""}],
            }
        )
    out: dict[str, Any] = {"contents": contents}
    if system_text:
        out["systemInstruction"] = {"role": "user", "parts": [{"text": system_text}]}
    return out


# === Error rules ===
@dataclass
class ErrorRule:
    status: Optional[int] = None
    text_pattern: Optional[str] = None
    action: str = "fail"  # "retry" | "rotate" | "cooldown" | "fail"
    cooldown_ms: int = 0


DEFAULT_ERROR_RULES: list[ErrorRule] = [
    ErrorRule(status=401, action="fail"),
    ErrorRule(status=403, action="fail"),
    ErrorRule(status=429, action="cooldown", cooldown_ms=60_000),
    ErrorRule(status=500, action="retry"),
    ErrorRule(status=502, action="retry"),
    ErrorRule(status=503, action="retry"),
    ErrorRule(text_pattern="rate.?limit", action="cooldown", cooldown_ms=30_000),
    ErrorRule(text_pattern="quota.?exceeded", action="cooldown", cooldown_ms=300_000),
]


# === Format detection ===
def detect_format(pathname: str, body: Optional[dict] = None) -> Optional[FormatId]:
    if "/v1/responses" in pathname:
        return FORMATS["OPENAI_RESPONSES"]
    if "/v1/messages" in pathname:
        return FORMATS["CLAUDE"]
    if "/v1/chat/completions" in pathname and body and isinstance(body.get("input"), list):
        return FORMATS["OPENAI"]
    return None


# === Main router ===
class MultiProviderRouter:
    def __init__(self, error_rules: Optional[list[ErrorRule]] = None) -> None:
        self.providers: dict[str, ProviderState] = {}
        self.usage = UsageTracker()
        self.translators = TranslatorRegistry()
        self.error_rules = error_rules or DEFAULT_ERROR_RULES
        self.hooks: list[tuple[str, Callable[[Any], None]]] = []

        # Register built-in translators
        self.translators.register(FORMATS["OPENAI"], FORMATS["OPENAI"], _identity, None)
        self.translators.register(FORMATS["OPENAI"], FORMATS["CLAUDE"], _openai_to_claude, None)
        self.translators.register(FORMATS["OPENAI"], FORMATS["GEMINI"], _openai_to_gemini, None)

    # --- Provider management ---
    def register_provider(self, config: ProviderConfig | dict) -> None:
        if isinstance(config, dict):
            config = ProviderConfig(**{**config, "baseUrl": config.pop("baseUrl", config.get("base_url", ""))})
        if config.id in self.providers:
            raise ValueError(f"Provider already registered: {config.id}")
        account = AccountState(id=f"{config.id}-account-0", api_key=config.api_key or "")
        self.providers[config.id] = ProviderState(config=config, accounts=[account])

    def list_providers(self) -> list[str]:
        return list(self.providers.keys())

    def remove_provider(self, provider_id: str) -> bool:
        return self.providers.pop(provider_id, None) is not None

    def get_provider(self, provider_id: str) -> Optional[ProviderState]:
        return self.providers.get(provider_id)

    def add_account(self, provider_id: str, api_key: str) -> None:
        state = self.providers.get(provider_id)
        if not state:
            raise ValueError(f"Unknown provider: {provider_id}")
        idx = len(state.accounts)
        state.accounts.append(AccountState(id=f"{provider_id}-account-{idx}", api_key=api_key))

    # --- Account selection (round-robin + sticky + cooldown) ---
    def _select_account(self, provider_id: str) -> AccountState:
        state = self.providers[provider_id]
        now = time.time() * 1000  # ms
        n = len(state.accounts)
        for _ in range(n):
            account = state.accounts[state.cursor % n]
            state.cursor = (state.cursor + 1) % n
            if account.rate_limited_until and account.rate_limited_until > now:
                continue
            if account.consecutive_use_count >= account.consecutive_limit:
                account.consecutive_use_count = 0
                continue
            account.consecutive_use_count += 1
            return account
        # All unavailable, return cursor one
        fallback = state.accounts[state.cursor % n]
        fallback.consecutive_use_count += 1
        return fallback

    # --- Translation ---
    def _translate_request(
        self,
        source: FormatId,
        target: FormatId,
        model: str,
        body: dict,
        credentials: Optional[AccountState],
    ) -> Any:
        result: Any = body
        if source != FORMATS["OPENAI"]:
            fn = self.translators.get_request(source, FORMATS["OPENAI"])
            if fn:
                result = fn(model, result, credentials)
        if target != FORMATS["OPENAI"]:
            fn = self.translators.get_request(FORMATS["OPENAI"], target)
            if fn:
                result = fn(model, result, credentials)
        return result

    # --- Apply error rules ---
    def _apply_error_rule(self, account: AccountState, status: int, text: str) -> None:
        for rule in self.error_rules:
            if rule.status == status or (rule.text_pattern and rule.text_pattern.lower() in text.lower()):
                if rule.action == "cooldown" and rule.cooldown_ms:
                    account.rate_limited_until = time.time() * 1000 + rule.cooldown_ms
                elif rule.action == "rotate":
                    account.consecutive_limit = 1
                return

    # --- Main chat method (async; sync wrapper below) ---
    async def chat(self, provider_id: str, request: dict) -> dict:
        """Send a chat request to the specified provider. Returns parsed JSON response."""
        # Import here to avoid hard dep
        try:
            import httpx
        except ImportError:
            raise ImportError("httpx required: pip install httpx")

        state = self.providers.get(provider_id)
        if not state:
            raise ValueError(f"Unknown provider: {provider_id}")
        account = self._select_account(provider_id)
        start = time.time() * 1000

        # Translate
        translated = self._translate_request(FORMATS["OPENAI"], state.config.format, request["model"], request, account)

        # Build headers
        headers: dict[str, str] = dict(state.config.headers)
        if not state.config.no_auth:
            if state.config.auth_header:
                headers[state.config.auth_header] = account.api_key
            else:
                headers["Authorization"] = f"Bearer {account.api_key}"
        headers["Content-Type"] = "application/json"

        async with httpx.AsyncClient(timeout=state.config.timeout_ms / 1000) as client:
            try:
                res = await client.post(state.config.base_url, json=translated, headers=headers)
            except Exception as err:
                self.usage.record(
                    UsageRecord(
                        timestamp=start,
                        provider=provider_id,
                        model=request["model"],
                        account_id=account.id,
                        latency_ms=time.time() * 1000 - start,
                        success=False,
                    )
                )
                raise

            latency = time.time() * 1000 - start
            if res.status_code >= 400:
                self._apply_error_rule(account, res.status_code, res.text)
                self.usage.record(
                    UsageRecord(
                        timestamp=start,
                        provider=provider_id,
                        model=request["model"],
                        account_id=account.id,
                        latency_ms=latency,
                        success=False,
                    )
                )
                raise RuntimeError(f"Provider {provider_id} returned {res.status_code}: {res.text[:200]}")

            self.usage.record(
                UsageRecord(
                    timestamp=start,
                    provider=provider_id,
                    model=request["model"],
                    account_id=account.id,
                    latency_ms=latency,
                    success=True,
                )
            )
            return res.json()

    def chat_sync(self, provider_id: str, request: dict) -> dict:
        return asyncio.run(self.chat(provider_id, request))

    # --- OAuth refresh (stub) ---
    async def refresh_oauth_token(self, provider_id: str, refresh_token: str) -> dict:
        try:
            import httpx
        except ImportError:
            raise ImportError("httpx required: pip install httpx")

        state = self.providers.get(provider_id)
        if not state or not state.config.token_url:
            raise ValueError(f"Provider {provider_id} has no tokenUrl")
        async with httpx.AsyncClient() as client:
            res = await client.post(
                state.config.token_url,
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                    "client_id": state.config.client_id or "",
                },
            )
            res.raise_for_status()
            return res.json()

    # --- Device code polling ---
    async def poll_device_code(
        self,
        provider_id: str,
        device_code: str,
        code_verifier: str,
        interval_sec: int,
        deadline_ms: int = 120_000,
    ) -> dict:
        try:
            import httpx
        except ImportError:
            raise ImportError("httpx required: pip install httpx")

        state = self.providers.get(provider_id)
        if not state or not state.config.token_url:
            raise ValueError(f"Provider {provider_id} has no tokenUrl")
        deadline = time.time() * 1000 + deadline_ms
        interval = interval_sec
        async with httpx.AsyncClient() as client:
            while time.time() * 1000 < deadline:
                await asyncio.sleep(interval)
                res = await client.post(
                    state.config.token_url,
                    data={
                        "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                        "device_code": device_code,
                        "client_id": state.config.client_id or "",
                        "code_verifier": code_verifier,
                    },
                )
                data = res.json()
                if data.get("access_token"):
                    return data
                if data.get("error") == "slow_down":
                    interval = min(interval + 5, 30)
                if data.get("error") in ("expired_token", "access_denied"):
                    raise RuntimeError(f"Device code auth failed: {data['error']}")
        raise RuntimeError("Device code authorization timeout")


# === Pre-configured provider catalog (subset of 9router's 100+) ===
PROVIDER_CATALOG: dict[str, dict] = {
    "openai": {"id": "openai", "baseUrl": "https://api.openai.com/v1/chat/completions", "format": FORMATS["OPENAI"]},
    "anthropic": {"id": "anthropic", "baseUrl": "https://api.anthropic.com/v1/messages", "format": FORMATS["CLAUDE"]},
    "gemini": {"id": "gemini", "baseUrl": "https://generativelanguage.googleapis.com/v1beta/models", "format": FORMATS["GEMINI"]},
    "groq": {"id": "groq", "baseUrl": "https://api.groq.com/openai/v1/chat/completions", "format": FORMATS["OPENAI"]},
    "openrouter": {"id": "openrouter", "baseUrl": "https://openrouter.ai/api/v1/chat/completions", "format": FORMATS["OPENAI"]},
    "ollama": {"id": "ollama", "baseUrl": "http://localhost:11434/api/chat", "format": FORMATS["OPENAI"]},
    "deepseek": {"id": "deepseek", "baseUrl": "https://api.deepseek.com/chat/completions", "format": FORMATS["OPENAI"]},
    "xai": {"id": "xai", "baseUrl": "https://api.x.ai/v1/chat/completions", "format": FORMATS["OPENAI"]},
    "mistral": {"id": "mistral", "baseUrl": "https://api.mistral.ai/v1/chat/completions", "format": FORMATS["OPENAI"]},
    "together": {"id": "together", "baseUrl": "https://api.together.xyz/v1/chat/completions", "format": FORMATS["OPENAI"]},
}
