# Production Patterns — Hera Architecture Reference

Battle-tested patterns for running AI coding agents in production. These patterns are derived from analyzing how Pi Agent (62K stars) handles reliability, performance, and scale.

---

## 1. Circuit Breaker

Prevent cascading failures when an LLM provider is down.

```python
import time
from enum import Enum

class CircuitState(Enum):
    CLOSED = "closed"      # Normal operation
    OPEN = "open"          # Failing, reject calls
    HALF_OPEN = "half_open"  # Testing recovery

class CircuitBreaker:
    """Circuit breaker for LLM provider calls."""

    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: float = 60.0,
        half_open_max: int = 3,
    ):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max = half_open_max

        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._last_failure_time = 0.0
        self._half_open_successes = 0

    @property
    def state(self) -> CircuitState:
        if self._state == CircuitState.OPEN:
            if time.time() - self._last_failure_time >= self.recovery_timeout:
                self._state = CircuitState.HALF_OPEN
                self._half_open_successes = 0
        return self._state

    def record_success(self) -> None:
        if self._state == CircuitState.HALF_OPEN:
            self._half_open_successes += 1
            if self._half_open_successes >= self.half_open_max:
                self._state = CircuitState.CLOSED
                self._failure_count = 0
        elif self._state == CircuitState.CLOSED:
            self._failure_count = 0

    def record_failure(self) -> None:
        self._failure_count += 1
        self._last_failure_time = time.time()

        if self._state == CircuitState.HALF_OPEN:
            self._state = CircuitState.OPEN
        elif self._failure_count >= self.failure_threshold:
            self._state = CircuitState.OPEN

    def can_execute(self) -> bool:
        state = self.state
        if state == CircuitState.CLOSED:
            return True
        if state == CircuitState.HALF_OPEN:
            return True
        return False
```

### Usage with Provider

```python
class ResilientProvider:
    def __init__(self, provider, circuit_breaker):
        self.provider = provider
        self.circuit = circuit_breaker

    async def call(self, messages, tools=None):
        if not self.circuit.can_execute():
            raise CircuitOpenError("Provider circuit is open")

        try:
            result = await self.provider.chat(messages, tools)
            self.circuit.record_success()
            return result
        except Exception as e:
            self.circuit.record_failure()
            raise
```

---

## 2. Rate Limiter

Respect provider rate limits without hardcoding delays.

```python
import asyncio
import time
from collections import deque

class TokenBucketRateLimiter:
    """Token bucket rate limiter for API calls."""

    def __init__(
        self,
        requests_per_minute: int = 60,
        tokens_per_minute: int = 100000,
        burst_size: int = 10,
    ):
        self.rpm_limit = requests_per_minute
        self.tpm_limit = tokens_per_minute
        self.burst_size = burst_size

        self._request_times: deque[float] = deque()
        self._token_counts: deque[tuple[float, int]] = deque()
        self._lock = asyncio.Lock()

    async def acquire(self, estimated_tokens: int = 0) -> None:
        """Wait until we can make a request."""
        async with self._lock:
            now = time.time()

            # Clean old entries (older than 60s)
            while self._request_times and now - self._request_times[0] > 60:
                self._request_times.popleft()
            while self._token_counts and now - self._token_counts[0][0] > 60:
                self._token_counts.popleft()

            # Check request limit
            if len(self._request_times) >= self.rpm_limit:
                wait_time = 60 - (now - self._request_times[0])
                if wait_time > 0:
                    await asyncio.sleep(wait_time)

            # Check token limit
            total_tokens = sum(t for _, t in self._token_counts)
            if total_tokens + estimated_tokens > self.tpm_limit:
                wait_time = 60 - (now - self._token_counts[0][0])
                if wait_time > 0:
                    await asyncio.sleep(wait_time)

            # Record
            self._request_times.append(time.time())
            if estimated_tokens > 0:
                self._token_counts.append((time.time(), estimated_tokens))

    def record_usage(self, tokens_used: int) -> None:
        """Record actual token usage after a call."""
        self._token_counts.append((time.time(), tokens_used))
```

### Adaptive Rate Limiting

Learn from 429 responses and auto-adjust:

```python
class AdaptiveRateLimiter(TokenBucketRateLimiter):
    """Auto-adjusts rate limits based on 429 responses."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._adjustment_factor = 1.0

    async def on_rate_limited(self, retry_after: float | None = None) -> None:
        """Called when we get a 429."""
        self._adjustment_factor *= 0.8  # Reduce by 20%
        wait = retry_after or 5.0
        await asyncio.sleep(wait)

    def on_success(self) -> None:
        """Gradually restore rate after successes."""
        self._adjustment_factor = min(1.0, self._adjustment_factor * 1.05)

    @property
    def effective_rpm(self) -> int:
        return int(self.rpm_limit * self._adjustment_factor)
```

