/**
 * Security Sidecar Agent (SSA) HTTP Client
 * 
 * @internal Internal HTTP client for communicating with the Security Sidecar Agent.
 * Consumers should use TealTiger or the integrated provider clients instead.
 * This class handles all HTTP communication with the Security Sidecar Agent.
 */

import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import {
  TealTigerConfig,
  SecurityEvaluationResponse,
  ToolExecutionRequest,
  AuditTrailResponse,
  PolicyValidationResult,
  SecurityPolicy,
  TealTigerError,
  TealTigerErrorCode
} from '../types';
import { TealTigerConfigError, TealTigerNetworkError, TealTigerServerError } from '../utils/errors';

/**
 * HTTP client for communicating with the Security Sidecar Agent
 */
export class SSAClient {
  private readonly httpClient: AxiosInstance;
  private readonly config: TealTigerConfig;

  constructor(config: TealTigerConfig) {
    this.config = config;
    
    // Create axios instance with default configuration
    this.httpClient = axios.create({
      baseURL: config.ssaUrl,
      timeout: config.timeout || 5000,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.apiKey,
        'User-Agent': 'TealTiger-SDK/0.1.0',
        ...config.headers
      }
    });

    // Add request interceptor for debugging
    if (config.debug) {
      this.httpClient.interceptors.request.use(
        (request) => {
          console.log(`[TealTiger SDK] Request: ${request.method?.toUpperCase()} ${request.url}`);
          console.log(`[TealTiger SDK] Headers:`, request.headers);
          if (request.data) {
            console.log(`[TealTiger SDK] Body:`, request.data);
          }
          return request;
        },
        (error) => {
          console.error('[TealTiger SDK] Request Error:', error);
          return Promise.reject(error);
        }
      );
    }

    // Add response interceptor for debugging and error handling
    this.httpClient.interceptors.response.use(
      (response) => {
        if (this.config.debug) {
          console.log(`[TealTiger SDK] Response: ${response.status} ${response.statusText}`);
          console.log(`[TealTiger SDK] Data:`, response.data);
        }
        return response;
      },
      (error: AxiosError) => {
        if (this.config.debug) {
          console.error('[TealTiger SDK] Response Error:', error.message);
        }
        return Promise.reject(this.handleHttpError(error));
      }
    );
  }

  /**
   * Check if the SSA service is healthy
   */
  async healthCheck(): Promise<{ status: string; service: string; version: string }> {
    try {
      const response = await this.httpClient.get('/health');
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Health check failed');
    }
  }

  /**
   * Evaluate a tool execution request for security
   */
  async evaluateSecurity(request: ToolExecutionRequest): Promise<SecurityEvaluationResponse> {
    try {
      const response: AxiosResponse<SecurityEvaluationResponse> = await this.httpClient.post(
        '/api/security/evaluate',
        request
      );
      
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Security evaluation failed');
    }
  }

  /**
   * Get current security policies
   */
  async getPolicies(): Promise<{ policies: SecurityPolicy[]; version: string; count: number }> {
    try {
      const response = await this.httpClient.get('/api/security/policies');
      return response.data.policies;
    } catch (error) {
      throw this.handleError(error, 'Failed to retrieve policies');
    }
  }

  /**
   * Validate security policies
   */
  async validatePolicies(policies: SecurityPolicy[]): Promise<PolicyValidationResult> {
    try {
      const response = await this.httpClient.post('/api/security/policies/validate', {
        policies
      });
      return response.data.validation;
    } catch (error) {
      throw this.handleError(error, 'Policy validation failed');
    }
  }

  /**
   * Get audit trail for an agent
   */
  async getAuditTrail(
    agentId: string, 
    options: { limit?: number; offset?: number } = {}
  ): Promise<AuditTrailResponse> {
    try {
      const params = new URLSearchParams();
      if (options.limit) params.append('limit', options.limit.toString());
      if (options.offset) params.append('offset', options.offset.toString());
      
      const url = `/api/security/audit/${agentId}${params.toString() ? `?${params.toString()}` : ''}`;
      const response: AxiosResponse<AuditTrailResponse> = await this.httpClient.get(url);
      
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to retrieve audit trail');
    }
  }

  /**
   * Handle HTTP errors and convert them to TealTiger errors
   */
  private handleHttpError(error: AxiosError): TealTigerError {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return new TealTigerNetworkError(
        'Unable to connect to Security Sidecar Agent',
        TealTigerErrorCode.CONNECTION_ERROR,
        { ssaUrl: this.config.ssaUrl, originalError: error.message }
      );
    }

    if (error.code === 'ECONNABORTED') {
      return new TealTigerNetworkError(
        'Request timeout',
        TealTigerErrorCode.TIMEOUT_ERROR,
        { timeout: this.config.timeout, originalError: error.message }
      );
    }

    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as any;

      if (status === 401) {
        return new TealTigerConfigError(
          'Authentication failed - invalid API key',
          TealTigerErrorCode.AUTHENTICATION_ERROR,
          { apiKey: this.config.apiKey.substring(0, 10) + '...', response: data }
        );
      }

      if (status === 400) {
        return new TealTigerConfigError(
          'Invalid request format',
          TealTigerErrorCode.VALIDATION_ERROR,
          { response: data }
        );
      }

      if (status >= 500) {
        return new TealTigerServerError(
          'Security Sidecar Agent server error',
          TealTigerErrorCode.SERVER_ERROR,
          { status, response: data }
        );
      }

      return new TealTigerNetworkError(
        `HTTP ${status}: ${error.response.statusText}`,
        TealTigerErrorCode.NETWORK_ERROR,
        { status, response: data }
      );
    }

    return new TealTigerNetworkError(
      'Network error occurred',
      TealTigerErrorCode.NETWORK_ERROR,
      { originalError: error.message }
    );
  }

  /**
   * Generic error handler
   */
  private handleError(error: unknown, context: string): TealTigerError {
    if (error instanceof Error && 'code' in error) {
      return error as TealTigerError;
    }

    if (error instanceof AxiosError) {
      return this.handleHttpError(error);
    }

    return new TealTigerNetworkError(
      `${context}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      TealTigerErrorCode.NETWORK_ERROR,
      { context, originalError: error }
    );
  }

  /**
   * Get client configuration (for debugging)
   */
  getConfig(): Partial<TealTigerConfig> {
    return {
      ssaUrl: this.config.ssaUrl,
      agentId: this.config.agentId,
      timeout: this.config.timeout,
      retries: this.config.retries,
      debug: this.config.debug
    };
  }
}