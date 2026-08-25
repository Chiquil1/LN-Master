import { load, type CheerioAPI } from 'cheerio';
import { fetchHtml } from './fetchHtml';
import type { Selectors, SiteStructure, ValidationReport } from '../types';

export async function validateSelectors(
  structure: SiteStructure,
  options: {
    testChapterUrls?: number;
    maxPages?: number;
    baseUrl?: string;
  } = {},
): Promise<ValidationReport> {
  const { testChapterUrls = 3, maxPages = 5, baseUrl } = options;
  const url = baseUrl || structure.urlPatterns.novelPathRegex;

  const report: ValidationReport = {
    novelMeta: { passed: false, details: [] },
    chapterList: {
      passed: false,
      details: [],
      totalExpected: 0,
      totalFound: 0,
      missingPages: [],
      pagesTested: 0,
    },
    chapterContent: { passed: false, details: [], tested: 0, avgLength: 0 },
    search: { passed: false, details: [] },
    cloudflare: {
      passed: false,
      details: [],
      handled: false,
      needsWebView: false,
    },
    overallPassed: false,
  };

  try {
    const fetchResult = await fetchHtml(url);
    const $ = load(fetchResult.html);

    if (fetchResult.isCloudflareChallenge) {
      report.cloudflare.needsWebView = true;
      report.cloudflare.details.push(
        'Cloudflare challenge detected - requires WebView first',
      );
    } else {
      report.cloudflare.handled = true;
      report.cloudflare.passed = true;
    }

    await validateNovelMeta($, structure.selectors, report);
    await validateChapterList($, fetchResult.html, structure, report, {
      testChapterUrls,
      maxPages,
    });
    await validateChapterContent($, structure.selectors, report, {
      testChapterUrls,
    });
    await validateSearch($, structure.selectors, report, baseUrl);
  } catch (error) {
    report.novelMeta.details.push(
      `Validation error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  report.overallPassed =
    report.novelMeta.passed &&
    report.chapterList.passed &&
    report.chapterContent.passed;

  return report;
}

async function validateNovelMeta(
  $: CheerioAPI,
  selectors: Selectors,
  report: ValidationReport,
): Promise<void> {
  const fields = [
    { key: 'novelTitle', label: 'Title' },
    { key: 'novelCover', label: 'Cover' },
    { key: 'novelSummary', label: 'Summary' },
    { key: 'novelAuthor', label: 'Author' },
    { key: 'novelStatus', label: 'Status' },
    { key: 'novelGenres', label: 'Genres' },
  ];

  let passed = 0;
  for (const { key, label } of fields) {
    const sels = selectors[key as keyof Selectors];
    let found = false;
    let value = '';

    if (sels && sels.length > 0) {
      for (const sel of sels) {
        try {
          const el = $(sel).first();
          if (el.length > 0) {
            value = sel.startsWith('@')
              ? el.attr(sel.slice(1)) || ''
              : el.text().trim();
            if (value) {
              found = true;
              break;
            }
          }
        } catch {}
      }
    }

    if (found) {
      passed++;
      report.novelMeta.details.push(`✓ ${label}: "${value.substring(0, 50)}"`);
    } else {
      report.novelMeta.details.push(
        `✗ ${label}: Not found (tried: ${sels?.join(', ') || 'none'})`,
      );
    }
  }

  report.novelMeta.passed = passed >= 3;
}

async function validateChapterList(
  $: CheerioAPI,
  html: string,
  structure: SiteStructure,
  report: ValidationReport,
  options: { testChapterUrls: number; maxPages: number },
): Promise<void> {
  const { testChapterUrls: _testChapterUrls, maxPages } = options;
  const pattern = structure.chapterPattern;

  let totalFound = 0;
  const missingPages: number[] = [];

  if (pattern.type === 'pagination' && pattern.pagination) {
    const pagesToTest = Math.min(maxPages, 10);

    for (let page = 1; page <= pagesToTest; page++) {
      report.chapterList.pagesTested++;
      let pageHtml = html;
      let page$ = $;

      if (page > 1) {
        try {
          const pageUrl = buildPageUrl(structure.urlPatterns, page);
          const fetchResult = await fetchHtml(pageUrl);
          pageHtml = fetchResult.html;
          page$ = load(pageHtml);
        } catch (error) {
          missingPages.push(page);
          report.chapterList.details.push(`✗ Page ${page}: Fetch failed`);
          continue;
        }
      }

      const chapters = extractChaptersFromPage(page$, structure.selectors);
      totalFound += chapters.length;

      if (chapters.length > 0) {
        report.chapterList.details.push(
          `✓ Page ${page}: ${chapters.length} chapters`,
        );
      } else {
        missingPages.push(page);
        report.chapterList.details.push(`✗ Page ${page}: No chapters found`);
      }
    }

    report.chapterList.totalExpected =
      totalFound * Math.max(1, Math.ceil(10 / pagesToTest));
    report.chapterList.totalFound = totalFound;
    report.chapterList.missingPages = missingPages;
    report.chapterList.passed = missingPages.length === 0 && totalFound > 0;
  } else if (
    pattern.type === 'single-page' ||
    pattern.type === 'embedded-json'
  ) {
    const chapters = extractChaptersFromPage($, structure.selectors);
    totalFound = chapters.length;
    report.chapterList.totalExpected = totalFound;
    report.chapterList.totalFound = totalFound;
    report.chapterList.passed = totalFound > 0;
    report.chapterList.details.push(`✓ Single page: ${totalFound} chapters`);
  } else if (pattern.type === 'volume-tabs' && pattern.volumeTabs) {
    const tabContainers = $(pattern.volumeTabs.tabContainerSelector);
    let volTotal = 0;

    tabContainers.each((_, tabEl) => {
      const tab$ = $(tabEl);
      const chapters = tab$.find(pattern.volumeTabs!.chapterSelector);
      volTotal += chapters.length;
    });

    totalFound = volTotal;
    report.chapterList.totalExpected = volTotal;
    report.chapterList.totalFound = volTotal;
    report.chapterList.passed = volTotal > 0;
    report.chapterList.details.push(
      `✓ Volume tabs: ${volTotal} chapters across tabs`,
    );
  } else if (pattern.type === 'ajax-pages' && pattern.ajaxPages) {
    report.chapterList.details.push(
      '⚠ AJAX pages: Cannot validate without API endpoint',
    );
    report.chapterList.passed = true;
  } else if (pattern.type === 'infinite-scroll' && pattern.infiniteScroll) {
    report.chapterList.details.push(
      '⚠ Infinite scroll: Cannot validate without API endpoint',
    );
    report.chapterList.passed = true;
  } else if (pattern.type === 'load-more' && pattern.loadMore) {
    report.chapterList.details.push(
      '⚠ Load more: Cannot validate without interaction',
    );
    report.chapterList.passed = true;
  }
}

function extractChaptersFromPage(
  $: CheerioAPI,
  selectors: Selectors,
): { title: string; url: string }[] {
  const chapters: { title: string; url: string }[] = [];
  const containerSel = selectors.chapterContainer[0];
  const chapterSel = selectors.chapterSelector[0];
  const titleSel = selectors.chapterTitle[0];
  const urlSel = selectors.chapterUrl[0];

  if (!containerSel || !chapterSel) return chapters;

  const containers = $(containerSel);
  if (containers.length === 0) {
    const allChapters = $(chapterSel);
    allChapters.each((_, el) => {
      const $el = $(el);
      const title =
        $el.find(titleSel).first().text().trim() || $el.text().trim();
      const url = $el.attr(urlSel?.replace('@', '') || 'href') || '';
      if (title && url) chapters.push({ title, url });
    });
    return chapters;
  }

  containers.each((_, container) => {
    const $container = $(container);
    $container.find(chapterSel).each((_, el) => {
      const $el = $(el);
      const title =
        $el.find(titleSel).first().text().trim() || $el.text().trim();
      const url = $el.attr(urlSel?.replace('@', '') || 'href') || '';
      if (title && url) chapters.push({ title, url });
    });
  });

  return chapters;
}

function buildPageUrl(
  urlPatterns: SiteStructure['urlPatterns'],
  page: number,
): string {
  const template =
    urlPatterns.popularUrlTemplate || urlPatterns.searchUrlTemplate;
  return template.replace('{page}', String(page));
}

async function validateChapterContent(
  $: CheerioAPI,
  selectors: Selectors,
  report: ValidationReport,
  options: { testChapterUrls: number },
): Promise<void> {
  const contentSel = selectors.chapterContent[0];

  if (!contentSel) {
    report.chapterContent.details.push('✗ No chapter content selector');
    return;
  }

  const contentEl = $(contentSel).first();
  if (contentEl.length === 0) {
    report.chapterContent.details.push('✗ Chapter content selector not found');
    return;
  }

  const cleanText = contentEl.text().trim().replace(/\s+/g, ' ');
  const length = cleanText.length;

  report.chapterContent.tested = 1;
  report.chapterContent.avgLength = length;
  report.chapterContent.details.push(`✓ Content length: ${length} chars`);
  report.chapterContent.passed = length > 500;
}

async function validateSearch(
  $: CheerioAPI,
  selectors: Selectors,
  report: ValidationReport,
  baseUrl?: string,
): Promise<void> {
  const resultsSel = selectors.searchResults[0];
  const titleSel = selectors.searchTitle[0];
  const urlSel = selectors.searchUrl[0];

  if (!resultsSel || !titleSel) {
    report.search.details.push('⚠ Search selectors not fully configured');
    report.search.passed = true;
    return;
  }

  const results = $(resultsSel);
  if (results.length === 0) {
    report.search.details.push('⚠ No search results found on current page');
    report.search.passed = true;
    return;
  }

  let found = 0;
  results.slice(0, 5).each((_, el) => {
    const $el = $(el);
    const title = $el.find(titleSel).first().text().trim();
    const url =
      $el
        .find(urlSel?.replace('@', '') || 'a')
        .first()
        .attr('href') || '';

    if (title && url) {
      found++;
    }
  });

  report.search.details.push(
    `✓ Search results: ${found}/${results.length} valid`,
  );
  report.search.passed = found > 0;
}
