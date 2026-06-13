# Memory Management — Hera Architecture Reference

How to manage context windows, token budgets, and conversation history in AI coding agents. The #1 production problem is running out of context — these patterns solve it.

---

## 1. Token Counting

Accurate token counting is critical for context management.

```python
from functools import lru_cache

class TokenCounter:
    """Count tokens for different models."""

    # Approximate tokens per character for different model families
    CHARS_PER_TOKEN = {
        "gpt-4": 3.5,
        "gpt-4o": 3.8,
        "gpt-3.5": 4.0,
        "claude-3": 3.5,
        "claude-2": 3.8,
        "default": 4.0,
    }

    @classmethod
    def count(cls, text: str, model: str = "default") -> int:
        """Estimate token count for text."""
        cpt = cls.CHARS_PER_TOKEN.get(model, cls.CHARS_PER_TOKEN["default"])
        return int(len(text) / cpt)

    @classmethod
    def count_messages(cls, messages: list[dict], model: str = "default") -> int:
        """Count tokens for a list of messages."""
        total = 0
        for msg in messages:
            # Message overhead (role, formatting)
            total += 4  # Approximate overhead per message
            content = msg.get("content", "")
            if isinstance(content, str):
                total += cls.count(content, model)
            elif isinstance(content, list):
                for part in content:
                    if isinstance(part, dict) and "text" in part:
                        total += cls.count(part["text"], model)
        return total


class TiktokenCounter:
    """Exact token counting using tiktoken (OpenAI models)."""

    def __init__(self, model: str = "gpt-4o"):
        try:
            import tiktoken
            self._encoder = tiktoken.encoding_for_model(model)
        except ImportError:
            raise ImportError("pip install tiktoken")

    def count(self, text: str) -> int:
        return len(self._encoder.encode(text))

    def count_messages(self, messages: list[dict]) -> int:
        total = 0
        for msg in messages:
            total += 4  # Per-message overhead
            content = msg.get("content", "")
            if isinstance(content, str):
                total += self.count(content)
            elif isinstance(content, list):
                for part in content:
                    if isinstance(part, dict) and "text" in part:
                        total += self.count(part["text"])
        return total
```

---

## 2. Context Window Management

Fit conversation history within the model's context window.

```python
from dataclasses import dataclass
from typing import Callable

@dataclass
class ContextBudget:
    """Token budget allocation for a context window."""
    total: int
    system: int = 0
    messages: int = 0
    tools: int = 0
    reserved: int = 0  # Reserved for response

    @property
    def available_for_messages(self) -> int:
        return self.total - self.system - self.tools - self.reserved

    def allocate_system(self, tokens: int) -> bool:
        if tokens > self.total - self.tools - self.reserved:
            return False
        self.system = tokens
        return True

    def allocate_tools(self, tokens: int) -> bool:
        if tokens > self.total - self.system - self.reserved:
            return False
        self.tools = tokens
        return True

    def can_fit_messages(self, tokens: int) -> bool:
        return tokens <= self.available_for_messages


def fit_messages_to_window(
    messages: list[dict],
    max_tokens: int,
    token_counter: Callable[[str], int],
    system_prompt: str = "",
    tool_tokens: int = 0,
    reserved_tokens: int = 4096,
) -> list[dict]:
    """
    Fit messages into context window by trimming from the oldest.

    Strategy:
    1. Always keep system prompt
    2. Always keep the most recent N messages
    3. Summarize or drop older messages to fit budget
    """
    budget = ContextBudget(
        total=max_tokens,
        reserved=reserved_tokens,
    )

    # System prompt
    system_tokens = token_counter(system_prompt) if system_prompt else 0
    budget.allocate_system(system_tokens)

    # Tool definitions
    budget.allocate_tools(tool_tokens)

    # Try to fit all messages
    total_msg_tokens = sum(
        4 + token_counter(m.get("content", ""))
        for m in messages
    )

    if budget.can_fit_messages(total_msg_tokens):
        return messages  # All fit

    # Need to trim — keep newest messages, drop oldest
    kept = []
    used_tokens = 0

    for msg in reversed(messages):
        msg_tokens = 4 + token_counter(msg.get("content", ""))
        if used_tokens + msg_tokens > budget.available_for_messages:
            break
        kept.insert(0, msg)
        used_tokens += msg_tokens

    # Add truncation notice
    dropped = len(messages) - len(kept)
    if dropped > 0:
        kept.insert(0, {
            "role": "system",
            "content": f"[{dropped} earlier messages were truncated to fit the context window]",
        })

    return kept
```

