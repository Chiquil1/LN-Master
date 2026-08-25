import type { SiteType, SiteStructure, Selectors } from '../types';

export interface KnownSitePattern {
  domain: string;
  siteType: SiteType;
  confidence: number;
  baseSelectors: Partial<Selectors>;
  urlPatterns: Partial<SiteStructure['urlPatterns']>;
  chapterPattern: SiteStructure['chapterPattern']['type'];
  ajaxEndpoint?: string;
  customSettings?: Record<string, unknown>;
}

export const KNOWN_SITES: KnownSitePattern[] = [
  // Madara CMS sites
  {
    domain: 'animeshoy12.com',
    siteType: 'madara-cms',
    confidence: 95,
    chapterPattern: 'ajax-pages',
    ajaxEndpoint: '/wp-admin/admin-ajax.php',
    baseSelectors: {
      popularList: ['.page-item-detail', '.c-tabs-item__content'],
      novelTitle: ['.post-title h1', '#manga-title h1'],
      novelCover: [
        '.summary_image img@data-lazy-src',
        '.summary_image img@data-src',
        '.summary_image img@src',
      ],
      novelSummary: ['div.summary__content', '#tab-manga-about'],
      novelAuthor: [
        '.post-content_item h5:contains("Author") + .summary-content',
        '.manga-author a',
      ],
      novelStatus: [
        '.post-content_item h5:contains("Status") + .summary-content',
        '.manga-status',
      ],
      novelGenres: [
        '.post-content_item h5:contains("Genre") + .summary-content',
        '.genres-content',
      ],
      chapterContainer: ['.wp-manga-chapter'],
      chapterSelector: ['.wp-manga-chapter a'],
      chapterDate: ['span.chapter-release-date'],
      chapterContent: ['.text-left', '.text-right', '.entry-content'],
      searchResults: ['.page-item-detail'],
      searchTitle: ['.post-title a', '.manga-title a'],
      searchUrl: ['@href'],
      pagination: ['.pagination', '.wp-pagenavi'],
    },
    urlPatterns: {
      searchUrlTemplate:
        'https://animeshoy12.com/page/{page}/?s={query}&post_type=wp-manga',
      popularUrlTemplate:
        'https://animeshoy12.com/page/{page}/?s=&post_type=wp-manga',
    },
    customSettings: {
      hasLocked: true,
      useNewChapterEndpoint: false,
    },
  },
  {
    domain: 'panchonovels.com',
    siteType: 'madara-cms',
    confidence: 90,
    chapterPattern: 'ajax-pages',
    baseSelectors: {},
    urlPatterns: {
      searchUrlTemplate:
        'https://panchonovels.com/page/{page}/?s={query}&post_type=wp-manga',
      popularUrlTemplate:
        'https://panchonovels.com/page/{page}/?s=&post_type=wp-manga',
    },
  },
  {
    domain: 'traduccionesamistosas.com',
    siteType: 'madara-cms',
    confidence: 90,
    chapterPattern: 'ajax-pages',
    baseSelectors: {},
    urlPatterns: {
      searchUrlTemplate:
        'https://traduccionesamistosas.com/page/{page}/?s={query}&post_type=wp-manga',
      popularUrlTemplate:
        'https://traduccionesamistosas.com/page/{page}/?s=&post_type=wp-manga',
    },
  },
  {
    domain: 'panchotranslations.com',
    siteType: 'madara-cms',
    confidence: 90,
    chapterPattern: 'ajax-pages',
    baseSelectors: {},
    urlPatterns: {
      searchUrlTemplate:
        'https://panchotranslations.com/page/{page}/?s={query}&post_type=wp-manga',
      popularUrlTemplate:
        'https://panchotranslations.com/page/{page}/?s=&post_type=wp-manga',
    },
  },
  {
    domain: 'rittiscan.com',
    siteType: 'madara-cms',
    confidence: 90,
    chapterPattern: 'ajax-pages',
    baseSelectors: {},
    urlPatterns: {
      searchUrlTemplate:
        'https://rittiscan.com/page/{page}/?s={query}&post_type=wp-manga',
      popularUrlTemplate:
        'https://rittiscan.com/page/{page}/?s=&post_type=wp-manga',
    },
  },
  {
    domain: 'yukitls.com',
    siteType: 'madara-cms',
    confidence: 90,
    chapterPattern: 'ajax-pages',
    baseSelectors: {},
    urlPatterns: {
      searchUrlTemplate:
        'https://yukitls.com/page/{page}/?s={query}&post_type=wp-manga',
      popularUrlTemplate:
        'https://yukitls.com/page/{page}/?s=&post_type=wp-manga',
    },
  },
  {
    domain: 'oasistranslations.com',
    siteType: 'madara-cms',
    confidence: 90,
    chapterPattern: 'ajax-pages',
    baseSelectors: {},
    urlPatterns: {
      searchUrlTemplate:
        'https://oasistranslations.com/page/{page}/?s={query}&post_type=wp-manga',
      popularUrlTemplate:
        'https://oasistranslations.com/page/{page}/?s=&post_type=wp-manga',
    },
  },
  {
    domain: 'novelasligera.com',
    siteType: 'madara-cms',
    confidence: 85,
    chapterPattern: 'ajax-pages',
    baseSelectors: {},
    urlPatterns: {
      searchUrlTemplate:
        'https://novelasligera.com/page/{page}/?s={query}&post_type=wp-manga',
      popularUrlTemplate:
        'https://novelasligera.com/page/{page}/?s=&post_type=wp-manga',
    },
  },
  {
    domain: 'tunovelaligera.com',
    siteType: 'madara-cms',
    confidence: 85,
    chapterPattern: 'ajax-pages',
    baseSelectors: {},
    urlPatterns: {
      searchUrlTemplate:
        'https://tunovelaligera.com/page/{page}/?s={query}&post_type=wp-manga',
      popularUrlTemplate:
        'https://tunovelaligera.com/page/{page}/?s=&post_type=wp-manga',
    },
  },
  {
    domain: 'novelawuxia.com',
    siteType: 'madara-cms',
    confidence: 85,
    chapterPattern: 'ajax-pages',
    baseSelectors: {},
    urlPatterns: {
      searchUrlTemplate:
        'https://novelawuxia.com/page/{page}/?s={query}&post_type=wp-manga',
      popularUrlTemplate:
        'https://novelawuxia.com/page/{page}/?s=&post_type=wp-manga',
    },
  },
  {
    domain: 'hasutl.com',
    siteType: 'madara-cms',
    confidence: 85,
    chapterPattern: 'ajax-pages',
    baseSelectors: {},
    urlPatterns: {
      searchUrlTemplate:
        'https://hasutl.com/page/{page}/?s={query}&post_type=wp-manga',
      popularUrlTemplate:
        'https://hasutl.com/page/{page}/?s=&post_type=wp-manga',
    },
  },
  {
    domain: 'rncalation.com',
    siteType: 'madara-cms',
    confidence: 85,
    chapterPattern: 'ajax-pages',
    baseSelectors: {},
    urlPatterns: {
      searchUrlTemplate:
        'https://rncalation.com/page/{page}/?s={query}&post_type=wp-manga',
      popularUrlTemplate:
        'https://rncalation.com/page/{page}/?s=&post_type=wp-manga',
    },
  },

  // LightnovelWP sites
  {
    domain: 'tcandsega.com',
    siteType: 'lightnovelwp-cms',
    confidence: 90,
    chapterPattern: 'pagination',
    baseSelectors: {
      popularList: ['.novel-item', '.lnwp-chapter'],
      novelTitle: ['.novel-title', 'h1.title'],
      novelCover: ['.novel-cover img', '.book-cover img'],
      chapterContainer: ['.lnwp-chapter-list'],
      chapterSelector: ['.lnwp-chapter a', '.chapter-list a'],
      chapterContent: ['.reading-content', '.chapter-content'],
    },
    urlPatterns: {
      searchUrlTemplate:
        'https://tcandsega.com/search?keyword={query}&page={page}',
      popularUrlTemplate: 'https://tcandsega.com/page/{page}',
    },
  },
  {
    domain: 'allnovelread.com',
    siteType: 'lightnovelwp-cms',
    confidence: 90,
    chapterPattern: 'pagination',
    baseSelectors: {},
    urlPatterns: {
      searchUrlTemplate:
        'https://allnovelread.com/search?keyword={query}&page={page}',
      popularUrlTemplate: 'https://allnovelread.com/page/{page}',
    },
  },
  {
    domain: 'lightnoveldaily.com',
    siteType: 'lightnovelwp-cms',
    confidence: 85,
    chapterPattern: 'pagination',
    baseSelectors: {},
    urlPatterns: {
      searchUrlTemplate:
        'https://lightnoveldaily.com/search?keyword={query}&page={page}',
      popularUrlTemplate: 'https://lightnoveldaily.com/page/{page}',
    },
  },

  // Novelyra custom
  {
    domain: 'novelyra.com',
    siteType: 'novelyra-custom',
    confidence: 95,
    chapterPattern: 'embedded-json',
    baseSelectors: {
      popularList: ['main a.group.block.min-w-0'],
      novelTitle: ['h1', 'h3'],
      novelCover: ['#synopsis img', 'main img'],
      novelSummary: ['#synopsis'],
      novelAuthor: [],
      novelStatus: [],
      novelGenres: [],
      chapterContainer: ['a[href*="/chapter-"]'],
      chapterSelector: ['a[href*="/chapter-"]'],
      chapterTitle: ['span', 'h3'],
      chapterUrl: ['@href'],
      chapterContent: ['article'],
    },
    urlPatterns: {
      searchUrlTemplate: 'https://novelyra.com/search?q={query}&page={page}',
      popularUrlTemplate: 'https://novelyra.com?page={page}',
    },
    customSettings: {
      usesGoogleTranslate: true,
      cloudflareHeavy: true,
    },
  },

  // API-based sites
  {
    domain: 'skynovels.net',
    siteType: 'api-json',
    confidence: 95,
    chapterPattern: 'embedded-json',
    baseSelectors: {},
    urlPatterns: {
      searchUrlTemplate:
        'https://api.skynovels.net/api/novels?q={query}&page={page}',
      popularUrlTemplate: 'https://api.skynovels.net/api/novels?page={page}',
    },
    customSettings: {
      apiSite: 'https://api.skynovels.net/api/',
    },
  },
];

