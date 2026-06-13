# Streaming Patterns — Hera Architecture Reference

How to handle streaming responses from LLM providers. Streaming is critical for UX — users see tokens appear in real-time instead of waiting for the full response.

---

## 1. Server-Sent Events (SSE)

The standard for LLM streaming. OpenAI, Anthropic, and most providers use SSE.

```python
import json
from typing import AsyncIterator

async def stream_openai_sse(
    messages: list[dict],
    model: str = "gpt-4o",
    api_key: str = "",
) -> AsyncIterator[str]:
    """Stream OpenAI responses as SSE."""
    import aiohttp

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    body = {
        "model": model,
        "messages": messages,
        "stream": True,
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=body,
        ) as response:
            async for line in response.content:
                line = line.decode("utf-8").strip()
                if not line or not line.startswith("data: "):
                    continue

                data = line[6:]  # Remove "data: " prefix
                if data == "[DONE]":
                    break

                chunk = json.loads(data)
                delta = chunk["choices"][0].get("delta", {})

                if "content" in delta:
                    yield delta["content"]
```

### SSE with Tool Call Parsing

```python
@dataclass
class StreamEvent:
    type: str  # "text", "tool_start", "tool_delta", "tool_end", "done"
    text: str = ""
    tool_id: str = ""
    tool_name: str = ""
    tool_args_partial: str = ""
    tool_args_complete: str = ""

async def stream_with_tools(
    messages: list[dict],
    tools: list[dict],
    provider: str = "openai",
) -> AsyncIterator[StreamEvent]:
    """Stream response with tool call detection."""
    import aiohttp

    body = {
        "model": "gpt-4o",
        "messages": messages,
        "tools": tools,
        "stream": True,
    }

    current_tool_id = ""
    current_tool_name = ""
    current_tool_args = ""

    async with aiohttp.ClientSession() as session:
        async with session.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json=body,
        ) as response:
            async for line in response.content:
                line = line.decode("utf-8").strip()
                if not line.startswith("data: ") or line == "data: [DONE]":
                    if line == "data: [DONE]":
                        yield StreamEvent(type="done")
                    continue

                chunk = json.loads(line[6:])
                delta = chunk["choices"][0].get("delta", {})

                # Text content
                if "content" in delta and delta["content"]:
                    yield StreamEvent(type="text", text=delta["content"])

                # Tool calls
                if "tool_calls" in delta:
                    for tc in delta["tool_calls"]:
                        if "id" in tc:
                            # New tool call starting
                            current_tool_id = tc["id"]
                            current_tool_name = tc.get("function", {}).get("name", "")
                            current_tool_args = ""
                            yield StreamEvent(
                                type="tool_start",
                                tool_id=current_tool_id,
                                tool_name=current_tool_name,
                            )

                        if "function" in tc and "arguments" in tc["function"]:
                            current_tool_args += tc["function"]["arguments"]
                            yield StreamEvent(
                                type="tool_delta",
                                tool_id=current_tool_id,
                                tool_args_partial=tc["function"]["arguments"],
                            )

                            # Check if we have complete JSON
                            try:
                                json.loads(current_tool_args)
                                yield StreamEvent(
                                    type="tool_end",
                                    tool_id=current_tool_id,
                                    tool_name=current_tool_name,
                                    tool_args_complete=current_tool_args,
                                )
                            except json.JSONDecodeError:
                                pass  # Still accumulating
```

---

## 2. WebSocket Streaming

For persistent connections (chat apps, real-time agents).

```python
import asyncio
import json
import websockets
from typing import AsyncIterator

class WebSocketStreamer:
    """WebSocket-based streaming for real-time agent communication."""

    def __init__(self, url: str, headers: dict[str, str] | None = None):
        self.url = url
        self.headers = headers or {}
        self._ws = None
        self._message_queue: asyncio.Queue = asyncio.Queue()

    async def connect(self) -> None:
        self._ws = await websockets.connect(self.url, extra_headers=self.headers)

    async def disconnect(self) -> None:
        if self._ws:
            await self._ws.close()

    async def send(self, message: dict) -> None:
        if not self._ws:
            await self.connect()
        await self._ws.send(json.dumps(message))

    async def receive(self) -> AsyncIterator[dict]:
        """Receive messages from WebSocket."""
        if not self._ws:
            await self.connect()

        async for raw in self._ws:
            yield json.loads(raw)

    async def stream_response(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
    ) -> AsyncIterator[str]:
        """Send request and stream text response."""
        await self.send({
            "type": "chat",
            "messages": messages,
            "tools": tools or [],
            "stream": True,
        })

        async for msg in self.receive():
            if msg.get("type") == "text_delta":
                yield msg["content"]
            elif msg.get("type") == "done":
                break
            elif msg.get("type") == "error":
                raise Exception(msg.get("message", "Unknown error"))
```

---

## 3. Chunked Response Assembly

Reassemble streamed chunks into complete responses.