---

## 3. Conversation Compression

Compress long conversations to preserve important context.

```python
from dataclasses import dataclass

@dataclass
class CompressionResult:
    """Result of conversation compression."""
    summary: str
    key_facts: list[str]
    recent_messages: list[dict]
    original_count: int
    compressed_count: int
    tokens_saved: int


class ConversationCompressor:
    """Compress conversation history while preserving key information."""

    def __init__(self, llm_call: Callable):
        self._llm_call = llm_call

    async def compress(
        self,
        messages: list[dict],
        target_tokens: int,
        token_counter: Callable[[str], int],
    ) -> CompressionResult:
        """
        Compress conversation by summarizing old messages.

        Strategy:
        1. Keep last 10 messages verbatim
        2. Summarize everything before that
        3. Extract key facts (decisions, file paths, errors)
        """
        original_tokens = sum(token_counter(m.get("content", "")) for m in messages)

        # Split: old messages to summarize, recent to keep
        KEEP_RECENT = 10
        if len(messages) <= KEEP_RECENT:
            return CompressionResult(
                summary="",
                key_facts=[],
                recent_messages=messages,
                original_count=len(messages),
                compressed_count=len(messages),
                tokens_saved=0,
            )

        old_messages = messages[:-KEEP_RECENT]
        recent_messages = messages[-KEEP_RECENT:]

        # Generate summary of old messages
        summary_prompt = f"""Summarize this conversation concisely. Focus on:
- Key decisions made
- Files read/modified
- Errors encountered and how they were resolved
- Current task state

Conversation:
{format_messages(old_messages)}

Summary:"""

        summary = await self._llm_call([{"role": "user", "content": summary_prompt}])

        # Extract key facts
        facts_prompt = f"""Extract key facts from this conversation as a bullet list.
Include: file paths, function names, error messages, decisions made.

Conversation:
{format_messages(old_messages)}

Key facts:"""

        facts_text = await self._llm_call([{"role": "user", "content": facts_prompt}])
        key_facts = [f.strip() for f in facts_text.split("\n") if f.strip().startswith("-")]

        # Build compressed context
        compressed = [
            {"role": "system", "content": f"Previous conversation summary:\n{summary}"},
            {"role": "system", "content": "Key facts:\n" + "\n".join(key_facts)},
            *recent_messages,
        ]

        compressed_tokens = sum(token_counter(m.get("content", "")) for m in compressed)

        return CompressionResult(
            summary=summary,
            key_facts=key_facts,
            recent_messages=compressed,
            original_count=len(messages),
            compressed_count=len(compressed),
            tokens_saved=original_tokens - compressed_tokens,
        )


def format_messages(messages: list[dict]) -> str:
    """Format messages for summarization prompt."""
    lines = []
    for msg in messages:
        role = msg.get("role", "unknown")
        content = msg.get("content", "")
        if isinstance(content, list):
            content = " ".join(p.get("text", "") for p in content if isinstance(p, dict))
        lines.append(f"[{role}]: {content}")
    return "\n".join(lines)
```

---

## 4. Sliding Window with Summarization

Automatic context management that never loses important info.

```python
class SlidingWindowManager:
    """Manages context with sliding window + automatic summarization."""

    def __init__(
        self,
        max_tokens: int,
        summarize_threshold: float = 0.8,
        keep_recent: int = 10,
        token_counter: Callable | None = None,
        compressor: ConversationCompressor | None = None,
    ):
        self.max_tokens = max_tokens
        self.summarize_threshold = summarize_threshold
        self.keep_recent = keep_recent
        self.token_counter = token_counter or (lambda t: len(t) // 4)
        self.compressor = compressor

        self._messages: list[dict] = []
        self._summaries: list[str] = []
        self._key_facts: list[str] = []

    def add_message(self, role: str, content: str) -> None:
        self._messages.append({"role": role, "content": content})

    async def get_context(self, system_prompt: str = "") -> list[dict]:
        """Get optimized context for next LLM call."""
        # Check if we need to compress
        total_tokens = self.token_counter(system_prompt)
        total_tokens += sum(self.token_counter(m.get("content", "")) for m in self._messages)

        if total_tokens > self.max_tokens * self.summarize_threshold:
            await self._compress()

        # Build context
        context = []
        if system_prompt:
            context.append({"role": "system", "content": system_prompt})

        # Add summaries as system messages
        if self._summaries:
            context.append({
                "role": "system",
                "content": "Previous conversation context:\n" + "\n".join(self._summaries[-3:]),
            })

        if self._key_facts:
            context.append({
                "role": "system",
                "content": "Key facts:\n" + "\n".join(self._key_facts[-20:]),
            })

        # Add recent messages
        context.extend(self._messages[-self.keep_recent:])

        return context

    async def _compress(self) -> None:
        if not self.compressor:
            # Simple compression: just trim
            self._messages = self._messages[-self.keep_recent:]
            return

        result = await self.compressor.compress(
            messages=self._messages,
            target_tokens=int(self.max_tokens * 0.5),
            token_counter=self.token_counter,
        )

        self._summaries.append(result.summary)
        self._key_facts.extend(result.key_facts)
        self._messages = result.recent_messages
```

