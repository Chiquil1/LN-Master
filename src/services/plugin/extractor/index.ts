import {
  analyzeSite,
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
} from './analyzer/index';
import { generatePlugin, generateMadaraBaseClass } from './generators/index';
import {
  findKnownSite,
  applyKnownSitePattern,
  KNOWN_SITES,
} from './knownSites/index';
import {
  extractChapterNumber,
  extractChapterNumberFromUrl,
  compareChapterNumbers,
  normalizeChapterTitle,
} from './utils/chapterNumber';
import {
  CookiePersistenceManager,
  fetchWithCookiePersistence,
  generateCookiePersistenceCode,
  DEFAULT_COOKIE_CONFIG,
} from './analyzer/cookiePersistence';
export * from './utils/urlUtils';
export * from './utils/selectorUtils';
export * from './types';

export {
  analyzeSite,
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
export { generatePlugin, generateMadaraBaseClass };
export { findKnownSite, applyKnownSitePattern, KNOWN_SITES };
export {
  extractChapterNumber,
  extractChapterNumberFromUrl,
  compareChapterNumbers,
  normalizeChapterTitle,
};
export {
  CookiePersistenceManager,
  fetchWithCookiePersistence,
  generateCookiePersistenceCode,
  DEFAULT_COOKIE_CONFIG,
};

export interface ExtractorAPI {
  extractSite: (
    url: string,
    options?: import('./types').ExtractorOptions,
  ) => Promise<import('./types').ExtractorResult>;
  analyzeSite: (
    url: string,
    options?: import('./types').ExtractorOptions,
  ) => Promise<import('./types').ExtractorResult>;
  generatePlugin: (
    structure: import('./types').SiteStructure,
    selectors: import('./types').Selectors,
    options: import('./types').ExtractorOptions,
  ) => { pluginCode: string; baseClassCode?: string };
  findKnownSite: (
    url: string,
  ) => import('./knownSites').KnownSitePattern | null;
}

export const extractor: ExtractorAPI = {
  extractSite: analyzeSite,
  analyzeSite,
  generatePlugin,
  findKnownSite,
};

export default extractor;
