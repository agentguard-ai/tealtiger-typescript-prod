/**
 * TealMultiProvider - Multi-Provider Orchestrator
 * 
 * Manages multiple LLM provider clients with routing, failover, and aggregation
 */

import { TealOpenAI } from './TealOpenAI';
import { TealAnthropic } from './TealAnthropic';
import { GuardrailEngineResult } from '../guardrails';
import { CostRecord } from '../cost/types';
import { BudgetEnforcementResult } from '../cost/BudgetManager';

/**
 * Supported provider types
 */
export type ProviderType = 
  | 'openai' 
  | 'anthropic' 
  | 'gemini' 
  | 'bedrock' 
  | 'azure-openai' 
  | 'cohere' 
  | 'mistral';

/**
 * Provider client union type
 */
export type ProviderClient = 
  | TealOpenAI 
  | TealAnthropic 
  | any; // Extended for other providers

/**
 * Provider configuration
 */
export interface ProviderConfig {
  /** Provider type */
  type: ProviderType;
  /** Provider name/identifier */
  name: string;
  /** Provider client instance */
  client: ProviderClient;
  /** Priority for routing (higher = preferred) */
  priority?: number;
  /** Enabled status */
  enabled?: boolean;
  /** Use cases this provider is optimized for */
  useCases?: string[];
  /** Cost weight for load balancing (lower = cheaper) */
  costWeight?: number;
}

/**
 * Routing strategy
 */
export type RoutingStrategy = 
  | 'priority'      // Use highest priority provider
  | 'round-robin'   // Rotate through providers
  | 'cost'          // Use cheapest provider
  | 'use-case'      // Route by use case
  | 'custom';       // Custom routing function

/**
 * Request context for routing
 */
export interface RequestContext {
  /** Use case identifier */
  useCase?: string;
  /** Model preference */
  model?: string;
  /** Cost sensitivity (0-1, higher = more cost-sensitive) */
  costSensitivity?: number;
  /** Custom routing metadata */
  metadata?: Record<string, any>;
}

/**
 * Multi-provider response
 */
export interface MultiProviderResponse {
  /** Provider that handled the request */
  provider: string;
  /** Provider type */
  providerType: ProviderType;
  /** Actual response from provider */
  response: any;
  /** Security metadata */
  security?: {
    guardrailResult?: GuardrailEngineResult;
    costRecord?: CostRecord;
    budgetCheck?: BudgetEnforcementResult;
  };
  /** Failover information (if applicable) */
  failover?: {
    attempted: string[];
    reason: string;
  };
}

/**
 * Aggregated metrics across providers
 */
export interface AggregatedMetrics {
  /** Total requests per provider */
  requestsByProvider: Record<string, number>;
  /** Total cost per provider */
  costByProvider: Record<string, number>;
  /** Success rate per provider */
  successRateByProvider: Record<string, number>;
  /** Average latency per provider */
  latencyByProvider: Record<string, number>;
  /** Total requests */
  totalRequests: number;
  /** Total cost */
  totalCost: number;
}

/**
 * TealMultiProvider configuration
 */
export interface TealMultiProviderConfig {
  /** Routing strategy */
  strategy?: RoutingStrategy;
  /** Custom routing function (required if strategy is 'custom') */
  customRouter?: (context: RequestContext, providers: ProviderConfig[]) => ProviderConfig;
  /** Enable failover */
  enableFailover?: boolean;
  /** Maximum failover attempts */
  maxFailoverAttempts?: number;
  /** Enable metrics aggregation */
  enableMetrics?: boolean;
  /** Enable unified audit logging */
  enableAuditLog?: boolean;
}

/**
 * TealMultiProvider - Multi-Provider Orchestrator
 */
export class TealMultiProvider {
  private providers: Map<string, ProviderConfig> = new Map();
  private config: Required<TealMultiProviderConfig>;
  private metrics: AggregatedMetrics;
  private roundRobinIndex: number = 0;

  constructor(config: TealMultiProviderConfig = {}) {
    this.config = {
      strategy: config.strategy || 'priority',
      customRouter: config.customRouter || (() => { throw new Error('Custom router not provided'); }),
      enableFailover: config.enableFailover !== false,
      maxFailoverAttempts: config.maxFailoverAttempts || 3,
      enableMetrics: config.enableMetrics !== false,
      enableAuditLog: config.enableAuditLog !== false,
    };

    this.metrics = {
      requestsByProvider: {},
      costByProvider: {},
      successRateByProvider: {},
      latencyByProvider: {},
      totalRequests: 0,
      totalCost: 0,
    };
  }

