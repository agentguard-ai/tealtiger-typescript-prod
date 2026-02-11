/**
 * TealCohere - Cohere AI Client with TealTiger Integration
 * 
 * Provides secure access to Cohere AI with full TealTiger integration.
 * Extends TealBaseClient for consistent security and monitoring.
 * 
 * Features:
 * - Chat with RAG (Retrieval-Augmented Generation)
 * - Document-based context
 * - Web search connectors
 * - Embeddings generation
 * - Citation tracking
 * - Full TealTiger component integration
 */

import { TealBaseClient, TealClientConfig, RequestContext } from './base';
import { CohereClient } from 'cohere-ai';

/**
 * Cohere pricing per 1M tokens (USD)
 * Source: https://cohere.com/pricing
 */
export const COHERE_PRICING = {
  // Chat models
  'command': {
    input: 1.00,   // $1 per 1M tokens
    output: 2.00   // $2 per 1M tokens
  },
  'command-light': {
    input: 0.30,   // $0.30 per 1M tokens
    output: 0.60   // $0.60 per 1M tokens
  },
  'command-r': {
    input: 0.50,   // $0.50 per 1M tokens
    output: 1.50   // $1.50 per 1M tokens
  },
  'command-r-plus': {
    input: 3.00,   // $3 per 1M tokens
    output: 15.00  // $15 per 1M tokens
  },
  
  // Embeddings
  'embed-english-v3.0': {
    input: 0.10,   // $0.10 per 1M tokens
    output: 0.00
  },
  'embed-multilingual-v3.0': {
    input: 0.10,   // $0.10 per 1M tokens
    output: 0.00
  },
  'embed-english-light-v3.0': {
    input: 0.10,   // $0.10 per 1M tokens
    output: 0.00
  },
  'embed-multilingual-light-v3.0': {
    input: 0.10,   // $0.10 per 1M tokens
    output: 0.00
  }
} as const;

/**
 * Cohere chat message
 */
export interface CohereChatMessage {
  role: 'USER' | 'CHATBOT' | 'SYSTEM';
  message: string;
}

/**
 * Cohere document for RAG
 */
export interface CohereDocument {
  id?: string;
  text: string;
  title?: string;
  url?: string;
  [key: string]: any;
}

/**
 * Cohere connector for web search
 */
export interface CohereConnector {
  id: string;
  options?: Record<string, any>;
}

/**
 * Cohere chat parameters
 */
export interface CohereChatParams {
  message: string;
  model?: string;
  chatHistory?: CohereChatMessage[];
  documents?: CohereDocument[];
  connectors?: CohereConnector[];
  temperature?: number;
  maxTokens?: number;
  k?: number;
  p?: number;
  stream?: boolean;
  citationQuality?: 'accurate' | 'fast';
}

/**
 * Cohere citation
 */
export interface CohereCitation {
  start: number;
  end: number;
  text: string;
  documentIds: string[];
}

/**
 * Cohere chat response
 */
export interface CohereChatResponse {
  id: string;
  text: string;
  generationId: string;
  chatHistory?: CohereChatMessage[];
  citations?: CohereCitation[];
  documents?: CohereDocument[];
  searchQueries?: Array<{ text: string; generationId: string }>;
  searchResults?: Array<{ searchQuery: any; connector: any; documentIds: string[] }>;
  meta?: {
    apiVersion?: { version: string };
    billedUnits?: { inputTokens: number; outputTokens: number };
  };
  metadata?: Record<string, any>; // TealTiger metadata
}

/**
 * Cohere embed parameters
 */
export interface CohereEmbedParams {
  texts: string[];
  model?: string;
  inputType?: 'search_document' | 'search_query' | 'classification' | 'clustering';
  truncate?: 'NONE' | 'START' | 'END';
}

/**
 * Cohere embed response
 */
export interface CohereEmbedResponse {
  id: string;
  embeddings: number[][];
  texts: string[];
  meta?: {
    apiVersion?: { version: string };
    billedUnits?: { inputTokens: number };
  };
  metadata?: Record<string, any>; // TealTiger metadata
}

/**
 * Configuration for TealCohere
 */
export interface TealCohereConfig extends Omit<TealClientConfig, 'apiKey'> {
  /**
   * Cohere API key
   */
  cohereApiKey: string;
  
  /**
   * Default model to use for chat
   */
  model?: string;
  
  /**
   * Default model to use for embeddings
   */
  embedModel?: string;
}

