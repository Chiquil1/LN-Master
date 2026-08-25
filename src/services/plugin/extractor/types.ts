export type SiteType =
  | 'api-json'
  | 'madara-cms'
  | 'lightnovelwp-cms'
  | 'html-generic'
  | 'novelyra-custom'
  | 'unknown';

export type ChapterPatternType =
  | 'pagination'
  | 'infinite-scroll'
  | 'load-more'
  | 'volume-tabs'
  | 'ajax-pages'
  | 'embedded-json'
  | 'single-page';

export interface ChapterPattern {
  type: ChapterPatternType;
  confidence: number;
  pagination?: PaginationInfo;
  infiniteScroll?: InfiniteScrollInfo;
  loadMore?: LoadMoreInfo;
  volumeTabs?: VolumeTabsInfo;
  ajaxPages?: AjaxPagesInfo;
  embeddedJson?: EmbeddedJsonInfo;
  singlePage?: SinglePageInfo;
}

export interface PaginationInfo {
  confidence: number;
  pageParam: string;
  maxPagesSelector: string;
  pageLinksSelector: string;
  nextPageSelector?: string;
  currentPageSelector?: string;
}

export interface InfiniteScrollInfo {
  confidence: number;
  ajaxEndpoint: string;
  payloadTemplate: Record<string, unknown>;
  pageParam: string;
  perPageParam?: string;
  perPageValue?: number;
  method: 'POST' | 'GET';
  headers?: Record<string, string>;
}

export interface LoadMoreInfo {
  confidence: number;
  buttonSelector: string;
  ajaxEndpoint?: string;
  payloadTemplate?: Record<string, unknown>;
  triggerEvent?: 'click' | 'scroll' | 'intersection';
}

export interface VolumeTabsInfo {
  confidence: number;
  tabContainerSelector: string;
  tabSelector: string;
  tabTitleSelector: string;
  chapterContainerSelector: string;
  chapterSelector: string;
}

export interface AjaxPagesInfo {
  confidence: number;
  endpoint: string;
  pageParam: string;
  novelIdParam?: string;
  novelIdExtractor?: string;
  method: 'POST' | 'GET';
  payloadTemplate?: Record<string, unknown>;
}

export interface EmbeddedJsonInfo {
  confidence: number;
  scriptSelector: string;
  jsonPath: string;
  chaptersPath: string;
  chapterTitlePath: string;
  chapterUrlPath: string;
  chapterNumberPath?: string;
  chapterDatePath?: string;
  chapterScanlatorPath?: string;
}

export interface SinglePageInfo {
  confidence: number;
  chapterContainerSelector: string;
  chapterSelector: string;
  chapterTitleSelector: string;
  chapterUrlSelector: string;
  chapterNumberSelector?: string;
  chapterDateSelector?: string;
}

export interface Selectors {
  novelTitle: string[];
  novelCover: string[];
  novelSummary: string[];
  novelAuthor: string[];
  novelArtist: string[];
  novelStatus: string[];
  novelGenres: string[];
  novelRating: string[];
  chapterContainer: string[];
  chapterSelector: string[];
  chapterTitle: string[];
  chapterUrl: string[];
  chapterNumber: string[];
  chapterDate: string[];
  chapterScanlator: string[];
  chapterContent: string[];
  removeFromContent: string[];
  searchResults: string[];
  searchTitle: string[];
  searchUrl: string[];
  searchCover: string[];
  popularList: string[];
  popularTitle: string[];
  popularUrl: string[];
  popularCover: string[];
  pagination: string[];
  nextPage: string[];
  loadMoreButton: string[];
  volumeTabs: string[];
  volumeTab: string[];
  volumeChapterContainer: string[];
}

export interface UrlPatterns {
  novelPathRegex: string;
  chapterPathRegex: string;
  searchUrlTemplate: string;
  popularUrlTemplate: string;
  ajaxEndpoint?: string;
}

export interface CloudflareInfo {
  hasChallenge: boolean;
  hasTurnstile: boolean;
  cfClearanceCookie: boolean;
  challengeText?: string;
  recommendation: 'USE_WEBVIEW_FIRST' | 'COOKIES_PERSISTED' | 'NONE';
}

export interface SiteStructure {
  siteType: SiteType;
  baseUrl: string;
  siteName: string;
  chapterPattern: ChapterPattern;
  selectors: Selectors;
  urlPatterns: UrlPatterns;
  cloudflare: CloudflareInfo;
  confidence: number;
  warnings: string[];
  knownCms?: string;
}

export interface ExtractorOptions {
  url?: string;
  outputDir?: string;
  siteId?: string;
  lang?: string;
  mode?: 'full-auto' | 'guided' | 'debug';
  forceSiteType?: SiteType;
  forceChapterPattern?: ChapterPatternType;
  customSelectors?: Partial<Selectors>;
  validateBeforeGenerate?: boolean;
  testChapterUrls?: number;
  maxPages?: number;
  headers?: Record<string, string>;
  cookies?: string;
  waitForSelector?: string;
}

export interface ExtractorResult {
  success: boolean;
  pluginCode: string;
  baseClassCode?: string;
  selectorsJson: string;
  manifest: PluginManifest;
  structure: SiteStructure;
  validation?: ValidationReport;
  warnings: string[];
  errors: string[];
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  site: string;
  lang: string;
  iconUrl?: string;
  customJS?: string;
  customCSS?: string;
  hasUpdate?: boolean;
  hasSettings?: boolean;
}

export interface ValidationReport {
  novelMeta: ValidationItem;
  chapterList: ValidationItem & {
    totalExpected: number;
    totalFound: number;
    missingPages: number[];
    pagesTested: number;
  };
  chapterContent: ValidationItem & {
    tested: number;
    avgLength: number;
  };
  search: ValidationItem;
  cloudflare: ValidationItem & {
    handled: boolean;
    needsWebView: boolean;
  };
  overallPassed: boolean;
}

export interface ValidationItem {
  passed: boolean;
  details: string[];
}