---

## 3. Health Checks

Monitor agent and provider health.

```python
import asyncio
from dataclasses import dataclass
from enum import Enum
from typing import Any

class HealthStatus(Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"

@dataclass
class HealthCheckResult:
    name: str
    status: HealthStatus
    message: str = ""
    latency_ms: float = 0.0
    metadata: dict[str, Any] | None = None

class HealthChecker:
    """Run health checks on agent components."""

    def __init__(self):
        self._checks: dict[str, callable] = {}

    def register(self, name: str, check_fn: callable) -> None:
        self._checks[name] = check_fn

    async def run_all(self) -> list[HealthCheckResult]:
        """Run all health checks concurrently."""
        results = []
        tasks = [
            self._run_check(name, fn)
            for name, fn in self._checks.items()
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        return [
            r if isinstance(r, HealthCheckResult)
            else HealthCheckResult(name="unknown", status=HealthStatus.UNHEALTHY, message=str(r))
            for r in results
        ]

    async def _run_check(self, name: str, fn: callable) -> HealthCheckResult:
        start = time.time()
        try:
            result = await fn() if asyncio.iscoroutinefunction(fn) else fn()
            latency = (time.time() - start) * 1000
            return HealthCheckResult(name=name, status=HealthStatus.HEALTHY, latency_ms=latency)
        except Exception as e:
            latency = (time.time() - start) * 1000
            return HealthCheckResult(
                name=name,
                status=HealthStatus.UNHEALTHY,
                message=str(e),
                latency_ms=latency,
            )

    async def overall_status(self) -> HealthStatus:
        """Get overall health status."""
        results = await self.run_all()
        statuses = [r.status for r in results]

        if all(s == HealthStatus.HEALTHY for s in statuses):
            return HealthStatus.HEALTHY
        if any(s == HealthStatus.UNHEALTHY for s in statuses):
            return HealthStatus.UNHEALTHY
        return HealthStatus.DEGRADED
```

### Example Health Checks

```python
import time

async def check_llm_provider(provider) -> None:
    """Verify LLM provider is responding."""
    try:
        result = await provider.chat([{"role": "user", "content": "ping"}])
        if not result.get("content"):
            raise Exception("Empty response")
    except Exception as e:
        raise Exception(f"Provider unhealthy: {e}")

def check_disk_space(min_gb: float = 1.0) -> None:
    """Verify sufficient disk space."""
    import shutil
    total, used, free = shutil.disk_usage("/")
    free_gb = free / (1024 ** 3)
    if free_gb < min_gb:
        raise Exception(f"Low disk space: {free_gb:.1f}GB free")

def check_memory(max_percent: float = 90.0) -> None:
    """Verify memory usage is acceptable."""
    import psutil
    mem = psutil.virtual_memory()
    if mem.percent > max_percent:
        raise Exception(f"High memory usage: {mem.percent}%")
```

---

## 4. Graceful Shutdown

Clean shutdown that finishes in-flight work.

```python
import asyncio
import signal
from typing import Any

class GracefulShutdown:
    """Manages graceful shutdown of agent components."""

    def __init__(self, timeout: float = 30.0):
        self.timeout = timeout
        self._shutdown_event = asyncio.Event()
        self._cleanup_tasks: list[callable] = []
        self._in_flight: set[asyncio.Task] = set()

    def register_cleanup(self, fn: callable) -> None:
        """Register a cleanup function to run on shutdown."""
        self._cleanup_tasks.append(fn)

    def track_task(self, task: asyncio.Task) -> None:
        """Track an in-flight task."""
        self._in_flight.add(task)
        task.add_done_callback(self._in_flight.discard)

    async def shutdown(self) -> None:
        """Execute graceful shutdown."""
        self._shutdown_event.set()

        # Wait for in-flight tasks
        if self._in_flight:
            print(f"Waiting for {len(self._in_flight)} in-flight tasks...")
            done, pending = await asyncio.wait(
                self._in_flight,
                timeout=self.timeout,
            )
            for task in pending:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

        # Run cleanup
        for fn in self._cleanup_tasks:
            try:
                if asyncio.iscoroutinefunction(fn):
                    await fn()
                else:
                    fn()
            except Exception as e:
                print(f"Cleanup error: {e}")

    @property
    def is_shutting_down(self) -> bool:
        return self._shutdown_event.is_set()
```

---

## 5. Connection Pooling

Reuse HTTP connections to LLM providers.

