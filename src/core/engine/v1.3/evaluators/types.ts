export interface PreEvalDenyResult {
  reason_code: string;
  reason: string;
  metadata?: Record<string, unknown>;
}
