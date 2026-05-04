# TealTiger Governance Sidecar — Docker Example

The TealTiger governance sidecar exposes TealEngine v1.2 as a language-agnostic HTTP API. Any agent — Go, Rust, Java, Python, Node.js — can call it over HTTP to get governance decisions without importing the SDK.

## Quick Start

```bash
# Pull and run
docker run -p 8080:8080 tealtiger/governance:1.2

# With your own policies
docker run -p 8080:8080 \
  -v ./policies:/etc/tealtiger/policies:ro \
  tealtiger/governance:1.2

# With Docker Compose
docker compose up
```

## API Endpoints

### `POST /evaluate` — Policy evaluation

```bash
curl -X POST http://localhost:8080/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "my-agent",
    "correlation_id": "req-001",
    "request": {
      "tool": "file_delete",
      "path": "/tmp/test.txt",
      "content": "Hello, my email is user@example.com"
    }
  }'
```

Response:
```json
{
  "correlation_id": "req-001",
  "decision": {
    "action": "REDACT",
    "reason_codes": ["PII_DETECTED"],
    "risk_score": 70,
    "mode": "ENFORCE",
    "policy_version": "1.2.0",
    "correlation_id": "req-001",
    "reason": "Governance action: REDACT. Reason codes: PII_DETECTED",
    "timestamp": 1746000000000
  }
}
```

### `POST /scan` — Secret detection

```bash
curl -X POST http://localhost:8080/scan \
  -H "Content-Type: application/json" \
  -d '{
    "content": "My API key is sk-abc123xyz and my password is hunter2"
  }'
```

### `POST /validate` — TEEC validation

```bash
curl -X POST http://localhost:8080/validate \
  -H "Content-Type: application/json" \
  -d '{
    "decision": { ... }
  }'
```

### `GET /health` — Health check

```bash
curl http://localhost:8080/health
# {"status":"ok","version":"1.2.0","mode":"ENFORCE","uptime_seconds":42}
```

### `GET /modules` — List active modules

```bash
curl http://localhost:8080/modules
```

### `GET /ready` — Readiness probe (for Kubernetes)

```bash
curl http://localhost:8080/ready
# {"ready":true}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TEALTIGER_PORT` | `8080` | HTTP port |
| `TEALTIGER_HOST` | `0.0.0.0` | Bind address |
| `TEALTIGER_MODE` | `ENFORCE` | Policy mode: `ENFORCE`, `MONITOR`, `REPORT_ONLY` |
| `TEALTIGER_POLICY_DIR` | `/etc/tealtiger/policies` | Directory containing policy JSON files |
| `TEALTIGER_LOG_LEVEL` | `info` | Log level: `info`, `debug`, `warn`, `error` |
| `TEALTIGER_MAX_BODY_BYTES` | `1048576` | Max request body size (1MB) |

## Policy Files

Mount a directory of JSON policy files to `/etc/tealtiger/policies`. All `.json` files in the directory are merged at startup.

See `policies/default-policy.json` for a complete example.

## Integration Pattern

```python
# Python example — call sidecar before executing any tool
import httpx

GOVERNANCE_URL = "http://localhost:8080"

def evaluate(agent_id: str, tool: str, params: dict) -> dict:
    response = httpx.post(f"{GOVERNANCE_URL}/evaluate", json={
        "agent_id": agent_id,
        "request": {"tool": tool, **params}
    })
    return response.json()["decision"]

decision = evaluate("my-agent", "database_query", {"query": "SELECT * FROM users"})

if decision["action"] == "ALLOW":
    execute_tool(tool, params)
elif decision["action"] == "DENY":
    raise PermissionError(decision["reason"])
elif decision["action"] == "REQUIRE_APPROVAL":
    request_human_approval(decision)
```

```go
// Go example
type Decision struct {
    Action    string `json:"action"`
    RiskScore int    `json:"risk_score"`
    Reason    string `json:"reason"`
}

func evaluate(agentID, tool string, params map[string]any) (*Decision, error) {
    body, _ := json.Marshal(map[string]any{
        "agent_id": agentID,
        "request":  map[string]any{"tool": tool, "params": params},
    })
    resp, err := http.Post("http://localhost:8080/evaluate", "application/json", bytes.NewReader(body))
    // ... parse response
}
```

## Building Locally

```bash
# From packages/tealtiger-sdk/
docker build -f Dockerfile.sidecar -t tealtiger/governance:1.2 .

# Multi-arch build
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f Dockerfile.sidecar \
  -t tealtiger/governance:1.2 \
  --push .
```
