# Deployment Guide — Hera Architecture Reference

This document covers how to deploy AI coding agents to production.

---

## 1. Local Deployment

### 1.1 Run as CLI Tool

```bash
# Build
npm run build

# Run
node dist/index.js

# Or with tsx (TypeScript)
npx tsx src/index.ts
```

### 1.2 Run as Background Service

```bash
# Using nohup
nohup node dist/index.js > agent.log 2>&1 &

# Using pm2
npm install -g pm2
pm2 start dist/index.js --name my-agent
pm2 logs my-agent
pm2 monit
```

### 1.3 Run with systemd

Create `/etc/systemd/system/my-agent.service`:

```ini
[Unit]
Description=My AI Coding Agent
After=network.target

[Service]
Type=simple
User=agent
WorkingDirectory=/opt/my-agent
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/opt/my-agent/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable my-agent
sudo systemctl start my-agent
sudo systemctl status my-agent
```

---

## 2. Docker Deployment

### 2.1 Dockerfile

```dockerfile
# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# Production stage
FROM node:22-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder /app/dist ./dist
USER node
CMD ["node", "dist/index.js"]
```

### 2.2 docker-compose.yml

```yaml
version: "3.8"
services:
  agent:
    build: .
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./data:/app/data
    ports:
      - "3000:3000"
```

### 2.3 Build and Run

```bash
# Build
docker build -t my-agent .

# Run
docker run -d --name my-agent --env-file .env my-agent

# With docker-compose
docker-compose up -d
```

---

## 3. Cloud Deployment

### 3.1 Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Init project
railway init

# Deploy
railway up
```

### 3.2 Render

1. Connect GitHub repo
2. Set build command: `npm install && npm run build`
3. Set start command: `node dist/index.js`
4. Add environment variables

### 3.3 Fly.io

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Init project
fly launch

# Deploy
fly deploy
```

### 3.4 AWS Lambda

```typescript
// src/lambda.ts
import { createAgent } from "./agent/index.js";

export async function handler(event: any) {
  const agent = createAgent({
    // ... config
  });

  const response = await agent.prompt(event.body);

  return {
    statusCode: 200,
    body: JSON.stringify({ response }),
  };
}
```

### 3.5 Vercel Edge Functions

```typescript
// api/agent.ts
import { createAgent } from "../agent/index.js";

export const config = {
  runtime: "edge",
};

export default async function handler(req: Request) {
  const { message } = await req.json();

  const agent = createAgent({
    // ... config
  });

  const response = await agent.prompt(message);

  return new Response(JSON.stringify({ response }), {
    headers: { "Content-Type": "application/json" },
  });
}
```

---

## 4. Configuration

### 4.1 Environment Variables

```bash
# Required
OPENAI_API_KEY=sk-...
# or
ANTHROPIC_API_KEY=sk-ant-...

# Optional
LLM_MODEL=gpt-4
LLM_BASE_URL=https://api.openai.com/v1
LOG_LEVEL=info
MAX_TOKENS=4096
TEMPERATURE=0.7
```

### 4.2 API Key Management

```typescript
// Use environment variables
const apiKey = process.env.OPENAI_API_KEY;

// Or use a secret manager
import { SecretsManager } from "@aws-sdk/client-secrets-manager";

async function getApiKey(): Promise<string> {
  const client = new SecretsManager();
  const secret = await client.getSecretValue({ SecretId: "agent-api-key" });
  return secret.SecretString!;
}
```

### 4.3 Rate Limiting

```typescript
import rateLimit from "express-rate-limit";

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: "Too many requests",
});

app.use("/api", limiter);
```

---

## 5. Monitoring

### 5.1 Structured Logging

```typescript
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: {
    target: "pino-pretty",
  },
});

// Usage
logger.info({ tool: "read", path: "README.md" }, "Tool executed");
logger.error({ error: err.message }, "Tool failed");
```

### 5.2 Metrics

```typescript
import { Counter, Histogram } from "prom-client";

const toolCalls = new Counter({
  name: "agent_tool_calls_total",
  help: "Total tool calls",
  labelNames: ["tool", "status"],
});

const latency = new Histogram({
  name: "agent_latency_seconds",
  help: "Agent response latency",
  buckets: [0.1, 0.5, 1, 2, 5, 10],
});

// Usage
toolCalls.inc({ tool: "read", status: "success" });
latency.observe(responseTime);
```

### 5.3 Error Tracking

```typescript
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
});

// Usage
try {
  await agent.prompt(text);
} catch (error) {
  Sentry.captureException(error);
  throw error;
}
```

### 5.4 Cost Tracking

```typescript
interface CostTracker {
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
}

function trackCost(usage: { input: number; output: number }, model: string): CostTracker {
  const costs: Record<string, { input: number; output: number }> = {
    "gpt-4": { input: 0.03, output: 0.06 },
    "gpt-4-turbo": { input: 0.01, output: 0.03 },
    "claude-sonnet-4": { input: 0.003, output: 0.015 },
  };

  const cost = costs[model] || { input: 0, output: 0 };
  const inputCost = (usage.input / 1000) * cost.input;
  const outputCost = (usage.output / 1000) * cost.output;

  return {
    inputTokens: usage.input,
    outputTokens: usage.output,
    totalCost: inputCost + outputCost,
  };
}
```

---

## 6. Scaling

### 6.1 Horizontal Scaling

```yaml
# docker-compose.yml
version: "3.8"
services:
  agent:
    build: .
    deploy:
      replicas: 3
    restart: unless-stopped
```

### 6.2 Session Persistence

```typescript
// Use Redis for session storage
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL);

class RedisSessionStorage {
  async save(sessionId: string, data: unknown): Promise<void> {
    await redis.set(`session:${sessionId}`, JSON.stringify(data));
  }

  async load(sessionId: string): Promise<unknown> {
    const data = await redis.get(`session:${sessionId}`);
    return data ? JSON.parse(data) : null;
  }
}
```

### 6.3 Load Balancing

```nginx
# nginx.conf
upstream agent_backend {
    server agent1:3000;
    server agent2:3000;
    server agent3:3000;
}

server {
    listen 80;
    location / {
        proxy_pass http://agent_backend;
    }
}
```

---

## Checklist

- [ ] Build succeeds (`npm run build`)
- [ ] Tests pass (`npm test`)
- [ ] Environment variables configured
- [ ] API keys secured (not in code)
- [ ] Rate limiting configured
- [ ] Logging configured
- [ ] Error tracking configured
- [ ] Health check endpoint exists
- [ ] Graceful shutdown handled
- [ ] Session persistence configured
- [ ] Monitoring dashboards set up
- [ ] Cost tracking enabled
