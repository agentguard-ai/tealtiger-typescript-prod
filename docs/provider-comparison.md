# TealTiger Provider Comparison Matrix

## Overview

TealTiger v1.1.0 supports 7 major LLM providers, covering 95%+ of the market. This document provides a comprehensive comparison to help you choose the right provider for your use case.

## Quick Comparison

| Provider | Client | Market Share | Best For | Data Residency | Pricing |
|----------|--------|--------------|----------|----------------|---------|
| **OpenAI** | `TealOpenAI` | ~40% | General purpose, latest models | US | $$$ |
| **Anthropic** | `TealAnthropic` | ~15% | Safety, long context | US | $$$ |
| **Google** | `TealGemini` | ~20% | Multimodal, free tier | Global | $$ |
| **AWS** | `TealBedrock` | ~10% | Enterprise, multi-model | Regional | $$ |
| **Azure** | `TealAzureOpenAI` | ~8% | Microsoft ecosystem | Global | $$$ |
| **Mistral** | `TealMistral` | ~5% | EU compliance, open source | EU | $ |
| **Cohere** | `TealCohere` | ~2% | RAG, embeddings | Global | $$ |

## Detailed Comparison

### OpenAI (TealOpenAI)

**Models:**
- GPT-4 Turbo (128k context)
- GPT-4 (8k/32k context)
- GPT-3.5 Turbo (16k context)

**Strengths:**
- Industry-leading model quality
- Extensive ecosystem and tooling
- Regular model updates
- Strong function calling support

**Limitations:**
- Higher cost
- US-only data processing
- Rate limits on free tier

**Best For:**
- Production applications requiring highest quality
- Complex reasoning tasks
- Function calling and tool use

**Pricing (per 1M tokens):**
- GPT-4 Turbo: $10 input / $30 output
- GPT-4: $30 input / $60 output
- GPT-3.5 Turbo: $0.50 input / $1.50 output

---

### Anthropic (TealAnthropic)

**Models:**
- Claude 3 Opus (200k context)
- Claude 3 Sonnet (200k context)
- Claude 3 Haiku (200k context)
- Claude 2.1 (200k context)

**Strengths:**
- Exceptional safety and alignment
- Very long context windows (200k)
- Strong reasoning capabilities
- Constitutional AI approach

**Limitations:**
- Smaller ecosystem than OpenAI
- Limited availability in some regions
- No embeddings API

**Best For:**
- Safety-critical applications
- Long document analysis
- Ethical AI requirements
- Research and analysis

**Pricing (per 1M tokens):**
- Claude 3 Opus: $15 input / $75 output
- Claude 3 Sonnet: $3 input / $15 output
- Claude 3 Haiku: $0.25 input / $1.25 output

---

### Google Gemini (TealGemini)

**Models:**
- Gemini Ultra (multimodal)
- Gemini Pro (multimodal)
- Gemini Pro Vision (image understanding)

**Strengths:**
- Native multimodal support (text + images)
- Generous free tier
- Google infrastructure
- Safety settings built-in

**Limitations:**
- Newer ecosystem
- Limited third-party integrations
- API still evolving

**Best For:**
- Multimodal applications
- Cost-sensitive projects
- Image analysis
- Prototyping and development

**Pricing (per 1M tokens):**
- Gemini Pro: $0.50 input / $1.50 output
- Gemini Pro Vision: $0.50 input / $1.50 output
- Free tier: 60 requests/minute

---

### AWS Bedrock (TealBedrock)

**Models:**
- Anthropic Claude (2, Instant)
- Amazon Titan (Text, Embeddings)
- AI21 Jurassic-2 (Ultra, Mid)
- Cohere Command (Text, Light)
- Meta Llama 2 (13B, 70B)

**Strengths:**
- Multiple model providers in one API
- AWS infrastructure integration
- Regional deployment options
- Enterprise security and compliance

**Limitations:**
- AWS account required
- More complex setup
- Regional availability varies
- Model selection can be overwhelming

**Best For:**
- AWS-native applications
- Enterprise deployments
- Multi-model strategies
- Regulated industries

**Pricing:**
- Varies by model and region
- Claude: $8-$24 per 1M tokens
- Titan: $0.30-$1.20 per 1M tokens
- Llama 2: $0.75-$1.00 per 1M tokens

---

### Azure OpenAI (TealAzureOpenAI)

**Models:**
- GPT-4 (all variants)
- GPT-3.5 Turbo (all variants)
- Embeddings models

