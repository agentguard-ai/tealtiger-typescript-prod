# TealTiger Migration Guide: v1.0.x → v1.1.0

## Overview

TealTiger v1.1.0 introduces **TealEngine** and branded components (TealGuard, TealMonitor, TealCircuit, TealAudit) while maintaining backward compatibility with v1.0.x configurations. This guide helps you migrate smoothly.

**Migration Time**: 15-30 minutes  
**Breaking Changes**: None (fully backward compatible)  
**Recommended**: Yes (new features, better performance)

---

## What's New in v1.1.0

### New Components

1. **TealEngine** - Policy definition and enforcement framework
2. **TealGuard** - Enhanced guardrails (existing, improved)
3. **TealMonitor** - Behavioral monitoring and anomaly detection
4. **TealCircuit** - Circuit breaker for failure prevention
5. **TealAudit** - Comprehensive audit logging

### Key Improvements

- 🎯 **OWASP Coverage**: 70% (7/10 ASIs) with SDK alone
- ⚡ **Performance**: <15ms total overhead
- 🔧 **Policy Framework**: Declarative security policies
- 📊 **Monitoring**: Real-time anomaly detection
- 🛡️ **Resilience**: Circuit breaker pattern
- 📝 **Audit**: Structured logging with filtering

---

## Migration Paths

### Path 1: No Changes Required (Recommended for Testing)

Your existing v1.0.x code works without modifications:

```typescript
// v1.0.x code - still works in v1.1.0
import { TealOpenAI } from 'tealtiger';

const client = new TealOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  guardrails: {
    piiDetection: { enabled: true },
    contentModeration: { enabled: true }
  },
  costTracking: {
    enabled: true,
    budget: { limit: 100, period: 'daily' }
  }
});
```

**Status**: ✅ Fully supported, no deprecation warnings

---

### Path 2: Gradual Migration (Recommended for Production)

Add new components incrementally:

#### Step 1: Add TealEngine (5 minutes)

```typescript
import { TealOpenAI, TealEngine } from 'tealtiger';

const client = new TealOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  
  // Existing v1.0.x config (still works)
  guardrails: {
    piiDetection: { enabled: true }
  },
  
  // NEW: Add TealEngine policies
  engine: new TealEngine({
    tools: {
      'database_query': { 
        allowed: true,
        maxRows: 1000 
      },
      'file_delete': { allowed: false }
    }
  })
});
```

#### Step 2: Add TealMonitor (5 minutes)

```typescript
import { TealOpenAI, TealEngine, TealMonitor } from 'tealtiger';

const client = new TealOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  engine: new TealEngine({ /* policies */ }),
  
  // NEW: Add behavioral monitoring
  monitor: new TealMonitor({
    anomalyThreshold: 2.0,
    onAnomaly: (event) => {
      console.warn('Anomaly detected:', event);
    }
  })
});
```

#### Step 3: Add TealCircuit (5 minutes)

```typescript
import { TealOpenAI, TealEngine, TealMonitor, TealCircuit } from 'tealtiger';

const client = new TealOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  engine: new TealEngine({ /* policies */ }),
  monitor: new TealMonitor({ /* config */ }),
  
  // NEW: Add circuit breaker
  circuit: new TealCircuit({
    failureThreshold: 5,
    timeout: 30000,
    onStateChange: (state) => {
      console.log('Circuit state:', state);
    }
  })
});
```

#### Step 4: Add TealAudit (5 minutes)

```typescript
import { 
  TealOpenAI, 
  TealEngine, 
  TealMonitor, 
  TealCircuit, 
  TealAudit 
} from 'tealtiger';

const client = new TealOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  engine: new TealEngine({ /* policies */ }),
  monitor: new TealMonitor({ /* config */ }),
  circuit: new TealCircuit({ /* config */ }),
  
  // NEW: Add audit logging
  audit: new TealAudit({
    outputs: ['file'],
    filePath: './logs/tealtiger-audit.jsonl',
    level: 'info'
  })
});
```

---

### Path 3: Full Migration (Recommended for New Projects)

Use all v1.1.0 features from the start:

```typescript
import { 
  TealOpenAI, 
  TealEngine, 
  TealMonitor, 
  TealCircuit, 
  TealAudit 
} from 'tealtiger';

// Use TealEngine template for quick setup
const engine = TealEngine.Templates.customerSupport({
  allowedTools: ['search_knowledge_base', 'create_ticket'],
  costLimit: { daily: 50 }
});

const monitor = new TealMonitor({
  anomalyThreshold: 2.0,
  onAnomaly: (event) => {
    // Send to monitoring service
    sendAlert(event);
  }
});

const circuit = new TealCircuit({
  failureThreshold: 5,
  timeout: 30000,
  halfOpenRequests: 3
});

const audit = new TealAudit({
  outputs: ['file', 'console'],
  filePath: './logs/tealtiger-audit.jsonl',
  level: 'detailed'
});

const client = new TealOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  agentId: 'support-agent-001',
  engine,
  monitor,
  circuit,
  audit
});
```