---

## 5. Smart Truncation Strategies

Different strategies for different message types.

```python
from enum import Enum

class TruncationStrategy(Enum):
    OLDEST_FIRST = "oldest_first"  # Drop oldest messages
    KEEP_SYSTEM = "keep_system"    # Never drop system messages
    KEEP_TOOLS = "keep_tools"      # Keep tool call/result pairs
    IMPORTANCE = "importance"      # Drop least important first


class SmartTruncator:
    """Truncate messages intelligently based on strategy."""

    def truncate(
        self,
        messages: list[dict],
        max_tokens: int,
        token_counter: Callable[[str], int],
        strategy: TruncationStrategy = TruncationStrategy.KEEP_SYSTEM,
    ) -> list[dict]:
        total = sum(token_counter(m.get("content", "")) for m in messages)
        if total <= max_tokens:
            return messages

        tokens_to_remove = total - max_tokens

        if strategy == TruncationStrategy.OLDEST_FIRST:
            return self._truncate_oldest(messages, tokens_to_remove, token_counter)
        elif strategy == TruncationStrategy.KEEP_SYSTEM:
            return self._truncate_keep_system(messages, tokens_to_remove, token_counter)
        elif strategy == TruncationStrategy.KEEP_TOOLS:
            return self._truncate_keep_tools(messages, tokens_to_remove, token_counter)
        else:
            return self._truncate_oldest(messages, tokens_to_remove, token_counter)

    def _truncate_oldest(
        self,
        messages: list[dict],
        tokens_to_remove: int,
        token_counter: Callable,
    ) -> list[dict]:
        removed = 0
        result = []
        for msg in messages:
            msg_tokens = token_counter(msg.get("content", ""))
            if removed < tokens_to_remove and msg["role"] != "system":
                removed += msg_tokens
                continue
            result.append(msg)
        return result

    def _truncate_keep_system(
        self,
        messages: list[dict],
        tokens_to_remove: int,
        token_counter: Callable,
    ) -> list[dict]:
        # Separate system and non-system messages
        system_msgs = [m for m in messages if m["role"] == "system"]
        other_msgs = [m for m in messages if m["role"] != "system"]

        # Truncate non-system messages
        removed = 0
        kept = []
        for msg in other_msgs:
            msg_tokens = token_counter(msg.get("content", ""))
            if removed < tokens_to_remove:
                removed += msg_tokens
                continue
            kept.append(msg)

        return system_msgs + kept

    def _truncate_keep_tools(
        self,
        messages: list[dict],
        tokens_to_remove: int,
        token_counter: Callable,
    ) -> list[dict]:
        # Keep tool call/result pairs together
        protected = set()
        for i, msg in enumerate(messages):
            if msg["role"] == "toolResult":
                # Protect this and the preceding assistant message
                protected.add(i)
                if i > 0:
                    protected.add(i - 1)

        removed = 0
        result = []
        for i, msg in enumerate(messages):
            msg_tokens = token_counter(msg.get("content", ""))
            if i not in protected and removed < tokens_to_remove and msg["role"] != "system":
                removed += msg_tokens
                continue
            result.append(msg)
        return result
```

---

## Checklist

- [ ] Token counting is accurate (tiktoken for OpenAI, approximation for others)
- [ ] Context budget accounts for system prompt + tools + response
- [ ] Sliding window auto-compresses when approaching limit
- [ ] Compression preserves key facts and decisions
- [ ] Tool call/result pairs are never split
- [ ] System messages survive truncation
- [ ] Truncation notice is added when messages are dropped
- [ ] Token counting is cached (don't re-count same text)
