import { fetchHtml } from './fetchHtml';
import { detectSiteType } from './detectSiteType';
import { detectChapterPattern } from './detectChapterPattern';
import {
  extractSelectors,
  generateRobustSelectors,
  validateSelectors,
  scoreSelectors,
} from './extractSelectors';
import { detectCloudflare, extractCloudflareDetails } from './detectCloudflare';
import {
  extractEmbeddedData,
  extractChaptersFromEmbedded,
} from './extractEmbeddedData';
import { validateSelectors as validateSelectorsFull } from './validateSelectors';
import { load, type CheerioAPI } from 'cheerio';
import type {
  SiteStructure,
  ExtractorOptions,
  ExtractorResult,
} from '../types';

export async function analyzeSite(
  url: string,
  options: ExtractorOptions = {},
): Promise<ExtractorResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const fetchResult = await fetchHtml(url, {
      waitForSelector: options.waitForSelector,
      headers: options.headers,
    });

    const $ = load(fetchResult.html);

    const siteTypeResult = detectSiteType(fetchResult.html, url);
    const chapterPattern = detectChapterPattern($, fetchResult.html, url);
    const cloudflare = detectCloudflare(
      fetchResult.html,
      url,
      fetchResult.headers,
    );
    const baseSelectors = extractSelectors($, fetchResult.html);
    const robustSelectors = generateRobustSelectors($, baseSelectors);
    const selectorValidation = validateSelectors($, robustSelectors);
    const selectorScore = scoreSelectors($, robustSelectors);

    if (!selectorValidation.valid) {
      warnings.push(...selectorValidation.issues);
    }

    if (selectorScore < 60) {
      warnings.push(`Low selector confidence: ${selectorScore}%`);
    }

    if (cloudflare.hasChallenge) {
      warnings.push(
        `Cloudflare detected: ${cloudflare.challengeText} (${cloudflare.recommendation})`,
      );
    }

    const structure: SiteStructure = {
      siteType: siteTypeResult.siteType,
      baseUrl: new URL(url).origin,
      siteName: extractSiteName($, url),
      chapterPattern,
      selectors: robustSelectors,
      urlPatterns: extractUrlPatterns(
        $,
        fetchResult.html,
        url,
        siteTypeResult.siteType,
      ),
      cloudflare,
      confidence: Math.min(siteTypeResult.confidence, selectorScore),
      warnings,
      knownCms: siteTypeResult.cmsName,
    };

    const validation = options.validateBeforeGenerate
      ? await validateSelectorsFull(structure, {
          testChapterUrls: options.testChapterUrls,
          maxPages: options.maxPages,
          baseUrl: url,
        })
      : undefined;

    return {
      success: errors.length === 0,
      pluginCode: '',
      selectorsJson: JSON.stringify(robustSelectors, null, 2),
      manifest: generateManifest(structure, options),
      structure,
      validation,
      warnings,
      errors,
    };
  } catch (error) {
    errors.push(
      `Analysis failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return {
      success: false,
      pluginCode: '',
      selectorsJson: '',
      manifest: {
        id: '',
        name: '',
        version: '1.0.0',
        site: '',
        lang: options.lang || 'en',
      },
      structure: {} as SiteStructure,
      warnings,
      errors,
    };
  }
}

function extractSiteName($: CheerioAPI, url: string): string {
  const title = $('title').text().trim();
  if (title) {
    const cleaned = title.replace(/\s*[-|]\s*.*$/, '').trim();
    if (cleaned.length > 2 && cleaned.length < 50) return cleaned;
  }

  const metaTitle =
    $('meta[property="og:site_name"]').attr('content') ||
    $('meta[name="application-name"]').attr('content');
  if (metaTitle) return metaTitle.trim();

  try {
    return new URL(url).hostname.replace('www.', '').split('.')[0];
  } catch {
    return 'Unknown Site';
  }
}

function extractUrlPatterns(
  $: CheerioAPI,
  html: string,
  url: string,
  siteType: SiteStructure['siteType'],
): SiteStructure['urlPatterns'] {
  const baseUrl = new URL(url).origin;
  const pathname = new URL(url).pathname;

  let novelPathRegex = '/novel/[^/]+';
  let chapterPathRegex = '/chapter-[^/]+';
  let searchUrlTemplate = `${baseUrl}/search?q={query}&page={page}`;
  let popularUrlTemplate = `${baseUrl}/popular?page={page}`;

  if (siteType === 'madara-cms') {
    const novelMatch = pathname.match(/\/([^/]+)\/?$/);
    if (novelMatch) {
      novelPathRegex = novelMatch[1];
    }
    chapterPathRegex = '/[^/]+/chapter-\\d+';
    searchUrlTemplate = `${baseUrl}/page/{page}/?s={query}&post_type=wp-manga`;
    popularUrlTemplate = `${baseUrl}/page/{page}/?s=&post_type=wp-manga`;
  } else if (siteType === 'lightnovelwp-cms') {
    novelPathRegex = '/novel/[^/]+';
    chapterPathRegex = '/novel/[^/]+/chapter-\\d+';
    searchUrlTemplate = `${baseUrl}/search?keyword={query}&page={page}`;
    popularUrlTemplate = `${baseUrl}/page/{page}`;
  } else if (siteType === 'novelyra-custom') {
    novelPathRegex = '/novel/[^/]+';
    chapterPathRegex = '/chapter-\\d+';
    searchUrlTemplate = `${baseUrl}/search?q={query}&page={page}`;
    popularUrlTemplate = `${baseUrl}?page={page}`;
  }

  return {
    novelPathRegex,
    chapterPathRegex,
    searchUrlTemplate,
    popularUrlTemplate,
  };
}

function generateManifest(structure: SiteStructure, options: ExtractorOptions) {
  const siteId =
    options.siteId ||
    structure.baseUrl
      .replace(/https?:\/\//, '')
      .replace(/\./g, '-')
      .replace(/[^a-z0-9-]/g, '');
  return {
    id: siteId,
    name: structure.siteName,
    version: '1.0.0',
    site: structure.baseUrl,
    lang: options.lang || 'en',
    iconUrl: '',
    hasUpdate: false,
    hasSettings: false,
  };
}

export {
  fetchHtml,
  detectSiteType,
  detectChapterPattern,
  extractSelectors,
  generateRobustSelectors,
  validateSelectors,
  scoreSelectors,
  detectCloudflare,
  extractCloudflareDetails,
  extractEmbeddedData,
  extractChaptersFromEmbedded,
  validateSelectorsFull,
};