---

## Configuration Mapping

### Guardrails (v1.0.x → v1.1.0)

**v1.0.x:**
```typescript
{
  guardrails: {
    piiDetection: { enabled: true },
    promptInjection: { enabled: true },
    contentModeration: { enabled: true, threshold: 0.8 }
  }
}
```

**v1.1.0 (Backward Compatible):**
```typescript
// Option 1: Keep v1.0.x config (still works)
{
  guardrails: {
    piiDetection: { enabled: true },
    promptInjection: { enabled: true },
    contentModeration: { enabled: true, threshold: 0.8 }
  }
}

// Option 2: Use TealEngine policies (recommended)
{
  engine: new TealEngine({
    content: {
      pii: {
        enabled: true,
        blockedTypes: ['ssn', 'credit_card', 'email']
      },
      moderation: {
        enabled: true,
        threshold: 0.8,
        categories: ['hate', 'violence', 'sexual']
      }
    }
  })
}
```

### Cost Tracking (v1.0.x → v1.1.0)

**v1.0.x:**
```typescript
{
  costTracking: {
    enabled: true,
    budget: { limit: 100, period: 'daily' }
  }
}
```

**v1.1.0 (Backward Compatible):**
```typescript
// Option 1: Keep v1.0.x config (still works)
{
  costTracking: {
    enabled: true,
    budget: { limit: 100, period: 'daily' }
  }
}

// Option 2: Add TealMonitor for anomaly detection (recommended)
{
  costTracking: {
    enabled: true,
    budget: { limit: 100, period: 'daily' }
  },
  monitor: new TealMonitor({
    anomalyThreshold: 2.0,
    onAnomaly: (event) => {
      if (event.type === 'cost_spike') {
        console.warn('Cost spike detected:', event);
      }
    }
  })
}
```

---

## Feature Comparison

| Feature | v1.0.x | v1.1.0 | Migration |
|---------|--------|--------|-----------|
| PII Detection | ✅ | ✅ Enhanced | No change needed |
| Content Moderation | ✅ | ✅ Enhanced | No change needed |
| Cost Tracking | ✅ | ✅ Enhanced | No change needed |
| Budget Management | ✅ | ✅ Enhanced | No change needed |
| Policy Engine | ❌ | ✅ **NEW** | Add TealEngine |
| Behavioral Monitoring | ❌ | ✅ **NEW** | Add TealMonitor |
| Circuit Breaker | ❌ | ✅ **NEW** | Add TealCircuit |
| Audit Logging | Basic | ✅ **Enhanced** | Add TealAudit |
| OWASP Coverage | 40% | 70% | Use new components |

---

## Common Migration Scenarios

### Scenario 1: Customer Support Agent

**Before (v1.0.x):**
```typescript
const client = new TealOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  guardrails: {
    piiDetection: { enabled: true },
    contentModeration: { enabled: true }
  },
  costTracking: {
    enabled: true,
    budget: { limit: 50, period: 'daily' }
  }
});
```

**After (v1.1.0):**
```typescript
const client = new TealOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  agentId: 'support-agent-001',
  
  // Use pre-built template
  engine: TealEngine.Templates.customerSupport({
    allowedTools: ['search_knowledge_base', 'create_ticket'],
    costLimit: { daily: 50 }
  }),
  
  // Add monitoring
  monitor: new TealMonitor({
    anomalyThreshold: 2.0
  }),
  
  // Add circuit breaker
  circuit: new TealCircuit({
    failureThreshold: 5
  })
});
```

### Scenario 2: Code Generation Agent

**Before (v1.0.x):**
```typescript
const client = new TealOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  guardrails: {
    contentModeration: { enabled: true }
  }
});
```

**After (v1.1.0):**
```typescript
const client = new TealOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  agentId: 'code-gen-001',
  
  // Use code generation template
  engine: TealEngine.Templates.codeGeneration({
    allowedLanguages: ['python', 'javascript', 'typescript'],
    maxLength: 10000
  }),
  
  // Add code execution safety
  codeExecution: TealEngine.Templates.codeExecutionSafe()
});
```

### Scenario 3: Data Analysis Agent

**Before (v1.0.x):**
```typescript
const client = new TealOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  costTracking: {
    enabled: true,
    budget: { limit: 200, period: 'daily' }
  }
});
```