/**
 * TealCohere Client
 * 
 * Integrates Cohere AI with TealTiger security and monitoring components.
 * Supports chat, RAG, embeddings, and citation tracking.
 * 
 * @example
 * ```typescript
 * const client = new TealCohere({
 *   cohereApiKey: process.env.COHERE_API_KEY!,
 *   model: 'command-r-plus',
 *   policies: {
 *     tools: { 'chat': { allowed: true } },
 *     identity: { agentId: 'cohere-agent', role: 'user' }
 *   }
 * });
 * 
 * // Basic chat
 * const response = await client.chat({
 *   message: 'What is RAG?'
 * });
 * 
 * // Chat with RAG
 * const ragResponse = await client.chat({
 *   message: 'Summarize these documents',
 *   documents: [
 *     { text: 'Document 1 content...', title: 'Doc 1' },
 *     { text: 'Document 2 content...', title: 'Doc 2' }
 *   ]
 * });
 * 
 * console.log(ragResponse.text);
 * console.log('Citations:', ragResponse.citations);
 * console.log('Cost:', ragResponse.metadata?.cost);
 * ```
 */
export class TealCohere extends TealBaseClient {
  private cohereClient: CohereClient;
  private defaultModel?: string;
  private defaultEmbedModel?: string;

  constructor(config: TealCohereConfig) {
    // Convert Cohere config to base config
    super({
      ...config,
      apiKey: config.cohereApiKey
    });
    
    // Handle optional properties explicitly
    if (config.model !== undefined) {
      this.defaultModel = config.model;
    }
    if (config.embedModel !== undefined) {
      this.defaultEmbedModel = config.embedModel;
    }
    
    // Initialize Cohere client
    this.cohereClient = new CohereClient({
      token: config.cohereApiKey
    });
  }

  /**
   * Chat with Cohere (supports RAG)
   * 
   * @param params - Chat parameters
   * @returns Chat response with citations and metadata
   * 
   * @example
   * ```typescript
   * // Basic chat
   * const response = await client.chat({
   *   message: 'Hello!',
   *   model: 'command-r-plus'
   * });
   * 
   * // Chat with documents (RAG)
   * const ragResponse = await client.chat({
   *   message: 'What are the key points?',
   *   documents: [
   *     { text: 'Document content...', title: 'My Doc' }
   *   ],
   *   citationQuality: 'accurate'
   * });
   * 
   * // Chat with web search
   * const searchResponse = await client.chat({
   *   message: 'Latest news about AI?',
   *   connectors: [{ id: 'web-search' }]
   * });
   * ```
   */
  async chat(params: CohereChatParams): Promise<CohereChatResponse> {
    const model = params.model || this.defaultModel || 'command-r-plus';
    
    const context: RequestContext = {
      agentId: this.config.agentId || 'default',
      action: 'chat',
      tool: 'chat',
      model,
      content: params.message,
      metadata: { 
        params,
        hasDocuments: !!params.documents?.length,
        hasConnectors: !!params.connectors?.length
      }
    };

    return this.executeRequest(
      () => this._chat(params),
      context
    );
  }

  /**
   * Generate embeddings
   * 
   * @param params - Embed parameters
   * @returns Embeddings response with metadata
   * 
   * @example
   * ```typescript
   * const response = await client.embed({
   *   texts: ['Hello world', 'Goodbye world'],
   *   model: 'embed-english-v3.0',
   *   inputType: 'search_document'
   * });
   * 
   * console.log('Embeddings:', response.embeddings);
   * console.log('Cost:', response.metadata?.cost);
   * ```
   */
  async embed(params: CohereEmbedParams): Promise<CohereEmbedResponse> {
    const model = params.model || this.defaultEmbedModel || 'embed-english-v3.0';
    
    const context: RequestContext = {
      agentId: this.config.agentId || 'default',
      action: 'embed',
      tool: 'embed',
      model,
      content: params.texts.join('\n'),
      metadata: { 
        params,
        textCount: params.texts.length
      }
    };

    return this.executeRequest(
      () => this._embed(params),
      context
    );
  }

