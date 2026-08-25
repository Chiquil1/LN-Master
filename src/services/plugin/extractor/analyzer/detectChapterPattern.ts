import { type CheerioAPI } from 'cheerio';
import type {
  ChapterPattern,
  PaginationInfo,
  InfiniteScrollInfo,
  LoadMoreInfo,
  VolumeTabsInfo,
  AjaxPagesInfo,
  EmbeddedJsonInfo,
  SinglePageInfo,
} from '../types';

export function detectChapterPattern(
  $: CheerioAPI,
  html: string,
  url: string,
): ChapterPattern {
  const patterns: ChapterPattern[] = [];

  const pagination = detectPagination($);
  if (pagination) {
    patterns.push({
      type: 'pagination',
      confidence: pagination.confidence,
      pagination,
    });
  }

  const infiniteScroll = detectInfiniteScroll($, html);
  if (infiniteScroll) {
    patterns.push({
      type: 'infinite-scroll',
      confidence: infiniteScroll.confidence,
      infiniteScroll,
    });
  }

  const loadMore = detectLoadMore($, html);
  if (loadMore) {
    patterns.push({
      type: 'load-more',
      confidence: loadMore.confidence,
      loadMore,
    });
  }

  const volumeTabs = detectVolumeTabs($);
  if (volumeTabs) {
    patterns.push({
      type: 'volume-tabs',
      confidence: volumeTabs.confidence,
      volumeTabs,
    });
  }

  const ajaxPages = detectAjaxPages($, html);
  if (ajaxPages) {
    patterns.push({
      type: 'ajax-pages',
      confidence: ajaxPages.confidence,
      ajaxPages,
    });
  }

  const embeddedJson = detectEmbeddedJson($, html);
  if (embeddedJson) {
    patterns.push({
      type: 'embedded-json',
      confidence: embeddedJson.confidence,
      embeddedJson,
    });
  }

  const singlePage = detectSinglePage($);
  if (singlePage) {
    patterns.push({
      type: 'single-page',
      confidence: singlePage.confidence,
      singlePage,
    });
  }

  patterns.sort((a, b) => b.confidence - a.confidence);

  return (
    patterns[0] || {
      type: 'single-page',
      confidence: 10,
      singlePage: detectSinglePage($) || {
        chapterContainerSelector: '',
        chapterSelector: '',
        chapterTitleSelector: '',
        chapterUrlSelector: '',
      },
    }
  );
}

function detectPagination($: CheerioAPI): PaginationInfo | null {
  const paginationSelectors = [
    '.pagination',
    '.pagenavi',
    '.page-numbers',
    '.wp-pagenavi',
    '[class*="pagination"]',
    '[class*="page-numbers"]',
    'nav[aria-label="pagination"]',
  ];

  let bestMatch: PaginationInfo | null = null;
  let bestScore = 0;

  for (const selector of paginationSelectors) {
    const paginationEl = $(selector).first();
    if (paginationEl.length === 0) continue;

    let score = 10;
    const pageLinks = paginationEl.find(
      'a[href*="page"], a[href*="p="], a[href*="/page/"]',
    );
    const pageNumbers = paginationEl.find(
      'span.current, span.page-numbers.current, .current',
    );
    const nextLink = paginationEl.find(
      'a.next, a[rel="next"], .next-page, .pagination-next',
    );

    if (pageLinks.length > 0) score += pageLinks.length * 2;
    if (pageNumbers.length > 0) score += 10;
    if (nextLink.length > 0) score += 15;

    const urlSample = pageLinks.first().attr('href') || '';
    const pageParamMatch =
      urlSample.match(/[?&](page|p|pg)=(\d+)/i) ||
      urlSample.match(/\/page\/(\d+)/i);
    const pageParam = pageParamMatch?.[1] || 'page';

    const maxPagesText = pageLinks.last().text().trim();
    const _maxPages = parseInt(maxPagesText) || pageLinks.length;
    void _maxPages;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        confidence: score,
        pageParam,
        maxPagesSelector: selector,
        pageLinksSelector: 'a[href*="page"], a[href*="p="], a[href*="/page/"]',
        nextPageSelector:
          nextLink.length > 0 ? 'a.next, a[rel="next"]' : undefined,
        currentPageSelector:
          pageNumbers.length > 0 ? 'span.current, .current' : undefined,
      };
    }
  }

  if (bestMatch && bestScore > 20) {
    return { ...bestMatch, confidence: Math.min(bestScore, 95) };
  }

  return null;
}