  /**
   * Register a provider
   */
  registerProvider(config: ProviderConfig): void {
    const providerConfig: ProviderConfig = {
      ...config,
      priority: config.priority || 0,
      enabled: config.enabled !== false,
      useCases: config.useCases || [],
      costWeight: config.costWeight || 1.0,
    };

    this.providers.set(config.name, providerConfig);

    // Initialize metrics
    if (this.config.enableMetrics) {
      this.metrics.requestsByProvider[config.name] = 0;
      this.metrics.costByProvider[config.name] = 0;
      this.metrics.successRateByProvider[config.name] = 1.0;
      this.metrics.latencyByProvider[config.name] = 0;
    }
  }

  /**
   * Unregister a provider
   */
  unregisterProvider(name: string): void {
    this.providers.delete(name);
  }

  /**
   * Get all registered providers
   */
  getProviders(): ProviderConfig[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get enabled providers
   */
  getEnabledProviders(): ProviderConfig[] {
    return this.getProviders().filter(p => p.enabled);
  }

  /**
   * Route request to appropriate provider
   */
  private routeRequest(context: RequestContext): ProviderConfig {
    const enabledProviders = this.getEnabledProviders();

    if (enabledProviders.length === 0) {
      throw new Error('No enabled providers available');
    }

    switch (this.config.strategy) {
      case 'priority':
        return this.routeByPriority(enabledProviders);
      
      case 'round-robin':
        return this.routeRoundRobin(enabledProviders);
      
      case 'cost':
        return this.routeByCost(enabledProviders);
      
      case 'use-case':
        return this.routeByUseCase(context, enabledProviders);
      
      case 'custom':
        return this.config.customRouter(context, enabledProviders);
      
      default:
        return enabledProviders[0];
    }
  }

  /**
   * Route by priority (highest first)
   */
  private routeByPriority(providers: ProviderConfig[]): ProviderConfig {
    return providers.sort((a, b) => (b.priority || 0) - (a.priority || 0))[0];
  }

  /**
   * Route round-robin
   */
  private routeRoundRobin(providers: ProviderConfig[]): ProviderConfig {
    const provider = providers[this.roundRobinIndex % providers.length];
    this.roundRobinIndex++;
    return provider;
  }

  /**
   * Route by cost (cheapest first)
   */
  private routeByCost(providers: ProviderConfig[]): ProviderConfig {
    return providers.sort((a, b) => (a.costWeight || 1) - (b.costWeight || 1))[0];
  }

  /**
   * Route by use case
   */
  private routeByUseCase(context: RequestContext, providers: ProviderConfig[]): ProviderConfig {
    if (!context.useCase) {
      return this.routeByPriority(providers);
    }

    // Find providers that support this use case
    const matchingProviders = providers.filter(p => 
      p.useCases && p.useCases.includes(context.useCase!)
    );

    if (matchingProviders.length === 0) {
      return this.routeByPriority(providers);
    }

    return this.routeByPriority(matchingProviders);
  }

  /**
   * Execute request with routing and failover
   */
  async execute(
    method: string,
    params: any,
    context: RequestContext = {}
  ): Promise<MultiProviderResponse> {
    const startTime = Date.now();
    const attemptedProviders: string[] = [];
    let lastError: Error | null = null;

    // Route to initial provider
    let provider = this.routeRequest(context);
    attemptedProviders.push(provider.name);

    // Try primary provider
    try {
      const response = await this.executeOnProvider(provider, method, params);
      this.recordSuccess(provider.name, Date.now() - startTime, response);
      
      return {
        provider: provider.name,
        providerType: provider.type,
        response,
        security: response.security,
      };
    } catch (error) {
      lastError = error as Error;
      this.recordFailure(provider.name);
    }

    // Failover logic
    if (this.config.enableFailover) {
      const remainingProviders = this.getEnabledProviders()
        .filter(p => !attemptedProviders.includes(p.name))
        .slice(0, this.config.maxFailoverAttempts - 1);

      for (const fallbackProvider of remainingProviders) {
        attemptedProviders.push(fallbackProvider.name);

        try {
          const response = await this.executeOnProvider(fallbackProvider, method, params);
          this.recordSuccess(fallbackProvider.name, Date.now() - startTime, response);
          
          return {
            provider: fallbackProvider.name,
            providerType: fallbackProvider.type,
            response,
            security: response.security,
            failover: {
              attempted: attemptedProviders,
              reason: lastError?.message || 'Unknown error',
            },
          };
        } catch (error) {
          lastError = error as Error;
          this.recordFailure(fallbackProvider.name);
        }
      }
    }

    // All providers failed
    throw new Error(
      `All providers failed. Attempted: ${attemptedProviders.join(', ')}. Last error: ${lastError?.message}`
    );
  }

  /**
   * Execute request on specific provider
   */
  private async executeOnProvider(
    provider: ProviderConfig,
    method: string,
    params: any
  ): Promise<any> {
    const client = provider.client;

    // Handle different provider types
    switch (provider.type) {
      case 'openai':
      case 'azure-openai':
      case 'mistral':
        if (method === 'chat') {
          return await client.chat.completions.create(params);
        }
        break;

      case 'anthropic':
        if (method === 'chat') {
          return await client.messages.create(params);
        }
        break;

      case 'gemini':
        if (method === 'generateContent') {
          return await client.generateContent(params);
        }
        break;

      case 'bedrock':
        if (method === 'invokeModel') {
          return await client.invokeModel(params);
        }
        break;

      case 'cohere':
        if (method === 'chat') {
          return await client.chat(params);
        }
        break;

      default:
        throw new Error(`Unsupported provider type: ${provider.type}`);
    }

    throw new Error(`Unsupported method: ${method} for provider: ${provider.type}`);
  }

  /**
   * Record successful request
   */
  private recordSuccess(providerName: string, latency: number, response: any): void {
    if (!this.config.enableMetrics) return;

    this.metrics.requestsByProvider[providerName] = 
      (this.metrics.requestsByProvider[providerName] || 0) + 1;
    
    this.metrics.totalRequests++;

    // Update latency (moving average)
    const currentLatency = this.metrics.latencyByProvider[providerName] || 0;
    const requestCount = this.metrics.requestsByProvider[providerName];
    this.metrics.latencyByProvider[providerName] = 
      (currentLatency * (requestCount - 1) + latency) / requestCount;

    // Update cost if available
    if (response.security?.costRecord) {
      const cost = response.security.costRecord.actualCost;
      this.metrics.costByProvider[providerName] = 
        (this.metrics.costByProvider[providerName] || 0) + cost;
      this.metrics.totalCost += cost;
    }
  }

  /**
   * Record failed request
   */
  private recordFailure(providerName: string): void {
    if (!this.config.enableMetrics) return;

    this.metrics.requestsByProvider[providerName] = 
      (this.metrics.requestsByProvider[providerName] || 0) + 1;
    
    this.metrics.totalRequests++;

    // Update success rate
    const totalRequests = this.metrics.requestsByProvider[providerName];
    const currentSuccessRate = this.metrics.successRateByProvider[providerName] || 1.0;
    const successfulRequests = Math.floor(currentSuccessRate * (totalRequests - 1));
    this.metrics.successRateByProvider[providerName] = successfulRequests / totalRequests;
  }

  /**
   * Get aggregated metrics
   */
  getMetrics(): AggregatedMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      requestsByProvider: {},
      costByProvider: {},
      successRateByProvider: {},
      latencyByProvider: {},
      totalRequests: 0,
      totalCost: 0,
    };

    // Reinitialize provider metrics
    for (const provider of this.providers.values()) {
      this.metrics.requestsByProvider[provider.name] = 0;
      this.metrics.costByProvider[provider.name] = 0;
      this.metrics.successRateByProvider[provider.name] = 1.0;
      this.metrics.latencyByProvider[provider.name] = 0;
    }
  }

  /**
   * Get configuration
   */
  getConfig(): TealMultiProviderConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<TealMultiProviderConfig>): void {
    this.config = { ...this.config, ...updates } as Required<TealMultiProviderConfig>;
  }
}

/**
 * Create a TealMultiProvider instance
 */
export function createTealMultiProvider(config?: TealMultiProviderConfig): TealMultiProvider {
  return new TealMultiProvider(config);
}