```python
from dataclasses import dataclass, field

@dataclass
class AssembledResponse:
    """Complete response assembled from chunks."""
    text: str = ""
    tool_calls: list[dict] = field(default_factory=list)
    finish_reason: str = ""
    total_chunks: int = 0
    duration_ms: float = 0.0

class ResponseAssembler:
    """Assemble streamed chunks into a complete response."""

    def __init__(self):
        self._text_buffer = ""
        self._tool_calls: dict[int, dict] = {}
        self._chunk_count = 0
        self._start_time = 0.0

    def start(self) -> None:
        self._start_time = time.time()

    def add_chunk(self, chunk: dict) -> None:
        """Add a streaming chunk."""
        self._chunk_count += 1
        delta = chunk.get("choices", [{}])[0].get("delta", {})

        # Text content
        if "content" in delta and delta["content"]:
            self._text_buffer += delta["content"]

        # Tool calls
        if "tool_calls" in delta:
            for tc in delta["tool_calls"]:
                idx = tc.get("index", 0)
                if idx not in self._tool_calls:
                    self._tool_calls[idx] = {"id": "", "name": "", "arguments": ""}

                if "id" in tc:
                    self._tool_calls[idx]["id"] = tc["id"]
                if "function" in tc:
                    if "name" in tc["function"]:
                        self._tool_calls[idx]["name"] = tc["function"]["name"]
                    if "arguments" in tc["function"]:
                        self._tool_calls[idx]["arguments"] += tc["function"]["arguments"]

    def finish(self, finish_reason: str = "") -> AssembledResponse:
        """Finalize and return the assembled response."""
        duration = (time.time() - self._start_time) * 1000

        # Parse tool call arguments
        tool_calls = []
        for tc in self._tool_calls.values():
            try:
                tc["arguments"] = json.loads(tc["arguments"])
            except json.JSONDecodeError:
                tc["arguments"] = {}
            tool_calls.append(tc)

        return AssembledResponse(
            text=self._text_buffer,
            tool_calls=tool_calls,
            finish_reason=finish_reason,
            total_chunks=self._chunk_count,
            duration_ms=duration,
        )

    def reset(self) -> None:
        self._text_buffer = ""
        self._tool_calls.clear()
        self._chunk_count = 0
```

---

## 4. Backpressure Handling

Handle cases where the consumer is slower than the producer.

```python
import asyncio
from typing import AsyncIterator, Callable

class BackpressureBuffer:
    """Buffer with backpressure for streaming responses."""

    def __init__(self, max_size: int = 1000):
        self._queue: asyncio.Queue[str | None] = asyncio.Queue(maxsize=max_size)
        self._overflow_count = 0

    async def put(self, chunk: str) -> None:
        """Add chunk. Blocks if buffer is full (backpressure)."""
        try:
            await asyncio.wait_for(self._queue.put(chunk), timeout=5.0)
        except asyncio.TimeoutError:
            self._overflow_count += 1
            # Drop oldest to make room
            try:
                self._queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
            await self._queue.put(chunk)

    async def get(self) -> str | None:
        """Get next chunk. Returns None on stream end."""
        return await self._queue.get()

    async def stream(self) -> AsyncIterator[str]:
        """Consume chunks as an async iterator."""
        while True:
            chunk = await self.get()
            if chunk is None:
                break
            yield chunk

    def close(self) -> None:
        """Signal end of stream."""
        self._queue.put_nowait(None)

    @property
    def overflow_count(self) -> int:
        return self._overflow_count
```

---

## 5. Token-by-Token Callbacks

Process tokens as they arrive (for real-time UI updates).

```python
from typing import Callable

class TokenProcessor:
    """Process tokens as they stream in."""

    def __init__(self):
        self._on_token: Callable[[str], None] | None = None
        self._on_tool_start: Callable[[str, str], None] | None = None
        self._on_tool_end: Callable[[str, str], None] | None = None
        self._on_finish: Callable[[str], None] | None = None

    def on_token(self, callback: Callable[[str], None]) -> None:
        self._on_token = callback

    def on_tool_start(self, callback: Callable[[str, str], None]) -> None:
        self._on_tool_start = callback

    def on_tool_end(self, callback: Callable[[str, str], None]) -> None:
        self._on_tool_end = callback

    def on_finish(self, callback: Callable[[str], None]) -> None:
        self._on_finish = callback

    def process_stream(self, assembler: ResponseAssembler) -> None:
        """Process assembled response through callbacks."""
        if self._on_token and assembler._text_buffer:
            for char in assembler._text_buffer:
                self._on_token(char)

        for tc in assembler._tool_calls.values():
            if self._on_tool_start:
                self._on_tool_start(tc["id"], tc["name"])

        if self._on_finish:
            assembled = assembler.finish()
            self._on_finish(assembled.finish_reason)
```

---

## Checklist

- [ ] SSE parsing handles `data: [DONE]` correctly
- [ ] Tool call deltas are accumulated and assembled
- [ ] Backpressure buffer prevents memory exhaustion
- [ ] WebSocket connections are properly closed
- [ ] Token callbacks don't block the stream
- [ ] Timeout on all stream reads
- [ ] Error handling for malformed chunks
- [ ] Graceful degradation if streaming fails (fall back to non-streaming)
