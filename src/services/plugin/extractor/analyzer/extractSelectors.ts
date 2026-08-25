import { type CheerioAPI } from 'cheerio';
import type { Selectors } from '../types';

const SELECTOR_CANDIDATES: Record<keyof Selectors, string[]> = {
  novelTitle: [
    'h1.novel-title',
    'h1.post-title',
    'h1.book-title',
    'h1.entry-title',
    '.novel-title h1',
    '.post-title h1',
    '.manga-title h1',
    '#novel-title',
    '#manga-title',
    'h1[class*="title"]',
    'h1',
  ],
  novelCover: [
    '.novel-cover img',
    '.book-cover img',
    '.manga-cover img',
    '.summary_image img',
    '.post-thumbnail img',
    '.novel-img img',
    'img[class*="cover"]',
    'img[class*="thumbnail"]',
    'img.cover',
    'img.thumbnail',
  ],
  novelSummary: [
    '.novel-summary',
    '.book-summary',
    '.manga-summary',
    '.summary__content',
    '.post-content',
    '.entry-content',
    '.description',
    '#synopsis',
    '[class*="summary"]',
    '[class*="description"]',
    '[class*="synopsis"]',
  ],
  novelAuthor: [
    '.novel-author',
    '.book-author',
    '.manga-author',
    '.author',
    '[class*="author"]',
    '.post-author',
    '.manga-author a',
    '.author-content a',
  ],
  novelArtist: [
    '.novel-artist',
    '.book-artist',
    '.artist',
    '[class*="artist"]',
    '.manga-artist',
  ],
  novelStatus: [
    '.novel-status',
    '.book-status',
    '.manga-status',
    '.status',
    '[class*="status"]',
    '.post-status',
  ],
  novelGenres: [
    '.novel-genres',
    '.book-genres',
    '.genres',
    '.tags',
    '[class*="genre"]',
    '[class*="tag"]',
    '.genres-content',
    '.manga-genres',
  ],
  novelRating: [
    '.novel-rating',
    '.rating',
    '.post-rating',
    '[class*="rating"]',
    '.score',
  ],
  chapterContainer: [
    '.wp-manga-chapter',
    '.chapter-list',
    '.chapters-list',
    '#chapters',
    '.volume-chapters',
    '[class*="chapter-list"]',
    '[class*="chapters-list"]',
    '.lnwp-chapter-list',
    '.chp-list',
  ],
  chapterSelector: [
    'li.wp-manga-chapter a',
    '.chapter-item a',
    '.chapters li a',
    '.wp-manga-chapter a',
    '[class*="chapter"] a',
    'ul.chapters li a',
    '.chapter-list li a',
    'a[href*="chapter"]',
    'a[href*="capitulo"]',
  ],
  chapterTitle: [
    'a',
    '.chapter-title',
    '.chp-title',
    '.chapter-name',
    'span.chapter-title',
    'strong',
    '.title',
  ],
  chapterUrl: ['@href', '@data-url', '@data-link'],
  chapterNumber: [
    '.chapter-number',
    '.chp-number',
    '[data-chapter-number]',
    '[data-number]',
  ],
  chapterDate: [
    '.chapter-date',
    '.chp-date',
    '.chapter-release-date',
    '.release-date',
    '[class*="date"]',
    'time',
    'span.date',
    '.chapter-time',
  ],
  chapterScanlator: [
    '.chapter-scanlator',
    '.scanlator',
    '.group',
    '[class*="scanlator"]',
    '[class*="group"]',
  ],
  chapterContent: [
    '.reading-content',
    '.chapter-content',
    '.text-left',
    '.text-right',
    '.entry-content',
    '.c-blog-post',
    '#chapter-content',
    '[class*="content"]',
    'article',
    '.fr-view',
  ],
  removeFromContent: [
    'script',
    'style',
    'iframe',
    'ins',
    'nav',
    'header',
    'footer',
    'aside',
    '.ads',
    '.advertisement',
    '.adsbygoogle',
    '.hidden',
    '[style*="display:none"]',
    '[style*="display: none"]',
    '.chapter-ad',
    '.chapter-nav',
    '.navigation',
    '.prev-next',
    '.chapter-links',
    '#comments',
    '.comments',
    '.related-posts',
    '.share-buttons',
    '.social-share',
  ],
  searchResults: [
    '.search-results .item',
    '.search-result',
    '.c-tabs-item__content .page-item-detail',
    '.page-item-detail',
    '.manga-title-badges',
    '[class*="search"] .item',
    '[class*="result"] .item',
  ],
  searchTitle: [
    '.post-title a',
    '.manga-title a',
    '.title a',
    'h3 a',
    'h4 a',
    '.item-title a',
  ],
  searchUrl: ['@href'],
  searchCover: ['img@data-src', 'img@data-lazy-src', 'img@src'],
  popularList: [
    '.popular-novels .item',
    '.latest-updates .item',
    '.novel-list .item',
    '.page-item-detail',
    '[class*="popular"] .item',
    '[class*="latest"] .item',
  ],
  popularTitle: ['.post-title a', '.manga-title a', 'h3 a', '.title a'],
  popularUrl: ['@href'],
  popularCover: ['img@data-src', 'img@data-lazy-src', 'img@src'],
  pagination: [
    '.pagination',
    '.pagenavi',
    '.page-numbers',
    '.wp-pagenavi',
    '[class*="pagination"]',
  ],
  nextPage: [
    'a.next',
    'a[rel="next"]',
    '.next-page',
    '.pagination-next',
    'a:contains("Next")',
    'a:contains("Siguiente")',
  ],
  loadMoreButton: [
    '.load-more',
    '.loadmore',
    '[class*="load-more"]',
    '[class*="loadmore"]',
    'button:contains("Load more")',
    'button:contains("Cargar más")',
    'a:contains("Load more")',
    'a:contains("Cargar más")',
  ],
  volumeTabs: [
    '.volume-tabs',
    '.volumes-tabs',
    '.chapter-volumes',
    '[class*="volume"][class*="tab"]',
    '.tab-content',
    '.nav-tabs',
    '.c-tabs',
    '.tabs',
  ],
  volumeTab: [
    '.tab',
    '.tab-pane',
    '[role="tabpanel"]',
    '.c-tabs-item__content',
    '.tab-content > div',
  ],
  volumeChapterContainer: [
    '.wp-manga-chapter',
    '.chapter-list',
    '.chapter-item',
  ],
};

