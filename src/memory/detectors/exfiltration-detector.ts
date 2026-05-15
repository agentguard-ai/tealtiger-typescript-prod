/**
 * TealMemory v2 — Exfiltration Detector
 *
 * Detects potential data exfiltration patterns in memory content:
 * - URLs with data-bearing query parameters (long base64-looking values, encoded payloads)
 * - Markdown image links pointing to non-allowlisted domains
 * - Webhook-formatted strings (URLs with /webhook/, /hook/, /callback/ paths)
 *
 * Configurable domain allowlist.
 * Returns reason code MEMORY_EXFILTRATION_RISK.
 *
 * @module memory/detectors/exfiltration-detector
 * @requirements 9.7
 */

// ── Pattern Definitions ──────────────────────────────────────────

/**
 * Matches URLs with query parameters that contain long base64-like or encoded values.
 * Looks for query param values that are 20+ chars of base64/hex-like content.
 */
const URL_WITH_DATA_PARAMS_PATTERN =
  /https?:\/\/[^\s"'<>]+\?[^\s"'<>]*[=][A-Za-z0-9+/=%]{20,}/gi;

/**
 * Matches markdown image syntax: ![alt](url)
 */
const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*\]\(([^)]+)\)/g;

/**
 * Matches webhook-formatted URLs (paths containing /webhook/, /hook/, /callback/).
 */
const WEBHOOK_URL_PATTERN =
  /https?:\/\/[^\s"'<>]*\/(?:webhook|hook|callback)s?\/[^\s"'<>]*/gi;



// ── Helper Functions ─────────────────────────────────────────────

/**
 * Extracts the domain from a URL string.
 */
function extractDomain(url: string): string | null {
  const match = url.match(/https?:\/\/([^/:?\s"'<>]+)/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Checks if a domain is in the allowlist.
 * Supports exact match and wildcard subdomain matching (e.g., "*.example.com").
 */
function isDomainAllowlisted(domain: string, allowlist: string[]): boolean {
  const lowerDomain = domain.toLowerCase();
  for (const allowed of allowlist) {
    const lowerAllowed = allowed.toLowerCase();
    if (lowerDomain === lowerAllowed) return true;
    // Wildcard subdomain: *.example.com matches sub.example.com
    if (lowerAllowed.startsWith('*.')) {
      const baseDomain = lowerAllowed.slice(2);
      if (lowerDomain === baseDomain || lowerDomain.endsWith('.' + baseDomain)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Checks if a URL has data-bearing query parameters.
 * A data-bearing param has a value that looks like base64 or encoded data (20+ chars).
 */
function hasDataBearingParams(url: string): boolean {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return false;

  const queryString = url.slice(queryStart + 1);
  const params = queryString.split('&');

  for (const param of params) {
    const eqIndex = param.indexOf('=');
    if (eqIndex === -1) continue;
    const value = param.slice(eqIndex + 1);
    // Check if value looks like encoded data (20+ chars of base64/hex-like content)
    if (value.length >= 20 && /^[A-Za-z0-9+/=%_-]+$/.test(value)) {
      return true;
    }
  }
  return false;
}

// ── Public API ───────────────────────────────────────────────────

export interface ExfiltrationDetectionResult {
  detected: boolean;
  findings: string[];
  reason_code: string;
}

/**
 * Detects potential data exfiltration patterns in memory content.
 *
 * Checks for:
 * 1. URLs with data-bearing query parameters (long base64-looking values)
 * 2. Markdown image links pointing to non-allowlisted domains
 * 3. Webhook-formatted strings (URLs with /webhook/, /hook/, /callback/ paths)
 */
export function detectMemoryExfiltration(
  content: string,
  config: { domain_allowlist: string[] } = { domain_allowlist: [] },
): ExfiltrationDetectionResult {
  const findings: string[] = [];

  // 1. Check for URLs with data-bearing query parameters
  const dataParamUrls = content.match(URL_WITH_DATA_PARAMS_PATTERN) ?? [];
  for (const url of dataParamUrls) {
    const domain = extractDomain(url);
    if (domain && !isDomainAllowlisted(domain, config.domain_allowlist)) {
      if (hasDataBearingParams(url)) {
        findings.push(`URL with data-bearing params to non-allowlisted domain: ${domain}`);
      }
    }
  }

  // 2. Check for markdown image links to non-allowlisted domains
  let mdMatch: RegExpExecArray | null;
  const mdPattern = new RegExp(MARKDOWN_IMAGE_PATTERN.source, 'g');
  while ((mdMatch = mdPattern.exec(content)) !== null) {
    const imageUrl = mdMatch[1];
    const domain = extractDomain(imageUrl);
    if (domain && !isDomainAllowlisted(domain, config.domain_allowlist)) {
      findings.push(`Markdown image to non-allowlisted domain: ${domain}`);
    }
  }

  // 3. Check for webhook-formatted URLs to non-allowlisted domains
  const webhookUrls = content.match(WEBHOOK_URL_PATTERN) ?? [];
  for (const url of webhookUrls) {
    const domain = extractDomain(url);
    if (domain && !isDomainAllowlisted(domain, config.domain_allowlist)) {
      findings.push(`Webhook URL to non-allowlisted domain: ${domain}`);
    }
  }

  const detected = findings.length > 0;

  return {
    detected,
    findings,
    reason_code: detected ? 'MEMORY_EXFILTRATION_RISK' : '',
  };
}
