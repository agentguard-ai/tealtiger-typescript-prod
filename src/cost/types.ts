/**
 * Cost Tracking Types
 * 
 * Type definitions for cost monitoring and budget enforcement
 */

/**
 * Supported AI model providers
 */
export type ModelProvider =
  | 'openai'
  | 'anthropic'
  | 'azure-openai'
  | 'google'
  | 'cohere'
  | 'groq'
  | 'deepseek'
  | 'together'
  | 'hf-tgi'
  | 'xai'
  | 'custom';

/**
 * Pricing information for a specific model
 */
export interface ModelPricing {
  /** Model identifier (e.g., 'gpt-4', 'claude-3-opus') */
  model: string;
  /** Provider name */
  provider: ModelProvider;
  /** Cost per 1K input tokens in USD */
  inputCostPer1K: number;
  /** Cost per 1K output tokens in USD */
  outputCostPer1K: number;
  /** Optional: Cost per image for vision models */
  imageCost?: number;
  /** Optional: Cost per audio second for audio models */
  audioCostPerSecond?: number;
  /** Last updated timestamp */
  lastUpdated: string;
}

/**
 * Token usage information
 */
export interface TokenUsage {
  /** Number of input/prompt tokens */
  inputTokens: number;
  /** Number of output/completion tokens */
  outputTokens: number;
  /** Total tokens (input + output) */
  totalTokens: number;
  /** Optional: Number of images processed */
  images?: number;
  /** Optional: Audio duration in seconds */
  audioDuration?: number;
}

/**
 * Cost estimation result
 */
export interface CostEstimate {
  /** Estimated cost in USD */
  estimatedCost: number;
  /** Model used for estimation */
  model: string;
  /** Provider name */
  provider: ModelProvider;
  /** Estimated token usage */
  estimatedTokens: TokenUsage;
  /** Breakdown of costs */
  breakdown: {
    inputCost: number;
    outputCost: number;
    imageCost?: number;
    audioCost?: number;
  };
  /** Timestamp of estimation */
  timestamp: string;
}

/**
 * Actual cost calculation result
 */
export interface CostRecord {
  /** Unique identifier for this cost record */
  id: string;
  /** Request ID that generated this cost */
  requestId: string;
  /** Agent ID */
  agentId: string;
  /** Model used */
  model: string;
  /** Provider name */
  provider: ModelProvider;
  /** Actual token usage */
  actualTokens: TokenUsage;
  /** Actual cost in USD */
  actualCost: number;
  /** Cost breakdown */
  breakdown: {
    inputCost: number;
    outputCost: number;
    imageCost?: number;
    audioCost?: number;
  };
  /** Timestamp when cost was recorded */
  timestamp: string;
  /** Optional: Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Budget configuration
 */
export interface BudgetConfig {
  /** Unique budget identifier */
  id: string;
  /** Budget name */
  name: string;
  /** Maximum allowed cost in USD */
  limit: number;
  /** Time period for budget */
  period: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'total';
  /** Alert thresholds (percentage of limit) */
  alertThresholds: number[]; // e.g., [50, 75, 90, 100]
  /** Action to take when limit exceeded */
  action: 'alert' | 'block' | 'throttle';
  /** Optional: Scope (agent, project, organization) */
  scope?: {
    type: 'agent' | 'project' | 'organization';
    id: string;
  };
  /** Whether budget is active */
  enabled: boolean;
  /** Creation timestamp */
  createdAt: string;
  /** Last updated timestamp */
  updatedAt: string;
}

/**
 * Budget status
 */
export interface BudgetStatus {
  /** Budget configuration */
  budget: BudgetConfig;
  /** Current spending in USD */
  currentSpending: number;
  /** Remaining budget in USD */
  remaining: number;
  /** Percentage of budget used */
  percentageUsed: number;
  /** Whether budget limit is exceeded */
  isExceeded: boolean;
  /** Active alerts */
  activeAlerts: number[];
  /** Period start time */
  periodStart: string;
  /** Period end time */
  periodEnd: string;
  /** Last updated timestamp */
  lastUpdated: string;
}

/**
 * Cost alert
 */
export interface CostAlert {
  /** Alert ID */
  id: string;
  /** Budget ID that triggered alert */
  budgetId: string;
  /** Alert threshold percentage */
  threshold: number;
  /** Current spending */
  currentSpending: number;
  /** Budget limit */
  limit: number;
  /** Alert message */
  message: string;
  /** Alert severity */
  severity: 'info' | 'warning' | 'critical';
  /** Timestamp when alert was triggered */
  timestamp: string;
  /** Whether alert has been acknowledged */
  acknowledged: boolean;
}

/**
 * Cost summary for analytics
 */
export interface CostSummary {
  /** Total cost in USD */
  totalCost: number;
  /** Total requests */
  totalRequests: number;
  /** Average cost per request */
  averageCostPerRequest: number;
  /** Cost breakdown by model */
  byModel: Record<string, number>;
  /** Cost breakdown by provider */
  byProvider: Record<ModelProvider, number>;
  /** Cost breakdown by agent */
  byAgent: Record<string, number>;
  /** Time period */
  period: {
    start: string;
    end: string;
  };
  /** Total tokens used */
  totalTokens: {
    input: number;
    output: number;
    total: number;
  };
}

/**
 * Cost tracker configuration
 */
export interface CostTrackerConfig {
  /** Whether cost tracking is enabled */
  enabled: boolean;
  /** Whether to store cost records */
  persistRecords: boolean;
  /** Custom pricing overrides */
  customPricing?: Record<string, Partial<ModelPricing>>;
  /** Default provider if not specified */
  defaultProvider?: ModelProvider;
  /** Whether to enable budget enforcement */
  enableBudgets: boolean;
  /** Whether to send alerts */
  enableAlerts: boolean;
}
