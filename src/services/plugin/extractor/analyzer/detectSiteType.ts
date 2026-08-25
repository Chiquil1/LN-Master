import { load, type CheerioAPI } from 'cheerio';
import type { SiteType } from '../types';

const CMS_INDICATORS: Record<
  string,
  { type: SiteType; selectors: string[]; patterns: RegExp[] }
> = {
  'madara': {
    type: 'madara-cms',
    selectors: [
      '.wp-manga-chapter',
      '.manga-title-badges',
      '#manga-chapters-holder',
      '.rating-post-id',
      'wp-manga',
      '.c-tabs-item__content',
      '.page-item-detail',
    ],
    patterns: [
      /wp-manga/,
      /manga_get_chapters/,
      /ajax\/chapters/,
      /admin-ajax\.php.*manga/,
    ],
  },
  'lightnovelwp': {
    type: 'lightnovelwp-cms',
    selectors: [
      '.lnwp-chapter',
      '.novel-title',
      '.lnwp-chapter-list',
      '[data-novel-id]',
    ],
    patterns: [/lightnovelwp/, /lnwp/, /novelwp/],
  },
  'novelyra': {
    type: 'novelyra-custom',
    selectors: [
      'main a.group.block.min-w-0',
      '#synopsis',
      'a[href*="/chapter-"]',
    ],
    patterns: [/novelyra\.com/],
  },
};

const API_INDICATORS = [
  /\/api\//,
  /\/graphql/,
  /\.json$/,
  /application\/json/,
  /fetchJson/,
  /apiSite/,
];

function detectCms(
  $: CheerioAPI,
  html: string,
  url: string,
): { type: SiteType; confidence: number; name?: string } {
  let bestMatch: { type: SiteType; confidence: number; name?: string } = {
    type: 'html-generic',
    confidence: 0,
  };

  for (const [cmsName, config] of Object.entries(CMS_INDICATORS)) {
    let score = 0;

    for (const selector of config.selectors) {
      if ($(selector).length > 0) score += 10;
    }

    for (const pattern of config.patterns) {
      if (pattern.test(html) || pattern.test(url)) score += 15;
    }

    const metaGenerator = $('meta[name="generator"]').attr('content') || '';
    if (patternMatchesCms(metaGenerator, cmsName)) score += 20;

    if (score > bestMatch.confidence) {
      bestMatch = {
        type: config.type,
        confidence: Math.min(score, 100),
        name: cmsName,
      };
    }
  }

  return bestMatch;
}

function patternMatchesCms(generator: string, cmsName: string): boolean {
  const cmsPatterns: Record<string, RegExp[]> = {
    madara: [/madara/i, /wp-manga/i],
    lightnovelwp: [/lightnovelwp/i, /lnwp/i],
    novelyra: [/novelyra/i],
  };
  return cmsPatterns[cmsName]?.some(p => p.test(generator)) || false;
}

function detectApiSite($: CheerioAPI, html: string): boolean {
  for (const pattern of API_INDICATORS) {
    if (pattern.test(html)) return true;
  }
  const scripts = $('script[type="application/json"], script[data-api]');
  if (scripts.length > 0) return true;
  return false;
}

function detectNovelyraCustom(
  $: CheerioAPI,
  html: string,
  url: string,
): boolean {
  return (
    url.includes('novelyra.com') ||
    html.includes('novelyra.com') ||
    ($('#synopsis').length > 0 && $('a[href*="/chapter-"]').length > 0)
  );
}

export function detectSiteType(
  html: string,
  url: string,
): { siteType: SiteType; confidence: number; cmsName?: string } {
  const $ = load(html);

  if (detectApiSite($, html)) {
    return { siteType: 'api-json', confidence: 80 };
  }

  if (detectNovelyraCustom($, html, url)) {
    return { siteType: 'novelyra-custom', confidence: 90 };
  }

  const cmsResult = detectCms($, html, url);
  if (cmsResult.confidence > 30) {
    return {
      siteType: cmsResult.type,
      confidence: cmsResult.confidence,
      cmsName: cmsResult.name,
    };
  }

  const hasChapterLinks =
    $('a[href*="chapter"], a[href*="capitulo"], a[href*="capítulo"]').length >
    5;
  const hasNovelStructure =
    $('h1, .novel-title, .post-title, .book-title').length > 0;

  if (hasChapterLinks && hasNovelStructure) {
    return { siteType: 'html-generic', confidence: 50 };
  }

  return { siteType: 'unknown', confidence: 0 };
}
