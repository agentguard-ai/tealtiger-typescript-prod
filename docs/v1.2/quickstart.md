# TealTiger v1.2 — Quickstart

## Install

```bash
npm install tealtiger
```

## Create Engine & Evaluate

```typescript
import { TealEngineV12 } from 'tealtiger/engine/v1.2';
import { TealSecrets } from 'tealtiger/secrets';
import { TealRegistry } from 'tealtiger/registry';

// 1. Create modules
const secrets = new TealSecrets();
const registry = new TealRegistry({
  entries: [
    { id: 'gpt-4', catalog: 'models', version: '1.0', hash: '...', metadata: {}, created_at: Date.now(), updated_at: Date.now() },
  ],
  supply_chain: { block_below: false },
});

// 2. Create engine with policy
const engine = new TealEngineV12({
  modules: [secrets, registry],
  policy: {
    TealSecrets: { enabled: true, action: 'DENY', confidence_threshold: 0.5, perfBudgetMs: 5000 },
    TealRegistry: {},
  },
});

// 3. Evaluate a request
const decision = await engine.evaluateV12(
  { content: 'user prompt here', model: 'gpt-4' },
  { correlation_id: crypto.randomUUID() },
);

// 4. Check the decision
console.log(decision.action);       // 'ALLOW' | 'DENY' | ...
console.log(decision.reason_codes); // ['POLICY_COMPLIANT'] | ['SECRET_DETECTED'] | ...
console.log(decision.correlation_id);
```

## Optional: Dashboard

```typescript
import { GovernanceDashboard } from 'tealtiger/dashboard';

const dashboard = new GovernanceDashboard(engine);
dashboard.recordDecision(decision);
console.log(dashboard.getSnapshot());
```

## Next Steps

- See [modules.md](./modules.md) for all available modules
- See [migration.md](./migration.md) for upgrading from v1.1
