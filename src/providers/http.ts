/**
 * Shared HTTP helpers for provider-specific clients.
 */

export interface ProviderHttpOptions {
  baseUrl: string;
  apiKey?: string;
  path: string;
  body: unknown;
  providerName: string;
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

async function parseError(response: Response): Promise<string> {
  try {
    const payload = await response.json() as any;
    return payload?.error?.message || payload?.message || response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function postProviderJson<T>(options: ProviderHttpOptions): Promise<T> {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is not available in this runtime');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.apiKey) {
    headers.Authorization = `Bearer ${options.apiKey}`;
  }

  const response = await fetch(joinUrl(options.baseUrl, options.path), {
    method: 'POST',
    headers,
    body: JSON.stringify(options.body),
  });

  if (!response.ok) {
    const message = await parseError(response);
    throw new Error(`${options.providerName} API error: ${message}`);
  }

  return response.json() as Promise<T>;
}