**Strengths:**
- Microsoft ecosystem integration
- Azure AD authentication
- Enterprise SLAs
- Global deployment options
- HIPAA/SOC2 compliance

**Limitations:**
- Requires Azure subscription
- Deployment-based model access
- Approval process for GPT-4
- More complex configuration

**Best For:**
- Microsoft-centric organizations
- Enterprise compliance requirements
- Azure-native applications
- Government and healthcare

**Pricing:**
- Same as OpenAI pricing
- Additional Azure infrastructure costs
- Enterprise agreements available

---

### Mistral AI (TealMistral)

**Models:**
- Mistral Large (flagship)
- Mistral Medium (balanced)
- Mistral Small (efficient)
- Mixtral 8x7B (open source)
- Mistral Tiny (ultra-efficient)

**Strengths:**
- European data residency (GDPR compliant)
- Open-source models available
- Competitive pricing
- Strong multilingual support
- No US data transfer

**Limitations:**
- Smaller ecosystem
- Newer company
- Limited enterprise features
- Fewer integrations

**Best For:**
- European organizations
- GDPR compliance requirements
- Cost-sensitive applications
- Open-source preference

**Pricing (per 1M tokens, EUR converted to USD):**
- Mistral Large: $4.40 input / $13.20 output
- Mistral Medium: $2.97 input / $8.91 output
- Mistral Small: $1.10 input / $3.30 output
- Mixtral 8x7B: $0.77 input / $0.77 output

---

### Cohere (TealCohere)

**Models:**
- Command (chat)
- Command Light (efficient chat)
- Embed (embeddings)

**Strengths:**
- Excellent RAG capabilities
- Built-in web search connectors
- Citation tracking
- High-quality embeddings
- Enterprise focus

**Limitations:**
- Smaller model selection
- Less general-purpose than competitors
- Higher learning curve for RAG features

**Best For:**
- RAG applications
- Search and retrieval
- Enterprise knowledge bases
- Document Q&A systems

**Pricing (per 1M tokens):**
- Command: $1.00 input / $2.00 output
- Command Light: $0.30 input / $0.60 output
- Embed: $0.10 per 1M tokens

---

## Feature Comparison

| Feature | OpenAI | Anthropic | Gemini | Bedrock | Azure | Mistral | Cohere |
|---------|--------|-----------|--------|---------|-------|---------|--------|
| **Chat Completion** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Streaming** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Function Calling** | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | ❌ |
| **Embeddings** | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Multimodal** | ⚠️ | ⚠️ | ✅ | ⚠️ | ⚠️ | ❌ | ❌ |
| **RAG Support** | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| **Citations** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Web Search** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Max Context** | 128k | 200k | 32k | 200k | 128k | 32k | 4k |
| **Free Tier** | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |

Legend: ✅ Full Support | ⚠️ Partial Support | ❌ Not Available

---

## Use Case Recommendations

### General Purpose Applications
**Recommended:** OpenAI (TealOpenAI) or Anthropic (TealAnthropic)
- Best overall quality
- Most reliable
- Extensive ecosystem

### Cost-Sensitive Projects
**Recommended:** Mistral (TealMistral) or Gemini (TealGemini)
- Competitive pricing
- Good quality-to-cost ratio
- Free tiers available

### Enterprise Deployments
**Recommended:** Azure OpenAI (TealAzureOpenAI) or Bedrock (TealBedrock)
- Enterprise SLAs
- Compliance certifications
- Infrastructure integration

### European/GDPR Compliance
**Recommended:** Mistral (TealMistral)
- EU data residency
- GDPR compliant
- No US data transfer

### RAG Applications
**Recommended:** Cohere (TealCohere)
- Built-in RAG features
- Citation tracking
- Web search connectors

### Multimodal Applications
**Recommended:** Gemini (TealGemini)
- Native multimodal support
- Image understanding
- Cost-effective

### Long Context Tasks
**Recommended:** Anthropic (TealAnthropic) or Bedrock Claude (TealBedrock)
- 200k context window
- Excellent long-document handling
- Strong reasoning

---

## Multi-Provider Strategy

### Why Use Multiple Providers?

1. **High Availability**: Automatic failover if primary provider fails
2. **Cost Optimization**: Route requests to cheapest suitable provider
3. **Feature Access**: Use best provider for each use case
4. **Risk Mitigation**: Avoid vendor lock-in

### Example Multi-Provider Setup

