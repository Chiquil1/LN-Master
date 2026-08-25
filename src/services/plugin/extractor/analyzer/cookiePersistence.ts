import { fetchHtml, type FetchResult } from './fetchHtml';

const CLOUDFLARE_COOKIES = [
  'cf_clearance',
  '__cf_bm',
  'cf_challenge',
  'cfruid',
];
const SESSION_COOKIES = [
  'session',
  'sessionid',
  'PHPSESSID',
  'laravel_session',
  'ci_session',
];

export interface CookiePersistenceConfig {
  criticalPatterns: string[];
  sessionPatterns: string[];
  defaultTtlDays: number;
  maxCookiesPerSite: number;
}

export const DEFAULT_COOKIE_CONFIG: CookiePersistenceConfig = {
  criticalPatterns: [
    ...CLOUDFLARE_COOKIES,
    ...SESSION_COOKIES,
    'token',
    'auth',
    'csrf',
    '_token',
    'xsrf',
  ],
  sessionPatterns: SESSION_COOKIES,
  defaultTtlDays: 30,
  maxCookiesPerSite: 50,
};

export interface PersistedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'Lax' | 'Strict' | 'None';
  pluginId: string;
  capturedAt: number;
  lastUsed: number;
  isCritical: boolean;
}

export class CookiePersistenceManager {
  private config: CookiePersistenceConfig;
  private storageKey = 'lnreader_plugin_cookies';

  constructor(config: Partial<CookiePersistenceConfig> = {}) {
    this.config = { ...DEFAULT_COOKIE_CONFIG, ...config };
  }

  async persistCookies(
    pluginId: string,
    fetchResult: FetchResult,
  ): Promise<PersistedCookie[]> {
    const cookies: PersistedCookie[] = [];
    const now = Date.now();
    const defaultExpires =
      now + this.config.defaultTtlDays * 24 * 60 * 60 * 1000;

    for (const [name, value] of Object.entries(fetchResult.cookies)) {
      if (cookies.length >= this.config.maxCookiesPerSite) break;

      const isCritical = this.isCriticalCookie(name);
      const isSession = this.isSessionCookie(name);

      cookies.push({
        name,
        value,
        domain: this.extractDomain(fetchResult.url),
        path: '/',
        expires: isSession ? 0 : defaultExpires,
        secure: fetchResult.url.startsWith('https://'),
        httpOnly: true,
        sameSite: 'Lax',
        pluginId,
        capturedAt: now,
        lastUsed: now,
        isCritical,
      });
    }

    this.saveCookies(pluginId, cookies);
    return cookies;
  }

  getPersistedCookies(pluginId: string): PersistedCookie[] {
    try {
      const data = localStorage.getItem(`${this.storageKey}_${pluginId}`);
      if (!data) return [];
      const cookies = JSON.parse(data) as PersistedCookie[];
      return cookies.filter(c => c.expires === 0 || c.expires > Date.now());
    } catch {
      return [];
    }
  }

  async restoreCookies(pluginId: string, url: string): Promise<boolean> {
    const cookies = this.getPersistedCookies(pluginId);
    if (cookies.length === 0) return false;

    const domain = this.extractDomain(url);
    const validCookies = cookies.filter(
      c =>
        c.domain === domain ||
        domain.endsWith('.' + c.domain) ||
        c.domain.endsWith('.' + domain),
    );

    if (validCookies.length === 0) return false;

    for (const cookie of validCookies) {
      cookie.lastUsed = Date.now();
      try {
        document.cookie = this.formatCookie(cookie);
      } catch {}
    }

    this.saveCookies(pluginId, cookies);
    return true;
  }

  async ensureValidCookies(pluginId: string, url: string): Promise<boolean> {
    const cookies = this.getPersistedCookies(pluginId);
    const criticalCookies = cookies.filter(
      c => c.isCritical && (c.expires === 0 || c.expires > Date.now()),
    );

    if (criticalCookies.length === 0) return false;

    return this.restoreCookies(pluginId, url);
  }

  hasCloudflareCookies(pluginId: string): boolean {
    const cookies = this.getPersistedCookies(pluginId);
    return cookies.some(c => CLOUDFLARE_COOKIES.includes(c.name.toLowerCase()));
  }

  getCloudflareClearance(pluginId: string): string | null {
    const cookies = this.getPersistedCookies(pluginId);
    const cf = cookies.find(c => c.name === 'cf_clearance');
    return cf?.value || null;
  }

  clearCookies(pluginId: string): void {
    localStorage.removeItem(`${this.storageKey}_${pluginId}`);
  }