export function findKnownSite(url: string): KnownSitePattern | null {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    return KNOWN_SITES.find(site => hostname.includes(site.domain)) || null;
  } catch {
    return null;
  }
}

export function applyKnownSitePattern(
  structure: SiteStructure,
  knownSite: KnownSitePattern,
): SiteStructure {
  return {
    ...structure,
    siteType: knownSite.siteType,
    confidence: Math.max(structure.confidence, knownSite.confidence),
    chapterPattern: {
      ...structure.chapterPattern,
      type: knownSite.chapterPattern,
      ajaxPages: knownSite.ajaxEndpoint
        ? {
            endpoint: knownSite.ajaxEndpoint,
            pageParam: 'page',
            method: 'POST',
            payloadTemplate: { action: 'manga_get_chapters' },
            confidence: 85,
          }
        : structure.chapterPattern.ajaxPages,
    },
    selectors: mergeSelectors(structure.selectors, knownSite.baseSelectors),
    urlPatterns: {
      ...structure.urlPatterns,
      ...knownSite.urlPatterns,
    },
    knownCms: knownSite.domain,
  };
}

function mergeSelectors(base: Selectors, known: Partial<Selectors>): Selectors {
  const result = { ...base };
  for (const [key, value] of Object.entries(known)) {
    if (value && value.length > 0) {
      const existing = result[key as keyof Selectors] || [];
      result[key as keyof Selectors] = [
        ...value,
        ...existing.filter(v => !value.includes(v)),
      ];
    }
  }
  return result;
}