```python
import aiohttp
from contextlib import asynccontextmanager

class ConnectionPool:
    """HTTP connection pool for LLM providers."""

    def __init__(
        self,
        max_connections: int = 10,
        max_per_host: int = 5,
        timeout: float = 60.0,
    ):
        self._connector = aiohttp.TCPConnector(
            limit=max_connections,
            limit_per_host=max_per_host,
        )
        self._timeout = aiohttp.ClientTimeout(total=timeout)
        self._session: aiohttp.ClientSession | None = None

    async def get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                connector=self._connector,
                timeout=self._timeout,
            )
        return self._session

    async def close(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()

    @asynccontextmanager
    async def request(self, method: str, url: str, **kwargs):
        session = await self.get_session()
        async with session.request(method, url, **kwargs) as response:
            yield response
```

---

## 6. Structured Logging

Production-grade logging for debugging agent behavior.

```python
import json
import logging
import sys
import time
from typing import Any

class StructuredLogger:
    """JSON-structured logger for agent operations."""

    def __init__(self, name: str, level: str = "info"):
        self.logger = logging.getLogger(name)
        self.logger.setLevel(getattr(logging, level.upper()))

        handler = logging.StreamHandler(sys.stderr)
        handler.setFormatter(logging.Formatter("%(message)s"))
        self.logger.addHandler(handler)

    def _log(self, level: str, event: str, **kwargs: Any) -> None:
        entry = {
            "timestamp": time.time(),
            "level": level,
            "event": event,
            **kwargs,
        }
        self.logger.log(getattr(logging, level.upper()), json.dumps(entry))

    def info(self, event: str, **kwargs: Any) -> None:
        self._log("info", event, **kwargs)

    def warn(self, event: str, **kwargs: Any) -> None:
        self._log("warning", event, **kwargs)

    def error(self, event: str, **kwargs: Any) -> None:
        self._log("error", event, **kwargs)

    def debug(self, event: str, **kwargs: Any) -> None:
        self._log("debug", event, **kwargs)

    # Convenience methods for common agent events
    def llm_call(self, model: str, tokens: int, duration_ms: float) -> None:
        self.info("llm_call", model=model, tokens=tokens, duration_ms=duration_ms)

    def tool_call(self, tool: str, args: dict, duration_ms: float, success: bool) -> None:
        self.info("tool_call", tool=tool, args=args, duration_ms=duration_ms, success=success)

    def agent_error(self, error: str, context: dict | None = None) -> None:
        self.error("agent_error", error=error, context=context or {})
```

---

## 7. Metrics Collection

Track agent performance over time.

```python
import time
from collections import defaultdict
from dataclasses import dataclass, field

@dataclass
class MetricPoint:
    value: float
    timestamp: float = field(default_factory=time.time)
    labels: dict[str, str] = field(default_factory=dict)

class MetricsCollector:
    """Simple in-process metrics collector."""

    def __init__(self):
        self._counters: dict[str, int] = defaultdict(int)
        self._histograms: dict[str, list[float]] = defaultdict(list)
        self._gauges: dict[str, float] = {}

    def increment(self, name: str, value: int = 1) -> None:
        self._counters[name] += value

    def observe(self, name: str, value: float) -> None:
        self._histograms[name].append(value)

    def gauge(self, name: str, value: float) -> None:
        self._gauges[name] = value

    def get_counter(self, name: str) -> int:
        return self._counters.get(name, 0)

    def get_histogram(self, name: str) -> dict[str, float]:
        values = self._histograms.get(name, [])
        if not values:
            return {"count": 0, "sum": 0, "avg": 0, "p50": 0, "p95": 0, "p99": 0}

        sorted_vals = sorted(values)
        count = len(sorted_vals)
        return {
            "count": count,
            "sum": sum(sorted_vals),
            "avg": sum(sorted_vals) / count,
            "p50": sorted_vals[count // 2],
            "p95": sorted_vals[int(count * 0.95)],
            "p99": sorted_vals[int(count * 0.99)],
            "min": sorted_vals[0],
            "max": sorted_vals[-1],
        }

    def snapshot(self) -> dict[str, Any]:
        """Get all metrics as a dict."""
        return {
            "counters": dict(self._counters),
            "gauges": dict(self._gauges),
            "histograms": {
                name: self.get_histogram(name)
                for name in self._histograms
            },
        }
```

---

## Checklist

- [ ] Circuit breaker on LLM provider calls
- [ ] Rate limiter respects provider limits
- [ ] Health checks for all components
- [ ] Graceful shutdown finishes in-flight work
- [ ] Connection pooling for HTTP clients
- [ ] Structured logging (JSON, not print)
- [ ] Metrics collection for monitoring
- [ ] Adaptive rate limiting from 429 responses
- [ ] Timeout on all external calls
- [ ] Resource cleanup on errors