export function extractSelectors($: CheerioAPI, html: string): Selectors {
  const selectors: Selectors = {} as Selectors;

  for (const [key, candidates] of Object.entries(SELECTOR_CANDIDATES)) {
    selectors[key as keyof Selectors] = findBestSelectors($, candidates);
  }

  return selectors;
}

function findBestSelectors($: CheerioAPI, candidates: string[]): string[] {
  const results: string[] = [];

  for (const candidate of candidates) {
    try {
      const elements = $(candidate);
      if (elements.length > 0) {
        results.push(candidate);
      }
    } catch {
      // Invalid selector, skip
    }
  }

  return results;
}

export function generateRobustSelectors(
  $: CheerioAPI,
  baseSelectors: Selectors,
): Selectors {
  const robust: Selectors = {} as Selectors;

  for (const [key, selectors] of Object.entries(baseSelectors)) {
    robust[key as keyof Selectors] = enhanceSelectors(
      $,
      selectors,
      key as keyof Selectors,
    );
  }

  return robust;
}

function enhanceSelectors(
  $: CheerioAPI,
  selectors: string[],
  key: keyof Selectors,
): string[] {
  const enhanced = [...selectors];

  if (selectors.length === 0) {
    enhanced.push(...getFallbackSelectors(key));
  }

  const genericFallbacks = getGenericFallbacks(key);
  enhanced.push(...genericFallbacks);

  return [...new Set(enhanced)];
}

