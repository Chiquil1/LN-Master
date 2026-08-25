import { fetchApi } from '../../../../plugins/helpers/fetch';

export interface FetchInit {
  headers?: Record<string, string> | Headers;
  method?: string;
  body?: FormData | string;
  credentials?: RequestCredentials;
  [x: string]:
    | string
    | Record<string, string>
    | undefined
    | FormData
    | Headers
    | RequestCredentials;
}

export interface FetchHtmlOptions {
  waitForSelector?: string;
  timeout?: number;
  followRedirects?: boolean;
  headers?: Record<string, string>;
  method?: string;
  body?: FormData | string;
  credentials?: RequestCredentials;
}

export interface FetchResult {
  html: string;
  url: string;
  status: number;
  headers: Headers;
  cookies: Record<string, string>;
  isCloudflareChallenge: boolean;
  cloudflareType?: 'challenge' | 'turnstile' | 'unknown';
}

const CLOUDFLARE_INDICATORS = [
  'Just a moment...',
  'Checking your browser',
  'Bot Verification',
  'Un instant...',
  'Redirecting...',
  'cf-challenge',
  'cf-turnstile',
  'ray-id',
  'challenge-platform',
  'Please enable JavaScript',
  'Please enable Cookies',
];

const TURNSTILE_INDICATORS = ['data-turnstile', 'cf-turnstile', 'turnstile'];

export async function fetchHtml(
  url: string,
  options: FetchHtmlOptions = {},
): Promise<FetchResult> {
  const {
    waitForSelector,
    timeout: _timeout,
    followRedirects: _followRedirects,
    ...init
  } = options;

  try {
    const res = await fetchApi(url, {
      ...init,
      credentials: 'include',
    } as FetchInit);

    const html = await res.text();
    const isCloudflare = detectCloudflare(html);

    const cookies: Record<string, string> = {};
    const setCookieHeader = res.headers.get('set-cookie');
    if (setCookieHeader) {
      const cookieStrings = setCookieHeader.split(',').map(s => s.trim());
      cookieStrings.forEach(cookieStr => {
        const [nameValue] = cookieStr.split(';');
        const [name, value] = nameValue.split('=');
        if (name && value) cookies[name.trim()] = value.trim();
      });
    }

    return {
      html,
      url: res.url,
      status: res.status,
      headers: res.headers,
      cookies,
      isCloudflareChallenge: isCloudflare.hasChallenge,
      cloudflareType: isCloudflare.type,
    };
  } catch (error) {
    throw new Error(
      `Failed to fetch ${url}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function fetchHtmlWithRetry(
  url: string,
  options: FetchHtmlOptions & { retries?: number; retryDelay?: number } = {},
): Promise<FetchResult> {
  const { retries = 3, retryDelay = 2000, ...fetchOptions } = options;
  let lastError: Error;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchHtml(url, fetchOptions);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < retries) {
        await new Promise(resolve =>
          setTimeout(resolve, retryDelay * (attempt + 1)),
        );
      }
    }
  }

  throw lastError!;
}

function detectCloudflare(html: string): {
  hasChallenge: boolean;
  type?: 'challenge' | 'turnstile' | 'unknown';
} {
  const hasChallenge = CLOUDFLARE_INDICATORS.some(indicator =>
    html.includes(indicator),
  );

  if (!hasChallenge) {
    return { hasChallenge: false };
  }

  const hasTurnstile = TURNSTILE_INDICATORS.some(indicator =>
    html.includes(indicator),
  );

  return {
    hasChallenge: true,
    type: hasTurnstile ? 'turnstile' : 'challenge',
  };
}

export async function extractCookiesFromHtml(
  html: string,
  url: string,
): Promise<Record<string, string>> {
  const cookies: Record<string, string> = {};

  const cookieMatches = html.match(/document\.cookie\s*=\s*["']([^"']+)["']/g);
  if (cookieMatches) {
    cookieMatches.forEach(match => {
      const cookieStr = match.match(/["']([^"']+)["']/)?.[1];
      if (cookieStr) {
        const [nameValue] = cookieStr.split(';');
        const [name, value] = nameValue.split('=');
        if (name && value) cookies[name.trim()] = value.trim();
      }
    });
  }

  const metaCookies = html.match(
    /<meta[^>]+http-equiv=["']set-cookie["'][^>]*content=["']([^"']+)["']/gi,
  );
  if (metaCookies) {
    metaCookies.forEach(match => {
      const content = match.match(/content=["']([^"']+)["']/i)?.[1];
      if (content) {
        const [nameValue] = content.split(';');
        const [name, value] = nameValue.split('=');
        if (name && value) cookies[name.trim()] = value.trim();
      }
    });
  }

  return cookies;
}

export function isCloudflareChallenge(html: string): boolean {
  return CLOUDFLARE_INDICATORS.some(indicator => html.includes(indicator));
}

export function isTurnstileChallenge(html: string): boolean {
  return TURNSTILE_INDICATORS.some(indicator => html.includes(indicator));
}

export function extractCloudflareRayId(html: string): string | null {
  const match = html.match(/ray-id["']?\s*:\s*["']?([a-f0-9]+)["']?/i);
  return match?.[1] || null;
}