  private isCriticalCookie(name: string): boolean {
    const lower = name.toLowerCase();
    return this.config.criticalPatterns.some(p => lower.includes(p));
  }

  private isSessionCookie(name: string): boolean {
    const lower = name.toLowerCase();
    return this.config.sessionPatterns.some(p => lower.includes(p));
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  private formatCookie(cookie: PersistedCookie): string {
    const parts = [
      `${cookie.name}=${cookie.value}`,
      `Domain=${cookie.domain}`,
      `Path=${cookie.path}`,
      cookie.secure ? 'Secure' : '',
      cookie.httpOnly ? 'HttpOnly' : '',
      `SameSite=${cookie.sameSite}`,
    ];

    if (cookie.expires > 0) {
      parts.push(`Expires=${new Date(cookie.expires).toUTCString()}`);
    }

    return parts.filter(Boolean).join('; ');
  }

  private saveCookies(pluginId: string, cookies: PersistedCookie[]): void {
    try {
      localStorage.setItem(
        `${this.storageKey}_${pluginId}`,
        JSON.stringify(cookies),
      );
    } catch {}
  }
}

export async function fetchWithCookiePersistence(
  url: string,
  pluginId: string,
  cookieManager: CookiePersistenceManager,
  options: { waitForSelector?: string; headers?: Record<string, string> } = {},
): Promise<FetchResult> {
  const hasValidCookies = await cookieManager.ensureValidCookies(pluginId, url);

  if (!hasValidCookies && cookieManager.hasCloudflareCookies(pluginId)) {
    const clearance = cookieManager.getCloudflareClearance(pluginId);
    if (clearance) {
      return fetchHtml(url, {
        ...options,
        headers: {
          ...options.headers,
          'Cookie': `cf_clearance=${clearance}`,
        },
      });
    }
  }

  return fetchHtml(url, options);
}

export function generateCookiePersistenceCode(pluginId: string): string {
  return `
// Cookie persistence for ${pluginId}
const COOKIE_STORAGE_KEY = 'lnreader_cookies_${pluginId}';

function getPersistedCookies() {
  try {
    return JSON.parse(localStorage.getItem(COOKIE_STORAGE_KEY) || '[]');
  } catch { return []; }
}

function saveCookies(cookies) {
  try {
    localStorage.setItem(COOKIE_STORAGE_KEY, JSON.stringify(cookies));
  } catch {}
}

function hasValidCookies(url) {
  const cookies = getPersistedCookies();
  const domain = new URL(url).hostname;
  return cookies.some(c => 
    (c.expires === 0 || c.expires > Date.now()) &&
    (c.domain === domain || domain.endsWith('.' + c.domain))
  );
}

function restoreCookies(url) {
  const cookies = getPersistedCookies();
  const domain = new URL(url).hostname;
  const valid = cookies.filter(c => 
    c.domain === domain || domain.endsWith('.' + c.domain) || c.domain.endsWith('.' + domain)
  );
  
  valid.forEach(c => {
    document.cookie = \`\${c.name}=\${c.value}; Domain=\${c.domain}; Path=\${c.path}; \${c.secure ? 'Secure; ' : ''}\${c.httpOnly ? 'HttpOnly; ' : ''}SameSite=\${c.sameSite}\${c.expires > 0 ? \`; Expires=\${new Date(c.expires).toUTCString()}\` : ''}\`;
    c.lastUsed = Date.now();
  });
  
  saveCookies(cookies);
  return valid.length > 0;
}

function extractAndPersistCookies(url, res) {
  const cookies = [];
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    setCookie.split(',').forEach(s => {
      const [nameValue] = s.trim().split(';');
      const [name, value] = nameValue.split('=');
      if (name && value) {
        cookies.push({
          name: name.trim(),
          value: value.trim(),
          domain: new URL(url).hostname,
          path: '/',
          expires: 0,
          secure: url.startsWith('https://'),
          httpOnly: true,
          sameSite: 'Lax',
          pluginId: '${pluginId}',
          capturedAt: Date.now(),
          lastUsed: Date.now(),
          isCritical: ['cf_clearance', '__cf_bm', 'cf_challenge', 'cfruid', 'session', 'token'].some(p => name.toLowerCase().includes(p)),
        });
      }
    });
  }
  
  if (cookies.length > 0) {
    const existing = getPersistedCookies();
    const merged = [...existing, ...cookies].slice(0, 50);
    saveCookies(merged);
  }
  
  return cookies;
}
`;
}