```typescript
import { TealMultiProvider, TealOpenAI, TealAnthropic, TealGemini } from 'tealtiger';

const multiProvider = new TealMultiProvider({
  strategy: 'priority',
  enableFailover: true,
  maxFailoverAttempts: 3
});

// Primary: OpenAI for quality
multiProvider.registerProvider({
  type: 'openai',
  name: 'openai-primary',
  client: new TealOpenAI({ apiKey: process.env.OPENAI_API_KEY }),
  priority: 1
});

// Backup: Anthropic for reliability
multiProvider.registerProvider({
  type: 'anthropic',
  name: 'anthropic-backup',
  client: new TealAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
  priority: 2
});

// Cost-effective: Gemini for high-volume
multiProvider.registerProvider({
  type: 'gemini',
  name: 'gemini-cost-effective',
  client: new TealGemini({ apiKey: process.env.GOOGLE_API_KEY }),
  priority: 3,
  useCases: ['high-volume', 'non-critical']
});
```

---

## Migration Guide

### From OpenAI to TealTiger

```typescript
// Before
import OpenAI from 'openai';
const client = new OpenAI({ apiKey: 'key' });

// After
import { TealOpenAI } from 'tealtiger';
const client = new TealOpenAI({ apiKey: 'key' });
// Same API, added security!
```

### From Anthropic to TealTiger

```typescript
// Before
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic({ apiKey: 'key' });

// After
import { TealAnthropic } from 'tealtiger';
const client = new TealAnthropic({ apiKey: 'key' });
// Same API, added security!
```

### Adding Multiple Providers

```typescript
import { TealOpenAI, TealAnthropic, TealGemini } from 'tealtiger';

// Use different providers for different tasks
const openai = new TealOpenAI({ apiKey: 'key' });
const anthropic = new TealAnthropic({ apiKey: 'key' });
const gemini = new TealGemini({ apiKey: 'key' });

// Or use multi-provider orchestration
const multi = new TealMultiProvider({ strategy: 'cost' });
```

---

## Cost Comparison Tool

TealTiger includes a built-in cost comparison utility:

```typescript
import { CostCalculator } from 'tealtiger';

const calculator = new CostCalculator();

const comparison = calculator.compareProviders(
  { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
  [
    { model: 'gpt-4', provider: 'openai' },
    { model: 'claude-3-opus', provider: 'anthropic' },
    { model: 'gemini-pro', provider: 'google' },
    { model: 'mistral-large-latest', provider: 'mistral' }
  ]
);

console.log('Cheapest:', comparison.cheapest);
console.log('Most Expensive:', comparison.mostExpensive);
console.log('Potential Savings:', comparison.savings);
```

---

## Support Matrix

| Provider | TealTiger Support | Status | Documentation |
|----------|------------------|--------|---------------|
| OpenAI | ✅ Full | Stable | [Docs](../README.md#tealOpenAI) |
| Anthropic | ✅ Full | Stable | [Docs](../README.md#tealAnthropic) |
| Google Gemini | ✅ Full | Stable | [Examples](../../examples/gemini-basic.ts) |
| AWS Bedrock | ✅ Full | Stable | [Examples](../../examples/bedrock-basic.ts) |
| Azure OpenAI | ✅ Full | Stable | [Examples](../../examples/azure-openai-basic.ts) |
| Mistral AI | ✅ Full | Stable | [Examples](../../examples/mistral-basic.ts) |
| Cohere | ✅ Full | Stable | [Examples](../../examples/cohere-basic.ts) |

---

## Frequently Asked Questions

### Can I use multiple providers simultaneously?
Yes! Use `TealMultiProvider` for automatic routing, failover, and load balancing.

### Do all providers support the same features?
No. See the Feature Comparison table above for details.

### Which provider is cheapest?
Mistral and Gemini offer the most competitive pricing. Use `CostCalculator` for specific comparisons.

### Which provider is best for production?
OpenAI and Anthropic offer the most mature, reliable services. Azure OpenAI adds enterprise SLAs.

### Can I switch providers without code changes?
Yes, if using `TealMultiProvider`. Individual clients have provider-specific features.

### Do I need accounts with all providers?
No, only register providers you want to use. Start with one and add more as needed.

---

## Next Steps

1. **Choose Your Provider**: Review the comparison above
2. **Install TealTiger**: `npm install tealtiger`
3. **Try Examples**: Check the [examples](../../examples/) directory
4. **Read Documentation**: See the [main README](../README.md)
5. **Join Community**: [GitHub Discussions](https://github.com/agentguard-ai/tealtiger/discussions)

---

**Last Updated**: February 11, 2026  
**TealTiger Version**: v1.1.0
