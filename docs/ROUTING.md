# Multi-Model Routing — Hera Architecture Reference

How to route LLM calls across multiple providers and models. Optimize for cost, speed, quality, and reliability.

---

## 1. Provider Router

Route requests to the best provider based on task type.

```python
from dataclasses import dataclass
from enum import Enum
from typing import Any

class TaskType(Enum):
    SIMPLE = "simple"          # Simple Q&A, formatting
    COMPLEX = "complex"        # Multi-step reasoning, code generation
    CREATIVE = "creative"      # Writing, brainstorming
    CODE = "code"              # Code generation, refactoring
    ANALYSIS = "analysis"      # Data analysis, summarization

@dataclass
class ModelConfig:
    """Configuration for a single model."""
    id: str
    provider: str
    cost_per_1k_input: float
    cost_per_1k_output: float
    max_tokens: int
    supports_tools: bool = True
    supports_streaming: bool = True
    speed_rating: float = 1.0   # 1.0 = normal, 2.0 = fast, 0.5 = slow
    quality_rating: float = 1.0  # 1.0 = normal, 2.0 = high quality


class ProviderRouter:
    """Route requests to the optimal model based on task type."""

    def __init__(self):
        self._models: dict[str, ModelConfig] = {}
        self._routing_rules: dict[TaskType, list[str]] = {}

    def register_model(self, config: ModelConfig) -> None:
        self._models[config.id] = config

    def set_routing(self, task_type: TaskType, model_ids: list[str]) -> None:
        """Set model priority order for a task type."""
        self._routing_rules[task_type] = model_ids

    def route(
        self,
        task_type: TaskType,
        prefer: str = "balanced",  # "cost", "speed", "quality", "balanced"
    ) -> ModelConfig:
        """Get the best model for a task type and preference."""
        candidates = self._routing_rules.get(task_type, list(self._models.keys()))

        if not candidates:
            raise ValueError(f"No models configured for task type: {task_type}")

        # Score each candidate
        scored = []
        for model_id in candidates:
            model = self._models.get(model_id)
            if not model:
                continue

            if prefer == "cost":
                score = 1.0 / (model.cost_per_1k_input + model.cost_per_1k_output)
            elif prefer == "speed":
                score = model.speed_rating
            elif prefer == "quality":
                score = model.quality_rating
            else:  # balanced
                score = (model.speed_rating + model.quality_rating) / (
                    model.cost_per_1k_input + model.cost_per_1k_output + 0.01
                )

            scored.append((score, model))

        if not scored:
            raise ValueError("No valid models for routing")

        scored.sort(key=lambda x: x[0], reverse=True)
        return scored[0][1]
```

### Default Routing Configuration

```python
def create_default_router() -> ProviderRouter:
    router = ProviderRouter()

    # Register models
    router.register_model(ModelConfig(
        id="gpt-4o",
        provider="openai",
        cost_per_1k_input=0.005,
        cost_per_1k_output=0.015,
        max_tokens=128000,
        speed_rating=1.5,
        quality_rating=1.8,
    ))

    router.register_model(ModelConfig(
        id="gpt-4o-mini",
        provider="openai",
        cost_per_1k_input=0.00015,
        cost_per_1k_output=0.0006,
        max_tokens=128000,
        speed_rating=2.0,
        quality_rating=1.2,
    ))

    router.register_model(ModelConfig(
        id="claude-sonnet-4",
        provider="anthropic",
        cost_per_1k_input=0.003,
        cost_per_1k_output=0.015,
        max_tokens=200000,
        speed_rating=1.3,
        quality_rating=1.9,
    ))

    router.register_model(ModelConfig(
        id="claude-haiku",
        provider="anthropic",
        cost_per_1k_input=0.00025,
        cost_per_1k_output=0.00125,
        max_tokens=200000,
        speed_rating=2.5,
        quality_rating=1.0,
    ))

    # Set routing rules
    router.set_routing(TaskType.SIMPLE, ["gpt-4o-mini", "claude-haiku"])
    router.set_routing(TaskType.COMPLEX, ["claude-sonnet-4", "gpt-4o"])
    router.set_routing(TaskType.CODE, ["gpt-4o", "claude-sonnet-4"])
    router.set_routing(TaskType.CREATIVE, ["claude-sonnet-4", "gpt-4o"])
    router.set_routing(TaskType.ANALYSIS, ["gpt-4o", "claude-sonnet-4"])

    return router
```

---

## 2. Fallback Chain

Try multiple providers in order until one succeeds.

```python
import asyncio
from typing import Any

class FallbackChain:
    """Try providers in order until one succeeds."""

    def __init__(self, providers: list[tuple[str, Any]]):
        """
        Args:
            providers: List of (name, provider) tuples in priority order.
        """
        self.providers = providers

    async def call(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        **kwargs,
    ) -> dict[str, Any]:
        """Try each provider until one succeeds."""
        errors = []

        for name, provider in self.providers:
            try:
                result = await provider.chat(messages, tools, **kwargs)
                result["_provider"] = name  # Track which provider was used
                return result
            except Exception as e:
                errors.append({"provider": name, "error": str(e)})
                continue

        # All providers failed
        raise Exception(f"All providers failed: {errors}")

    async def call_with_fallback(
        self,
        primary: str,
        messages: list[dict],
        tools: list[dict] | None = None,
        **kwargs,
    ) -> dict[str, Any]:
        """Try primary first, then fall back to others."""
        primary_provider = None
        fallback_providers = []

        for name, provider in self.providers:
            if name == primary:
                primary_provider = provider
            else:
                fallback_providers.append((name, provider))

        if primary_provider:
            try:
                result = await primary_provider.chat(messages, tools, **kwargs)
                result["_provider"] = primary
                return result
            except Exception:
                pass  # Fall through to fallback chain

        return await FallbackChain(fallback_providers).call(messages, tools, **kwargs)
```

