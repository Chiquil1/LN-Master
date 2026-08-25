export function normalizeUrl(baseUrl: string, path: string): string {
  try {
    if (path.startsWith('http')) return path;
    const base = new URL(baseUrl);
    return new URL(path, base).href;
  } catch {
    return path;
  }
}

export function extractBaseUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return url;
  }
}

export function extractPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search + u.hash;
  } catch {
    return url;
  }
}

export function buildUrlTemplate(
  baseUrl: string,
  pathPattern: string,
  params: Record<string, string> = {},
): string {
  let url = normalizeUrl(baseUrl, pathPattern);
  for (const [key, value] of Object.entries(params)) {
    url = url.replace(
      new RegExp(`\\{${key}\\}`, 'g'),
      encodeURIComponent(value),
    );
  }
  return url;
}

export function detectPaginationPattern(
  urls: string[],
): { pattern: string; pageParam: string } | null {
  const pageParams = ['page', 'p', 'pg', 'pagina', 'página'];

  for (const param of pageParams) {
    const matches = urls.filter(u => new RegExp(`[?&]${param}=(\\d+)`).test(u));
    if (matches.length >= 2) {
      return { pattern: `[?&]${param}=(\\d+)`, pageParam: param };
    }
  }

  const pathMatches = urls.filter(u => /\/page\/(\d+)/.test(u));
  if (pathMatches.length >= 2) {
    return { pattern: `\\/page\\/(\\d+)`, pageParam: 'page' };
  }

  return null;
}

export function generatePaginationUrls(
  baseUrl: string,
  pageParam: string,
  maxPages: number,
): string[] {
  const urls: string[] = [];
  const separator = baseUrl.includes('?') ? '&' : '?';

  for (let page = 1; page <= maxPages; page++) {
    urls.push(`${baseUrl}${separator}${pageParam}=${page}`);
  }

  return urls;
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return '';
  }
}

export function isSameDomain(url1: string, url2: string): boolean {
  return getDomain(url1) === getDomain(url2);
}

export function joinUrl(base: string, path: string): string {
  if (path.startsWith('http')) return path;
  if (path.startsWith('/')) {
    try {
      const u = new URL(base);
      return `${u.protocol}//${u.host}${path}`;
    } catch {
      return path;
    }
  }
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
