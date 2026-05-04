/**
 * TealSecrets — Confidence Scorer
 *
 * Deterministic, math-backed confidence scoring for secret detections.
 * Uses Shannon entropy, structural match, context proximity, and FP heuristics.
 *
 * @module secrets/ConfidenceScorer
 */

import { ConfidenceSignals, Severity } from './types';

/** Known high-confidence prefixes for structural matching */
const KNOWN_PREFIXES: Record<string, number> = {
  'AKIA': 1.0, 'ASIA': 1.0,                          // AWS
  'ghp_': 1.0, 'gho_': 1.0, 'ghs_': 1.0, 'ghu_': 1.0, 'ghr_': 1.0, // GitHub
  'glpat-': 1.0,                                       // GitLab
  'sk-ant-': 1.0,                                      // Anthropic
  'sk-proj-': 1.0,                                     // OpenAI
  'sk_live_': 1.0, 'pk_live_': 1.0, 'sk_test_': 1.0,  // Stripe
  'hf_': 0.9,                                          // HuggingFace
  'xoxb-': 1.0, 'xoxp-': 1.0,                         // Slack
  'SG.': 1.0,                                          // SendGrid
  'sq0atp-': 1.0, 'sq0csp-': 1.0,                     // Square
  'shpat_': 1.0, 'shpca_': 1.0, 'shppa_': 1.0,       // Shopify
  'dop_v1_': 1.0, 'doo_v1_': 1.0,                     // DigitalOcean
  'r8_': 0.9,                                          // Replicate
  'pplx-': 0.9,                                        // Perplexity
  'hvs.': 1.0,                                         // Vault
  'pul-': 0.9,                                         // Pulumi
  'AIza': 0.9,                                         // GCP
  'ya29.': 0.9,                                        // GCP OAuth
  'LTAI': 0.9,                                         // Alibaba
  'whsec_': 1.0,                                       // Stripe webhook
  'NRAK-': 1.0,                                        // New Relic
  'eyJ': 0.7,                                          // JWT (common but can be non-secret)
};

/** Context keywords that increase confidence */
const CONTEXT_KEYWORDS = [
  'apikey', 'api_key', 'api-key',
  'token', 'secret', 'password', 'passwd',
  'auth', 'credential', 'credentials',
  'private_key', 'private-key', 'privatekey',
  'access_key', 'access-key', 'accesskey',
  'client_secret', 'client-secret',
  'connection_string', 'connectionstring',
];

/** Known false-positive patterns */
const FP_PATTERNS = [
  /example/i, /sample/i, /test/i, /demo/i, /dummy/i,
  /placeholder/i, /your[_-]?key/i, /xxx+/i, /000+/,
  /replace[_-]?me/i, /insert[_-]?here/i, /todo/i,
  /fake/i, /mock/i, /stub/i,
];

export class ConfidenceScorer {
  /**
   * Compute deterministic confidence score for a secret match.
   *
   * @param match - The matched secret string
   * @param context - Surrounding content (up to 100 chars each side)
   * @param _patternId - The detector pattern ID (used for structural hints)
   * @returns Composite confidence, sub-signals, and severity
   */
  score(
    match: string,
    context: string,
    _patternId: string,
  ): { confidence: number; signals: ConfidenceSignals; severity: Severity } {
    const entropy_score = this.shannonEntropy(match);
    const structural_match = this.structuralMatch(match);
    const context_proximity = this.contextProximity(context);
    const fp_risk = this.fpRisk(match, context);

    const confidence = this.composite(entropy_score, structural_match, context_proximity, fp_risk);
    const severity = this.mapSeverity(confidence);

    return {
      confidence,
      signals: { entropy_score, structural_match, context_proximity, fp_risk },
      severity,
    };
  }

  /** Shannon entropy normalized to [0, 1] */
  private shannonEntropy(s: string): number {
    if (s.length === 0) return 0;

    const freq = new Map<string, number>();
    for (const ch of s) {
      freq.set(ch, (freq.get(ch) ?? 0) + 1);
    }

    let entropy = 0;
    const len = s.length;
    for (const count of freq.values()) {
      const p = count / len;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }

    // Max entropy for a string of this length = log2(min(len, uniqueChars))
    // We normalize against log2(256) ≈ 8 for general byte strings,
    // but cap at log2(len) for short strings
    const maxEntropy = Math.min(Math.log2(Math.max(len, 2)), 8);
    return Math.min(entropy / maxEntropy, 1);
  }

  /** Structural match: known prefix → 1.0, partial → 0.5, generic → 0.3 */
  private structuralMatch(match: string): number {
    for (const [prefix, score] of Object.entries(KNOWN_PREFIXES)) {
      if (match.startsWith(prefix)) {
        return score;
      }
    }

    // Check for common structural patterns (hex, base64, UUID-like)
    if (/^[a-f0-9]{32,}$/i.test(match)) return 0.5;
    if (/^[A-Za-z0-9+/=]{40,}$/.test(match)) return 0.5;
    if (/^-----BEGIN/.test(match)) return 1.0;

    return 0.3;
  }

  /** Context proximity: scan surrounding text for secret-related keywords */
  private contextProximity(context: string): number {
    const lower = context.toLowerCase();
    let hits = 0;
    for (const kw of CONTEXT_KEYWORDS) {
      if (lower.includes(kw)) {
        hits++;
      }
    }
    // Normalize: 1 hit = 0.5, 2+ hits = 0.8, 3+ = 1.0
    if (hits >= 3) return 1.0;
    if (hits >= 2) return 0.8;
    if (hits >= 1) return 0.5;
    return 0.0;
  }

  /** False-positive risk: known test/example patterns get high FP risk */
  private fpRisk(match: string, context: string): number {
    const combined = match + ' ' + context;
    let fpHits = 0;
    for (const pat of FP_PATTERNS) {
      if (pat.test(combined)) {
        fpHits++;
      }
    }
    // 1 hit = 0.4, 2+ = 0.7, 3+ = 0.9
    if (fpHits >= 3) return 0.9;
    if (fpHits >= 2) return 0.7;
    if (fpHits >= 1) return 0.4;
    return 0.0;
  }

  /** Composite score: weighted combination of four signals */
  private composite(
    entropy: number,
    structural: number,
    context: number,
    fpRisk: number,
  ): number {
    const raw =
      entropy * 0.35 +
      structural * 0.30 +
      context * 0.20 +
      (1 - fpRisk) * 0.15;
    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, raw));
  }

  /** Map confidence to severity */
  private mapSeverity(confidence: number): Severity {
    if (confidence >= 0.90) return 'CRITICAL';
    if (confidence >= 0.75) return 'HIGH';
    if (confidence >= 0.50) return 'MEDIUM';
    if (confidence >= 0.30) return 'LOW';
    return 'INFO';
  }
}