  /**
   * Internal method to call Cohere chat API
   */
  private async _chat(params: CohereChatParams): Promise<CohereChatResponse> {
    const model = params.model || this.defaultModel || 'command-r-plus';
    
    try {
      // Build request params
      const requestParams: any = {
        message: params.message,
        model
      };
      
      if (params.chatHistory !== undefined) requestParams.chatHistory = params.chatHistory;
      if (params.documents !== undefined) requestParams.documents = params.documents;
      if (params.connectors !== undefined) requestParams.connectors = params.connectors;
      if (params.temperature !== undefined) requestParams.temperature = params.temperature;
      if (params.maxTokens !== undefined) requestParams.maxTokens = params.maxTokens;
      if (params.k !== undefined) requestParams.k = params.k;
      if (params.p !== undefined) requestParams.p = params.p;
      if (params.citationQuality !== undefined) requestParams.citationQuality = params.citationQuality;
      
      const result = await this.cohereClient.chat(requestParams);

      // Calculate cost
      const usage = {
        input_tokens: result.meta?.billedUnits?.inputTokens || 0,
        output_tokens: result.meta?.billedUnits?.outputTokens || 0
      };
      const cost = this.calculateCohereCost(model, usage);

      // Build metadata
      const metadata: Record<string, any> = {
        ...this.getComponentMetadata(),
        provider: 'cohere',
        model,
        cost: cost.toFixed(4),
        hasCitations: !!result.citations?.length,
        hasDocuments: !!result.documents?.length,
        hasSearchResults: !!result.searchResults?.length
      };

      // Format response
      return {
        id: result.generationId || 'cohere-' + Date.now(),
        text: result.text,
        generationId: result.generationId || '',
        chatHistory: result.chatHistory,
        citations: result.citations,
        documents: result.documents,
        searchQueries: result.searchQueries,
        searchResults: result.searchResults,
        meta: result.meta,
        metadata
      } as CohereChatResponse;
    } catch (error: any) {
      throw new Error(`Cohere API error: ${error.message}`);
    }
  }

  /**
   * Internal method to call Cohere embed API
   */
  private async _embed(params: CohereEmbedParams): Promise<CohereEmbedResponse> {
    const model = params.model || this.defaultEmbedModel || 'embed-english-v3.0';
    
    try {
      // Build request params
      const requestParams: any = {
        texts: params.texts,
        model
      };
      
      if (params.inputType !== undefined) requestParams.inputType = params.inputType;
      if (params.truncate !== undefined) requestParams.truncate = params.truncate;
      
      const result = await this.cohereClient.embed(requestParams);

      // Calculate cost
      const usage = {
        input_tokens: result.meta?.billedUnits?.inputTokens || 0,
        output_tokens: 0
      };
      const cost = this.calculateCohereCost(model, usage);

      // Build metadata
      const metadata: Record<string, any> = {
        ...this.getComponentMetadata(),
        provider: 'cohere',
        model,
        cost: cost.toFixed(4),
        textCount: params.texts.length
      };

      // Format response
      return {
        id: result.id || 'cohere-embed-' + Date.now(),
        embeddings: result.embeddings,
        texts: params.texts,
        meta: result.meta,
        metadata
      } as CohereEmbedResponse;
    } catch (error: any) {
      throw new Error(`Cohere API error: ${error.message}`);
    }
  }

  /**
   * Calculate cost based on Cohere pricing
   */
  private calculateCohereCost(
    model: string,
    usage: { input_tokens: number; output_tokens: number }
  ): number {
    // Find matching pricing
    const pricing = COHERE_PRICING[model as keyof typeof COHERE_PRICING];
    
    if (!pricing) {
      // Default to command-r-plus pricing if model not found
      const defaultPricing = COHERE_PRICING['command-r-plus'];
      const inputCost = (usage.input_tokens / 1000000) * defaultPricing.input;
      const outputCost = (usage.output_tokens / 1000000) * defaultPricing.output;
      return inputCost + outputCost;
    }

    const inputCost = (usage.input_tokens / 1000000) * pricing.input;
    const outputCost = (usage.output_tokens / 1000000) * pricing.output;

    return inputCost + outputCost;
  }

  /**
   * Get metadata from all components with Cohere-specific info
   */
  protected getComponentMetadata(): Record<string, any> {
    const metadata: Record<string, any> = {
      provider: 'cohere'
    };

    if (this.engine) {
      metadata.policyEvaluation = 'enabled';
    }

    if (this.guard) {
      metadata.guardrailResults = 'enabled';
    }

    if (this.monitor) {
      metadata.monitoringMetrics = 'enabled';
    }

    if (this.circuit) {
      metadata.circuitState = this.circuit.getState();
    }

    return metadata;
  }
}