**After (v1.1.0):**
```typescript
const client = new TealOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  agentId: 'data-analyst-001',
  
  // Use data analysis template
  engine: TealEngine.Templates.dataAnalysis({
    allowedTools: ['database_query', 'file_read'],
    maxRows: 10000,
    costLimit: { daily: 200 }
  }),
  
  // Monitor for anomalies
  monitor: new TealMonitor({
    anomalyThreshold: 2.5,
    onAnomaly: (event) => {
      if (event.type === 'unusual_tool_usage') {
        console.warn('Unusual query pattern:', event);
      }
    }
  })
});
```

---

## Testing Your Migration

### Step 1: Install v1.1.0

```bash
npm install tealtiger@1.1.0
# or
yarn add tealtiger@1.1.0
```

### Step 2: Run Existing Tests

Your existing tests should pass without changes:

```bash
npm test
```

### Step 3: Test New Features

```typescript
import { TealOpenAI, TealEngine } from 'tealtiger';

describe('v1.1.0 Migration', () => {
  it('should work with v1.0.x config', async () => {
    const client = new TealOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      guardrails: { piiDetection: { enabled: true } }
    });
    
    const response = await client.chat.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }]
    });
    
    expect(response).toBeDefined();
  });
  
  it('should work with TealEngine', async () => {
    const client = new TealOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      engine: new TealEngine({
        tools: { 'test_tool': { allowed: true } }
      })
    });
    
    const response = await client.chat.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }]
    });
    
    expect(response).toBeDefined();
    expect(response.metadata?.engine).toBeDefined();
  });
});
```

---

## Performance Impact

### v1.0.x Baseline

- Average latency: ~850ms (OpenAI API)
- SDK overhead: ~5ms
- Total: ~855ms

### v1.1.0 with All Components

- Average latency: ~850ms (OpenAI API)
- SDK overhead: ~14.3ms
- Total: ~864ms (+1.7%)

**Impact**: Minimal (<2% increase) for comprehensive security and monitoring.

---

## Troubleshooting

### Issue: TypeScript Errors

**Problem**: TypeScript complains about new types

**Solution**: Update TypeScript to v5.0+
```bash
npm install -D typescript@^5.0.0
```

### Issue: Import Errors

**Problem**: Cannot import new components

**Solution**: Clear node_modules and reinstall
```bash
rm -rf node_modules package-lock.json
npm install
```

### Issue: Performance Degradation

**Problem**: Requests are slower after migration

**Solution**: Enable caching in TealEngine
```typescript
const engine = new TealEngine({
  // ... policies
}, {
  cacheEnabled: true,
  cacheTTL: 300 // 5 minutes
});
```

### Issue: Memory Usage Increased

**Problem**: Application uses more memory

**Solution**: Configure cleanup intervals
```typescript
const monitor = new TealMonitor({
  historySize: 1000, // Reduce from default
  cleanupInterval: 30000 // 30 seconds
});
```

---

## Rollback Plan

If you need to rollback to v1.0.x:

### Step 1: Reinstall v1.0.x

```bash
npm install tealtiger@1.0.2
```

### Step 2: Remove v1.1.0 Imports

```typescript
// Remove these imports
import { TealEngine, TealMonitor, TealCircuit, TealAudit } from 'tealtiger';

// Keep only v1.0.x imports
import { TealOpenAI } from 'tealtiger';
```

### Step 3: Remove v1.1.0 Configuration

```typescript
// Remove v1.1.0 config
const client = new TealOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  // Remove: engine, monitor, circuit, audit
  
  // Keep v1.0.x config
  guardrails: { /* ... */ },
  costTracking: { /* ... */ }
});
```

---

## Support

### Documentation

- [TealEngine Guide](./tealengine-guide.md)
- [TealMonitor Guide](./tealmonitor-guide.md)
- [TealCircuit Guide](./tealcircuit-guide.md)
- [TealAudit Guide](./tealaudit-guide.md)
- [Policy Reference](./policy-reference.md)

### Community

- GitHub Issues: https://github.com/agentguard-ai/tealtiger/issues
- Discussions: https://github.com/agentguard-ai/tealtiger/discussions
- Discord: https://discord.gg/tealtiger

### Professional Support

For enterprise support, contact: support@tealtiger.ai

---

## Next Steps

1. ✅ Install v1.1.0
2. ✅ Test with existing config (no changes)
3. ✅ Add TealEngine for policy management
4. ✅ Add TealMonitor for anomaly detection
5. ✅ Add TealCircuit for resilience
6. ✅ Add TealAudit for compliance
7. ✅ Review OWASP coverage improvements
8. ✅ Update documentation

---

**Migration Support**: This guide covers all common scenarios. For specific questions, open a GitHub issue or join our Discord.

**Last Updated**: February 12, 2026  
**Version**: 1.1.0  
**Compatibility**: Fully backward compatible with v1.0.x
