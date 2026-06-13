"""
Minimal Provider Router — Hera Architecture Reference (Python)

Inspired by 9router (decolua/9router) — production AI router with multi-key pool,
round-robin with sticky limit, account-level cooldown, exponential backoff,
and config-driven error classification.

Provides:
- Multi-key pool per provider
- "fallback" strategy (sequential) or "round-robin" with sticky limit
- Account-level cooldown (rateLimitedUntil ISO timestamp)
- Exponential backoff (2s -> 4s -> 8s, max 5 min)
- Per-model lock (separate from account cooldown)
- Config-driven error rules (text + status matching)
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field, replace
from typing import Any, Awaitable, Callable, Literal

# ============================================================================
# Types
# ============================================================================

Strategy = Literal["fallback", "round-robin"]


@dataclass
class ApiKey:
    id: str
    key: str
    rate_limited_until: str | None = None  # ISO timestamp
    backoff_level: int = 0
    last_error: dict | None = None


@dataclass
class ErrorRule:
    text: str | None = None
    status: int | None = None
    cooldown_ms: int | None = None
    backoff: bool = False


@dataclass
class RouterConfig:
    strategy: Strategy = "fallback"
    sticky_limit: int = 1
    max_attempts: int = 3
    backoff_ms: int = 2000
    backoff_max_ms: int = 5 * 60 * 1000
    transient_cooldown_ms: int = 30_000
    max_backoff_level: int = 15


# Default error rules (text first, then status)
DEFAULT_ERROR_RULES: list[ErrorRule] = [
    ErrorRule(text="no credentials", cooldown_ms=2 * 60 * 1000),
    ErrorRule(text="improperly formed request", cooldown_ms=2 * 60 * 1000),
    ErrorRule(text="rate limit", backoff=True),
    ErrorRule(text="too many requests", backoff=True),
    ErrorRule(text="quota exceeded", backoff=True),
    ErrorRule(text="capacity", backoff=True),
    ErrorRule(text="overloaded", backoff=True),
    ErrorRule(status=401, cooldown_ms=2 * 60 * 1000),
    ErrorRule(status=403, cooldown_ms=2 * 60 * 1000),
    ErrorRule(status=404, cooldown_ms=2 * 60 * 1000),
    ErrorRule(status=429, backoff=True),
]

NON_FALLBACK_STATUSES = {400}


# ============================================================================
# Error classification
# ============================================================================

def compute_backoff(level: int, base: int, max_ms: int) -> int:
    """Exponential backoff: level=1 -> base, level=2 -> base*2, ..."""
    return min(base * 2 ** max(0, level - 1), max_ms)


def check_fallback_error(
    status: int,
    error_text: str,
    backoff_level: int,
    config: RouterConfig,
    rules: list[ErrorRule] | None = None,
) -> dict:
    """Classify error: should we try next key? How long to cooldown?"""
    if status in NON_FALLBACK_STATUSES:
        return {"should_fallback": False, "cooldown_ms": 0}

    rules = rules or DEFAULT_ERROR_RULES
    lower = (error_text or "").lower()

    for rule in rules:
        # Text match
        if rule.text and rule.text in lower:
            if rule.backoff:
                new_level = min(backoff_level + 1, config.max_backoff_level)
                return {
                    "should_fallback": True,
                    "cooldown_ms": compute_backoff(new_level, config.backoff_ms, config.backoff_max_ms),
                    "new_backoff_level": new_level,
                }
            return {
                "should_fallback": True,
                "cooldown_ms": rule.cooldown_ms or config.transient_cooldown_ms,
            }
        # Status match
        if rule.status == status:
            if rule.backoff:
                new_level = min(backoff_level + 1, config.max_backoff_level)
                return {
                    "should_fallback": True,
                    "cooldown_ms": compute_backoff(new_level, config.backoff_ms, config.backoff_max_ms),
                    "new_backoff_level": new_level,
                }
            return {
                "should_fallback": True,
                "cooldown_ms": rule.cooldown_ms or config.transient_cooldown_ms,
            }

    # Default: transient cooldown
    return {"should_fallback": True, "cooldown_ms": config.transient_cooldown_ms}


# ============================================================================
# Key state
# ============================================================================

def is_key_available(key: ApiKey) -> bool:
    if not key.rate_limited_until:
        return True
    return time.time() >= _iso_to_ts(key.rate_limited_until)


def filter_available_keys(keys: list[ApiKey]) -> list[ApiKey]:
    return [k for k in keys if is_key_available(k)]


def _iso_to_ts(iso: str) -> float:
    """Parse ISO timestamp to epoch seconds (works without external deps)."""
    from datetime import datetime
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()


def _ts_to_iso(ts: float) -> str:
    from datetime import datetime, timezone
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def apply_error_state(key: ApiKey, status: int, error_text: str, config: RouterConfig) -> ApiKey:
    """Update key with error state and appropriate cooldown."""
    result = check_fallback_error(status, error_text, key.backoff_level, config)
    cooldown_ms = result["cooldown_ms"]
    return replace(
        key,
        rate_limited_until=(_ts_to_iso(time.time() + cooldown_ms / 1000) if cooldown_ms > 0 else None),
        backoff_level=result.get("new_backoff_level", key.backoff_level),
        last_error={"status": status, "message": error_text, "timestamp": _ts_to_iso(time.time())},
    )


def reset_key_state(key: ApiKey) -> ApiKey:
    """Clear cooldown and reset backoff (call after success)."""
    return replace(key, rate_limited_until=None, backoff_level=0, last_error=None)


# ============================================================================
# Round-robin state (module-level, keyed by route name)
# ============================================================================

@dataclass
class RotationState:
    index: int = 0
    consecutive_use_count: int = 0


_sticky_states: dict[str, RotationState] = {}


def _pick_next_key(
    keys: list[ApiKey], state_key: str, strategy: Strategy, sticky_limit: int
) -> tuple[ApiKey, RotationState] | None:
    available = filter_available_keys(keys)
    if not available:
        return None

    if strategy == "fallback" or len(available) == 1:
        return available[0], RotationState()

    # round-robin
    state = _sticky_states.get(state_key, RotationState())
    selected_idx = state.index % len(keys)

    # If current key is in cooldown, find next available
    if not is_key_available(keys[selected_idx]):
        for i in range(len(keys)):
            idx = (state.index + i) % len(keys)
            if is_key_available(keys[idx]):
                selected_idx = idx
                break

    new_consecutive = state.consecutive_use_count + 1
    next_state = (
        RotationState(index=(selected_idx + 1) % len(keys))
        if new_consecutive >= sticky_limit
        else RotationState(index=selected_idx, consecutive_use_count=new_consecutive)
    )
    return keys[selected_idx], next_state


# ============================================================================
# ProviderRouter
# ============================================================================

ProviderCall = Callable[[dict, ApiKey], Awaitable[dict]]


class ProviderRouter:
    """Routes LLM calls across multiple API keys with rotation + cooldown."""

    def __init__(
        self,
        route_name: str,
        keys: list[ApiKey],
        provider_call: ProviderCall,
        config: RouterConfig | None = None,
    ):
        if not keys:
            raise ValueError("ProviderRouter requires at least 1 key")
        self.route_name = route_name
        self.keys = keys
        self.provider_call = provider_call
        self.config = config or RouterConfig()

    def set_keys(self, keys: list[ApiKey]) -> None:
        if not keys:
            raise ValueError("Need at least 1 key")
        self.keys = keys

    def get_key_states(self) -> list[dict]:
        return [
            {"id": k.id, "available": is_key_available(k), "last_error": k.last_error}
            for k in self.keys
        ]

    def reset_all(self) -> None:
        self.keys = [reset_key_state(k) for k in self.keys]
        _sticky_states.clear()

    async def call(self, ctx: dict) -> dict:
        last_error: Exception | None = None

        for attempt in range(1, self.config.max_attempts + 1):
            pick = _pick_next_key(
                self.keys, self.route_name, self.config.strategy, self.config.sticky_limit
            )
            if pick is None:
                raise RuntimeError(
                    f"No available keys for route '{self.route_name}' (all in cooldown)"
                )

            selected_key, next_state = pick
            _sticky_states[self.route_name] = next_state

            try:
                result = await self.provider_call(ctx, selected_key)
                # Success: reset this key
                self.keys = [
                    reset_key_state(k) if k.id == selected_key.id else k
                    for k in self.keys
                ]
                return result
            except Exception as err:
                last_error = err
                status = getattr(err, "status", None) or 500
                message = str(err)

                # Apply error state to this key
                self.keys = [
                    apply_error_state(k, status, message, self.config)
                    if k.id == selected_key.id
                    else k
                    for k in self.keys
                ]

                classification = check_fallback_error(
                    status, message, selected_key.backoff_level, self.config
                )
                if not classification["should_fallback"]:
                    raise

                if attempt >= self.config.max_attempts:
                    raise RuntimeError(
                        f"All {self.config.max_attempts} attempts failed for "
                        f"'{self.route_name}'. Last: {message}"
                    ) from err

        raise last_error or RuntimeError("Unknown error in ProviderRouter.call")
