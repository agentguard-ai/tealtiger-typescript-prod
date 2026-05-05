import axios, { AxiosError } from 'axios';
import { EvaluateEndpoint, EvaluateRequest, EvaluateResponse } from './types';

/**
 * HTTP implementation calling the real Docker sidecar.
 * Implements retry logic per the error handling spec:
 * - 3 retries with exponential backoff for connection errors
 * - 2 retries for 5xx server errors
 * - No retry for 4xx client errors, timeouts, or malformed JSON
 */
export class HttpEvaluateEndpoint implements EvaluateEndpoint {
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(baseUrl: string, timeout: number = 5000) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeout = timeout;
  }

  async evaluate(request: EvaluateRequest): Promise<EvaluateResponse> {
    const url = `${this.baseUrl}/evaluate`;

    let lastError: Error | undefined;

    // Attempt with retries
    const maxAttempts = 4; // 1 initial + 3 retries for connection errors
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await axios.post<EvaluateResponse>(url, request, {
          timeout: this.timeout,
          headers: { 'Content-Type': 'application/json' },
          validateStatus: () => true, // Handle all status codes manually
        });

        // Handle HTTP status codes
        if (response.status >= 200 && response.status < 300) {
          return this.parseResponse(response.data);
        }

        if (response.status >= 400 && response.status < 500) {
          // 4xx: No retry (client error)
          throw new EvaluateEndpointError(
            `Client error ${response.status}`,
            'client_error',
            { status: response.status, body: response.data }
          );
        }

        if (response.status >= 500) {
          // 5xx: Retry up to 2 times
          if (attempt < 2) {
            await this.backoff(attempt);
            continue;
          }
          throw new EvaluateEndpointError(
            `Server error ${response.status} after retries`,
            'server_error',
            { status: response.status }
          );
        }

        // Unexpected status
        throw new EvaluateEndpointError(
          `Unexpected status ${response.status}`,
          'unexpected_status',
          { status: response.status }
        );
      } catch (error) {
        if (error instanceof EvaluateEndpointError) {
          throw error;
        }

        const axiosError = error as AxiosError;

        // Timeout: No retry
        if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
          throw new EvaluateEndpointError(
            'Request timed out',
            'timeout',
            { timeout: this.timeout }
          );
        }

        // Connection error: Retry up to 3 times with exponential backoff
        if (
          axiosError.code === 'ECONNREFUSED' ||
          axiosError.code === 'ECONNRESET' ||
          axiosError.code === 'ENOTFOUND' ||
          axiosError.code === 'ERR_NETWORK'
        ) {
          lastError = axiosError;
          if (attempt < maxAttempts - 1) {
            await this.backoff(attempt);
            continue;
          }
          throw new EvaluateEndpointError(
            `Connection failed after ${maxAttempts} attempts: ${axiosError.message}`,
            'connection_error',
            { code: axiosError.code }
          );
        }

        // Unknown error
        throw new EvaluateEndpointError(
          `Unexpected error: ${(error as Error).message}`,
          'unknown',
          { originalError: (error as Error).message }
        );
      }
    }

    // Should not reach here, but fail-closed
    throw new EvaluateEndpointError(
      `Failed after ${maxAttempts} attempts: ${lastError?.message ?? 'unknown'}`,
      'connection_error',
      {}
    );
  }

  /**
   * Parse and validate the response structure.
   */
  private parseResponse(data: unknown): EvaluateResponse {
    if (!data || typeof data !== 'object') {
      throw new EvaluateEndpointError(
        'Malformed response: not an object',
        'malformed_response',
        { received: typeof data }
      );
    }

    const response = data as Record<string, unknown>;

    if (!response.correlation_id || typeof response.correlation_id !== 'string') {
      throw new EvaluateEndpointError(
        'Malformed response: missing or invalid correlation_id',
        'malformed_response',
        { fields: Object.keys(response) }
      );
    }

    if (!response.decision || typeof response.decision !== 'object') {
      throw new EvaluateEndpointError(
        'Malformed response: missing or invalid decision',
        'malformed_response',
        { fields: Object.keys(response) }
      );
    }

    const decision = response.decision as Record<string, unknown>;
    const validActions = ['ALLOW', 'DENY', 'MONITOR'];
    if (!validActions.includes(decision.action as string)) {
      throw new EvaluateEndpointError(
        `Malformed response: invalid decision action "${decision.action}"`,
        'malformed_response',
        { action: decision.action }
      );
    }

    return data as EvaluateResponse;
  }

  /**
   * Exponential backoff: 100ms, 200ms, 400ms, ...
   */
  private backoff(attempt: number): Promise<void> {
    const delay = 100 * Math.pow(2, attempt);
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}

/**
 * In-process implementation using TealEngine directly.
 * Used when sidecar is not available (e.g., unit tests, local development).
 *
 * TODO: Wire up actual TealEngineV12 and TealGuard integration once
 * the engine module is ready for direct import in the benchmark context.
 */
export class InProcessEvaluateEndpoint implements EvaluateEndpoint {
  // TODO: Replace `unknown` with actual TealEngineV12 and TealGuard types
  // once the engine is available for direct import.
  private readonly engine: unknown;
  private readonly guard: unknown;

  constructor(engine: unknown, guard: unknown) {
    this.engine = engine;
    this.guard = guard;
  }

  async evaluate(request: EvaluateRequest): Promise<EvaluateResponse> {
    // TODO: Implement direct engine + guard evaluation
    // This will call:
    //   1. TealGuard.check(request.content) for guardrail evaluation
    //   2. TealEngineV12.evaluate(context) for policy evaluation
    //   3. Merge results using "most restrictive action wins" logic
    //   4. Return structured EvaluateResponse

    void request; // suppress unused parameter warning
    void this.engine;
    void this.guard;

    throw new Error(
      'InProcessEvaluateEndpoint is not yet implemented. ' +
      'Use HttpEvaluateEndpoint with a running sidecar, or implement ' +
      'the engine integration when TealEngineV12 is available for direct import.'
    );
  }
}

/**
 * Error class for evaluate endpoint failures.
 * Categorizes errors for proper recording in benchmark results.
 */
export class EvaluateEndpointError extends Error {
  readonly errorType: EvaluateErrorType;
  readonly details: Record<string, unknown>;

  constructor(
    message: string,
    errorType: EvaluateErrorType,
    details: Record<string, unknown>
  ) {
    super(message);
    this.name = 'EvaluateEndpointError';
    this.errorType = errorType;
    this.details = details;
  }
}

export type EvaluateErrorType =
  | 'connection_error'
  | 'timeout'
  | 'client_error'
  | 'server_error'
  | 'malformed_response'
  | 'unexpected_status'
  | 'unknown';