function getFallbackSelectors(key: keyof Selectors): string[] {
  const fallbacks: Record<keyof Selectors, string[]> = {
    novelTitle: ['h1', 'h2.title', '.title h1', '.title'],
    novelCover: ['img.cover', 'img[src*="cover"]', 'img:first-of-type'],
    novelSummary: [
      '.summary',
      '.description',
      '.synopsis',
      'meta[name="description"]@content',
    ],
    novelAuthor: ['.author', '[class*="author"]', '.writer'],
    novelArtist: ['.artist', '[class*="artist"]', '.illustrator'],
    novelStatus: ['.status', '[class*="status"]', '.state'],
    novelGenres: ['.genres', '.tags', '[class*="genre"]', '[class*="tag"]'],
    novelRating: ['.rating', '[class*="rating"]', '.score'],
    chapterContainer: ['.chapters', '.chapter-list', '#chapters', 'ul', 'ol'],
    chapterSelector: ['a[href*="chapter"]', 'a[href*="capitulo"]', 'li a'],
    chapterTitle: ['a', 'span', 'strong', '.title'],
    chapterUrl: ['@href'],
    chapterNumber: ['[data-chapter]', '[data-number]'],
    chapterDate: ['time', '.date', '[class*="date"]'],
    chapterScanlator: ['.scanlator', '.group', '[class*="scan"]'],
    chapterContent: [
      '.content',
      'article',
      '#content',
      '.text',
      '.reading-content',
    ],
    removeFromContent: ['script', 'style', 'nav', 'footer', '.ads', '.ad'],
    searchResults: ['.results .item', '.search .item', '.list .item'],
    searchTitle: ['a', '.title a', 'h3 a', 'h4 a'],
    searchUrl: ['@href'],
    searchCover: ['img@src', 'img@data-src'],
    popularList: ['.popular .item', '.latest .item', '.list .item'],
    popularTitle: ['a', '.title a', 'h3 a'],
    popularUrl: ['@href'],
    popularCover: ['img@src', 'img@data-src'],
    pagination: ['.pagination', '.pages', '[class*="page"]'],
    nextPage: [
      'a.next',
      'a[rel="next"]',
      'a:contains("Next")',
      'a:contains("Siguiente")',
    ],
    loadMoreButton: [
      '.load-more',
      'button:contains("Load")',
      'button:contains("Cargar")',
    ],
    volumeTabs: ['.tabs', '.volumes', '[class*="tab"]'],
    volumeTab: ['.tab', '[role="tabpanel"]', '.tab-pane'],
    volumeChapterContainer: ['.chapters', '.chapter-list', 'ul'],
  };

  return fallbacks[key] || [];
}

function getGenericFallbacks(key: keyof Selectors): string[] {
  return [];
}

export function validateSelectors(
  $: CheerioAPI,
  selectors: Selectors,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  const criticalSelectors: (keyof Selectors)[] = [
    'novelTitle',
    'chapterContainer',
    'chapterSelector',
    'chapterTitle',
    'chapterUrl',
    'chapterContent',
  ];

  for (const key of criticalSelectors) {
    const sels = selectors[key];
    if (!sels || sels.length === 0) {
      issues.push(`Missing critical selector: ${key}`);
      continue;
    }

    let found = false;
    for (const sel of sels) {
      try {
        if ($(sel).length > 0) {
          found = true;
          break;
        }
      } catch {}
    }

    if (!found) {
      issues.push(`Selector not found: ${key} (tried: ${sels.join(', ')})`);
    }
  }

  return { valid: issues.length === 0, issues };
}

export function scoreSelectors($: CheerioAPI, selectors: Selectors): number {
  let score = 0;
  let total = 0;

  for (const [, sels] of Object.entries(selectors)) {
    if (!sels || sels.length === 0) continue;
    total++;

    for (const sel of sels) {
      try {
        if ($(sel).length > 0) {
          score++;
          break;
        }
      } catch {}
    }
  }

  return total > 0 ? Math.round((score / total) * 100) : 0;
}