---

## 3. Cost Optimization

Track and optimize LLM costs.

```python
from dataclasses import dataclass, field
from collections import defaultdict

@dataclass
class CostTracker:
    """Track LLM API costs across providers and models."""

    total_cost: float = 0.0
    costs_by_model: dict[str, float] = field(default_factory=lambda: defaultdict(float))
    costs_by_task: dict[str, float] = field(default_factory=lambda: defaultdict(float))
    call_count: int = 0
    token_count: int = 0

    def record(
        self,
        model: str,
        input_tokens: int,
        output_tokens: int,
        cost_per_1k_input: float,
        cost_per_1k_output: float,
        task_type: str = "unknown",
    ) -> float:
        """Record a call and return its cost."""
        cost = (
            (input_tokens / 1000) * cost_per_1k_input
            + (output_tokens / 1000) * cost_per_1k_output
        )

        self.total_cost += cost
        self.costs_by_model[model] += cost
        self.costs_by_task[task_type] += cost
        self.call_count += 1
        self.token_count += input_tokens + output_tokens

        return cost

    def summary(self) -> dict:
        """Get cost summary."""
        return {
            "total_cost": round(self.total_cost, 4),
            "call_count": self.call_count,
            "total_tokens": self.token_count,
            "avg_cost_per_call": round(self.total_cost / max(1, self.call_count), 4),
            "by_model": dict(self.costs_by_model),
            "by_task": dict(self.costs_by_task),
        }


class CostOptimizer:
    """Optimize model selection based on cost constraints."""

    def __init__(
        self,
        cost_tracker: CostTracker,
        budget_per_task: float = 0.10,   # Max $0.10 per task
        budget_per_day: float = 10.0,     # Max $10/day
    ):
        self.tracker = cost_tracker
        self.budget_per_task = budget_per_task
        self.budget_per_day = budget_per_day

    def can_afford(self, estimated_tokens: int, model: ModelConfig) -> bool:
        """Check if we can afford a call."""
        estimated_cost = (
            (estimated_tokens / 1000) * model.cost_per_1k_input
            + (estimated_tokens / 1000) * model.cost_per_1k_output
        )
        return estimated_cost <= self.budget_per_task

    def suggest_model(
        self,
        task_type: TaskType,
        estimated_tokens: int,
        router: ProviderRouter,
    ) -> ModelConfig:
        """Suggest the cheapest model that can handle the task."""
        candidates = router._routing_rules.get(task_type, [])

        for model_id in candidates:
            model = router._models.get(model_id)
            if model and self.can_afford(estimated_tokens, model):
                return model

        # Fallback to cheapest
        return router.route(task_type, prefer="cost")
```

---

## 4. Load Balancing

Distribute requests across multiple instances of the same model.

```python
import random
import time
from dataclasses import dataclass

@dataclass
class ProviderInstance:
    """A provider instance with health tracking."""
    name: str
    provider: Any
    weight: int = 1
    failures: int = 0
    last_failure: float = 0.0
    avg_latency_ms: float = 0.0
    request_count: int = 0

    @property
    def is_healthy(self) -> bool:
        if self.failures >= 5 and time.time() - self.last_failure < 60:
            return False
        return True

    @property
    def effective_weight(self) -> float:
        if not self.is_healthy:
            return 0
        # Adjust weight by latency
        latency_factor = 1.0 / (1.0 + self.avg_latency_ms / 1000)
        return self.weight * latency_factor


class LoadBalancer:
    """Distribute requests across provider instances."""

    def __init__(self, instances: list[ProviderInstance]):
        self.instances = instances

    def select(self) -> ProviderInstance:
        """Select an instance using weighted random selection."""
        healthy = [i for i in self.instances if i.is_healthy]
        if not healthy:
            raise Exception("No healthy provider instances")

        weights = [i.effective_weight for i in healthy]
        total = sum(weights)

        if total == 0:
            return random.choice(healthy)

        r = random.uniform(0, total)
        cumulative = 0
        for instance, weight in zip(healthy, weights):
            cumulative += weight
            if r <= cumulative:
                return instance

        return healthy[-1]

    def record_success(self, instance: ProviderInstance, latency_ms: float) -> None:
        instance.request_count += 1
        # Exponential moving average
        alpha = 0.3
        instance.avg_latency_ms = alpha * latency_ms + (1 - alpha) * instance.avg_latency_ms
        instance.failures = max(0, instance.failures - 1)

    def record_failure(self, instance: ProviderInstance) -> None:
        instance.failures += 1
        instance.last_failure = time.time()
```

---

## Checklist

- [ ] Provider router configured for different task types
- [ ] Fallback chain handles provider outages
- [ ] Cost tracker monitors spending
- [ ] Budget limits prevent runaway costs
- [ ] Load balancer distributes across instances
- [ ] Health checks remove unhealthy instances
- [ ] Latency tracking for performance optimization
- [ ] Model selection adapts to cost constraints