function detectInfiniteScroll(
  $: CheerioAPI,
  html: string,
): InfiniteScrollInfo | null {
  const infiniteScrollIndicators = [
    'infinite-scroll',
    'infinite_scroll',
    'load more',
    'cargar mas',
    'cargar más',
    'ver mas',
    'ver más',
    'loadmore',
    'data-infinite',
    'data-load-more',
  ];

  let hasIndicator = false;
  for (const indicator of infiniteScrollIndicators) {
    if (html.toLowerCase().includes(indicator)) {
      hasIndicator = true;
      break;
    }
  }

  if (!hasIndicator) return null;

  const scripts = $('script').toArray();
  let ajaxEndpoint = '';
  let payloadTemplate: Record<string, unknown> = {};
  let pageParam = 'page';
  let perPageParam = 'per_page';
  let perPageValue = 50;
  const method: 'POST' | 'GET' = 'POST';

  for (const script of scripts) {
    const content = $(script).html() || '';

    const ajaxMatches = content.match(
      /(?:fetch|axios|\.ajax|XMLHttpRequest)\s*\(\s*["']([^"']+)["']/g,
    );
    if (ajaxMatches) {
      for (const match of ajaxMatches) {
        const url = match.match(/["']([^"']+)["']/)?.[1];
        if (
          url &&
          (url.includes('chapter') ||
            url.includes('ajax') ||
            url.includes('api'))
        ) {
          ajaxEndpoint = url;
          break;
        }
      }
    }

    const dataMatches = content.match(/data\s*:\s*\{[^}]+\}/g);
    if (dataMatches) {
      try {
        const dataStr = dataMatches[0].replace(/data\s*:\s*/, '');
        payloadTemplate = JSON.parse(dataStr.replace(/'/g, '"'));
      } catch {}
    }

    const pageMatch = content.match(/(?:page|p|pg)\s*[:=]\s*(\d+)/i);
    if (pageMatch) pageParam = pageMatch[1];

    const perPageMatch = content.match(
      /(?:per_page|perPage|limit|per-page)\s*[:=]\s*(\d+)/i,
    );
    if (perPageMatch) {
      perPageParam = perPageMatch[0].split(':')[0].trim();
      perPageValue = parseInt(perPageMatch[1]) || 50;
    }
  }

  if (!ajaxEndpoint) {
    const commonEndpoints = [
      '/ajax/chapters/',
      '/api/chapters/',
      '/wp-admin/admin-ajax.php',
      '/api/novel/chapters',
    ];
    for (const ep of commonEndpoints) {
      if (html.includes(ep)) {
        ajaxEndpoint = ep;
        break;
      }
    }
  }

  if (!ajaxEndpoint) return null;

  return {
    ajaxEndpoint,
    payloadTemplate,
    pageParam,
    perPageParam,
    perPageValue,
    method,
    confidence: 70,
  };
}

function detectLoadMore($: CheerioAPI, html: string): LoadMoreInfo | null {
  const loadMoreSelectors = [
    '.load-more',
    '.loadmore',
    '[class*="load-more"]',
    '[class*="loadmore"]',
    'button:contains("Load more")',
    'button:contains("Cargar más")',
    'button:contains("Ver más")',
    'a:contains("Load more")',
    'a:contains("Cargar más")',
    '.btn-load-more',
    '#load-more',
    '[data-load-more]',
  ];

  for (const selector of loadMoreSelectors) {
    const btn = $(selector).first();
    if (btn.length > 0) {
      const ajaxEndpoint =
        btn.attr('data-ajax') || btn.attr('data-url') || btn.attr('href') || '';
      const payloadStr =
        btn.attr('data-payload') || btn.attr('data-params') || '';
      let payloadTemplate: Record<string, unknown> = {};

      if (payloadStr) {
        try {
          payloadTemplate = JSON.parse(payloadStr);
        } catch {}
      }

      return {
        buttonSelector: selector,
        ajaxEndpoint: ajaxEndpoint || undefined,
        payloadTemplate:
          Object.keys(payloadTemplate).length > 0 ? payloadTemplate : undefined,
        triggerEvent: btn.is('button') ? 'click' : 'click',
        confidence: 80,
      };
    }
  }

  return null;
}

function detectVolumeTabs($: CheerioAPI): VolumeTabsInfo | null {
  const tabContainers = [
    '.volume-tabs',
    '.volumes-tabs',
    '.chapter-volumes',
    '[class*="volume"][class*="tab"]',
    '.tab-content',
    '.nav-tabs',
    '.c-tabs',
    '.tabs',
  ];

  for (const containerSelector of tabContainers) {
    const container = $(containerSelector).first();
    if (container.length === 0) continue;

    const tabs = container.find(
      '.tab, .tab-pane, [role="tabpanel"], .c-tabs-item__content, .tab-content > div',
    );
    if (tabs.length < 2) continue;

    const tabTitles = container
      .find('.tab-title, .nav-tab, [role="tab"], .c-tabs-nav a, .nav-tabs a')
      .toArray();
    const chapterContainers = tabs
      .toArray()
      .map(t =>
        $(t).find(
          '.wp-manga-chapter, .chapter-item, .chapter-list a, li a[href*="chapter"], li a[href*="capitulo"]',
        ),
      );
    const hasChapters = chapterContainers.some(c => c.length > 0);

    if (hasChapters) {
      return {
        tabContainerSelector: containerSelector,
        tabSelector:
          tabTitles.length > 0
            ? '.tab-title, .nav-tab, [role="tab"]'
            : '[role="tabpanel"], .tab-pane, .c-tabs-item__content',
        tabTitleSelector: 'a, span, .tab-title',
        chapterContainerSelector:
          '.wp-manga-chapter, .chapter-list, ul.chapter-list',
        chapterSelector:
          'a[href*="chapter"], a[href*="capitulo"], .chapter-item a',
        confidence: 85,
      };
    }
  }

  return null;
}

function detectAjaxPages($: CheerioAPI, html: string): AjaxPagesInfo | null {
  const scripts = $('script').toArray();

  for (const script of scripts) {
    const content = $(script).html() || '';

    const novelIdMatch = content.match(
      /(?:novel_id|manga_id|post_id|novelId|mangaId)\s*[:=]\s*["']?(\d+)["']?/i,
    );
    const novelId = novelIdMatch?.[1];

    const endpointMatch = content.match(
      /(?:fetch|axios|\.ajax)\s*\(\s*["']([^"']*(?:chapter|ajax|chapters)[^"']*)["']/i,
    );
    const endpoint = endpointMatch?.[1];

    if (endpoint && novelId) {
      return {
        endpoint,
        pageParam: 'page',
        novelIdParam: 'novel_id',
        novelIdExtractor: novelId,
        method: 'POST',
        payloadTemplate: { novel_id: novelId, page: 1 },
        confidence: 75,
      };
    }
  }

  const commonEndpoints = [
    { endpoint: '/ajax/chapters/', method: 'POST' as const },
    { endpoint: '/wp-admin/admin-ajax.php', method: 'POST' as const },
    { endpoint: '/api/chapters', method: 'GET' as const },
  ];

  for (const { endpoint, method } of commonEndpoints) {
    if (html.includes(endpoint)) {
      return {
        endpoint,
        pageParam: 'page',
        method,
        payloadTemplate: { page: 1 },
        confidence: 50,
      };
    }
  }

  return null;
}

function detectEmbeddedJson(
  $: CheerioAPI,
  html: string,
): EmbeddedJsonInfo | null {
  const scriptSelectors = [
    'script[type="application/json"]',
    'script[data-novel]',
    'script[data-chapters]',
    'script[id*="novel"]',
    'script[id*="chapter"]',
    '#__NEXT_DATA__',
    '#__NUXT__',
    'script:contains("chapters")',
    'script:contains("volumes")',
  ];

  for (const selector of scriptSelectors) {
    const scripts = $(selector);
    for (const script of scripts.toArray()) {
      const content = $(script).html() || '';
      if (!content.trim()) continue;

      try {
        let json: unknown;
        if (selector.includes('application/json')) {
          json = JSON.parse(content);
        } else {
          const match = content.match(/({.*})/s);
          if (match) json = JSON.parse(match[1]);
        }

        if (!json || typeof json !== 'object') continue;

        const chaptersPath = findChaptersPath(json);
        if (chaptersPath) {
          const sampleChapter = getNestedValue(json, `${chaptersPath}[0]`);
          if (sampleChapter) {
            return {
              scriptSelector: selector,
              jsonPath: '',
              chaptersPath,
              chapterTitlePath: findKeyPath(sampleChapter, [
                'title',
                'name',
                'chp_title',
                'chp_index_title',
                'chapter_name',
              ]),
              chapterUrlPath: findKeyPath(sampleChapter, [
                'url',
                'path',
                'href',
                'link',
                'chp_url',
                'chapter_url',
              ]),
              chapterNumberPath: findKeyPath(sampleChapter, [
                'number',
                'chapter',
                'chp_number',
                'chapter_number',
                'id',
              ]),
              chapterDatePath: findKeyPath(sampleChapter, [
                'date',
                'created',
                'createdAt',
                'release_date',
                'release_time',
                'updated_at',
              ]),
              confidence: 90,
            };
          }
        }
      } catch {}
    }
  }

  return null;
}

function findChaptersPath(obj: unknown, path = ''): string | null {
  if (!obj || typeof obj !== 'object') return null;

  if (Array.isArray(obj)) {
    if (obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null) {
      const keys = Object.keys(obj[0]);
      if (
        keys.some(
          k =>
            k.includes('chapter') || k.includes('chp_') || k.includes('vol_'),
        )
      ) {
        return path || 'chapters';
      }
    }
    return null;
  }

  const objRecord = obj as Record<string, unknown>;
  for (const [key, value] of Object.entries(objRecord)) {
    if (
      key.toLowerCase().includes('chapter') ||
      key.toLowerCase().includes('volume')
    ) {
      const result = findChaptersPath(value, key);
      if (result) return result;
    }
  }

  return null;
}

function findKeyPath(obj: unknown, keys: string[]): string {
  if (!obj || typeof obj !== 'object') return '';
  const objRecord = obj as Record<string, unknown>;
  for (const key of keys) {
    if (key in objRecord) return key;
  }
  return keys[0];
}

function getNestedValue(obj: unknown, path: string): unknown {
  return path.split('.').reduce((acc, part) => {
    const match = part.match(/^(.+)\[(\d+)\]$/);
    if (match) {
      return (acc as Record<string, unknown>[])?.[parseInt(match[2])]?.[
        match[1]
      ];
    }
    return (acc as Record<string, unknown>)?.[part];
  }, obj);
}

function detectSinglePage($: CheerioAPI): SinglePageInfo | null {
  const chapterContainers = [
    '.wp-manga-chapter',
    '.chapter-list',
    '.chapters-list',
    '#chapters',
    '.volume-chapters',
    '[class*="chapter-list"]',
    '[class*="chapters-list"]',
    'ul.chapters',
    '.list-chapter',
  ];

  let bestMatch: SinglePageInfo | null = null;
  let bestScore = 0;

  for (const container of chapterContainers) {
    const containerEl = $(container).first();
    if (containerEl.length === 0) continue;

    const chapters = containerEl.find(
      'a[href*="chapter"], a[href*="capitulo"], li a, .chapter-item a',
    );
    if (chapters.length < 5) continue;

    const score = chapters.length * 2;
    const sampleChapter = chapters.first();
    const titleEl = sampleChapter
      .find('.chapter-title, .chp-title, span, strong')
      .first();
    const titleSelector =
      titleEl.length > 0
        ? titleEl.prop('tagName')?.toLowerCase() || 'span'
        : 'a';
    const urlAttr = sampleChapter.attr('href') ? 'href' : 'data-url';

    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        chapterContainerSelector: container,
        chapterSelector:
          'a[href*="chapter"], a[href*="capitulo"], li a, .chapter-item a',
        chapterTitleSelector: titleSelector,
        chapterUrlSelector: `@${urlAttr}`,
        chapterNumberSelector: undefined,
        chapterDateSelector: undefined,
        confidence: Math.min(score, 80),
      };
    }
  }

  return bestMatch;
}
