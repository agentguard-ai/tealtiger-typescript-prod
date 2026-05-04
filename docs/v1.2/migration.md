# Migrating from v1.1 to v1.2

## Backward Compatibility

v1.2 is **fully backward compatible** with v1.1. All v1.1 types, enums, and interfaces are preserved. Nothing is removed or renamed.

## What's New

- **TealEngineV12** — New orchestration class (does not replace v1.1 TealEngine)
- **TEEC v0.1.0** — Evidence contract with 32 reason codes, 18 event types, 11 decision actions
- **6 governance dimensions** — Security, Memory, Reliability, Registry, Evidence, Cost
- **9 optional modules** — TealSecrets, TealMemory, TealReliability, TealRegistry, TealVerify, GovernanceDashboard, BundleExporter, and more
- **5 new DecisionActions** — ALLOW_WRITE, DENY_WRITE, REDACT_AND_WRITE, STORE_SUMMARY_ONLY, DENY_READ

## Upgrade Steps

1. Update your dependency: `npm install tealtiger@1.2.0`
2. Import the new engine: `import { TealEngineV12 } from 'tealtiger/engine/v1.2'`
3. Install optional modules as needed (e.g., `import { TealSecrets } from 'tealtiger/secrets'`)
4. Existing v1.1 code continues to work unchanged

## New Imports Available

```typescript
// v1.2 engine
import { TealEngineV12 } from 'tealtiger/engine/v1.2';

// Optional modules
import { TealSecrets } from 'tealtiger/secrets';
import { TealMemory } from 'tealtiger/memory';
import { TealReliability } from 'tealtiger/reliability';
import { TealRegistry } from 'tealtiger/registry';
import { SARIFExporter, GoldenTestRunner, RedTeamHarness } from 'tealtiger/verify';

// Dashboard (optional, no runtime coupling)
import { GovernanceDashboard, BundleExporter } from 'tealtiger/dashboard';
```
