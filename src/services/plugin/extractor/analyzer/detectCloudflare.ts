import { load, type CheerioAPI } from 'cheerio';
import type { CloudflareInfo } from '../types';

const CHALLENGE_INDICATORS = [
  'Just a moment...',
  'Checking your browser',
  'Bot Verification',
  'Un instant...',
  'Redirecting...',
  'Please enable JavaScript',
  'Please enable Cookies',
  'cf-challenge',
  'challenge-platform',
  'ray-id',
  'Checking if the site connection is secure',
  'Verifying you are human',
  'This process is automatic',
  'You will be redirected',
  'Attesa...',
  'Comprobando tu navegador',
  'Verificando que eres humano',
  'Por favor espera',
];

const TURNSTILE_INDICATORS = [
  'data-turnstile',
  'cf-turnstile',
  'turnstile-widget',
  'turnstile',
  'challenge-form',
  'challenge-body',
];

const CF_CLEARANCE_COOKIE = 'cf_clearance';

export function detectCloudflare(
  html: string,
  url?: string,
  headers?: Headers,
): CloudflareInfo {
  const $ = load(html);

  let hasChallenge = false;
  let challengeText: string | undefined;

  for (const indicator of CHALLENGE_INDICATORS) {
    if (html.includes(indicator)) {
      hasChallenge = true;
      challengeText = indicator;
      break;
    }
  }

  const titleText = $('title').text().trim();
  if (
    titleText.includes('Just a moment') ||
    titleText.includes('Checking') ||
    titleText.includes('Bot Verification')
  ) {
    hasChallenge = true;
    challengeText = titleText;
  }

  let hasTurnstile = false;
  for (const indicator of TURNSTILE_INDICATORS) {
    if (html.includes(indicator)) {
      hasTurnstile = true;
      break;
    }
  }

  if ($('[data-turnstile], .cf-turnstile, #turnstile-widget').length > 0) {
    hasTurnstile = true;
  }

  const cfClearanceCookie = checkCfClearanceCookie(html, headers);

  let recommendation: CloudflareInfo['recommendation'] = 'NONE';

  if (hasChallenge || hasTurnstile) {
    if (cfClearanceCookie) {
      recommendation = 'COOKIES_PERSISTED';
    } else {
      recommendation = 'USE_WEBVIEW_FIRST';
    }
  }

  return {
    hasChallenge,
    hasTurnstile,
    cfClearanceCookie,
    challengeText,
    recommendation,
  };
}

function checkCfClearanceCookie(html: string, headers?: Headers): boolean {
  const setCookie = headers?.get('set-cookie') || '';
  if (setCookie.includes(CF_CLEARANCE_COOKIE)) return true;

  const cookieMatches = html.match(/document\.cookie\s*=\s*["']([^"']+)["']/g);
  if (cookieMatches) {
    for (const match of cookieMatches) {
      if (match.includes(CF_CLEARANCE_COOKIE)) return true;
    }
  }

  return false;
}

export function extractCloudflareDetails($: CheerioAPI): {
  rayId: string | null;
  challengeScript: string | null;
  turnstileSitekey: string | null;
  formAction: string | null;
} {
  const rayIdMatch = $.html().match(/ray-id["']?\s*:\s*["']?([a-f0-9]+)["']?/i);
  const rayId = rayIdMatch?.[1] || null;

  const challengeScript =
    $('script[src*="challenge"], script[src*="cf_challenge"]').attr('src') ||
    null;

  const turnstileSitekey =
    $('[data-turnstile]').attr('data-turnstile') ||
    $('[data-sitekey]').attr('data-sitekey') ||
    null;

  const formAction =
    $('form#challenge-form, form.challenge-form').attr('action') || null;

  return {
    rayId,
    challengeScript,
    turnstileSitekey,
    formAction,
  };
}

export function isCloudflareChallengeResponse(res: Response): boolean {
  const cfRay = res.headers.get('cf-ray');
  const cfCacheStatus = res.headers.get('cf-cache-status');
  const server = res.headers.get('server');

  return !!(cfRay || cfCacheStatus || server?.includes('cloudflare'));
}

export function getCloudflareWaitTime(html: string): number {
  const waitMatch =
    html.match(/wait\s*:\s*(\d+)/i) ||
    html.match(/setTimeout\s*\(\s*[^,]+,\s*(\d+)\s*\)/);
  if (waitMatch) {
    return parseInt(waitMatch[1]) || 5000;
  }

  const metaRefresh = html.match(
    /<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'](\d+)/i,
  );
  if (metaRefresh) {
    return parseInt(metaRefresh[1]) * 1000;
  }

  return 5000;
}
