import type {
  NovelItem,
  Plugin,
  SourceNovel,
} from '../types';
// La app no expone 'domhandler' como dependencia directa (es transitiva de
// cheerio), así que derivamos el tipo de nodo DOM desde la API pública de
// cheerio para no romper la resolución de tipos en pnpm.
import { load as parseHTML, type Cheerio } from 'cheerio';

import { fetchApi } from './fetch';
import { Storage } from './storage';

// Almacén compartido de la librería (el loader de la app crea un Storage por
// plugin; para la lib global usamos su propio namespace).
const storage = new Storage('@libs/translation');

type AnyNode = Extract<Parameters<typeof parseHTML>[0], { type: string }>;

export type TranslationConfig = {
  enabled: boolean;
  provider: 'google' | 'deepl' | 'libretranslate';
  targetLang: string;
  sourceLang: string;
  apiKey?: string;
  batchSize: number;
  cacheEnabled: boolean;
  fallbackProvider?: 'google' | 'deepl' | 'libretranslate';
};

export const DEFAULT_TRANSLATION_CONFIG: TranslationConfig = {
  enabled: true,
  provider: 'google',
  targetLang: 'es',
  sourceLang: 'auto',
  batchSize: 10,
  cacheEnabled: true,
  fallbackProvider: 'libretranslate',
};

const CACHE_KEY = '@libs/translation/cache';
const MAX_CACHE_ENTRIES = 5000;

// Cache de traducciones compartida entre plugins. Se hidrata desde el storage
// del host al primer uso y se persiste de forma diferida (throttled) para
// reutilizar traducciones entre sesiones/sesiones del visor.
const translationCache = new Map<string, string>();
let cacheHydrated = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function hydrateCacheFromStorage(): void {
  if (cacheHydrated) return;
  cacheHydrated = true;
  try {
    const cached = storage.get<Record<string, string>>(CACHE_KEY);
    if (cached && typeof cached === 'object') {
      for (const [key, value] of Object.entries(cached)) {
        if (translationCache.size >= MAX_CACHE_ENTRIES) break;
        translationCache.set(key, value);
      }
    }
  } catch {
    // storage no disponible: seguir solo con la cache en memoria
  }
}

function scheduleCachePersist(): void {
  if (persistTimer !== null) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const snapshot: Record<string, string> = {};
      for (const [key, value] of Array.from(translationCache.entries())) {
        snapshot[key] = value;
        if (Object.keys(snapshot).length >= MAX_CACHE_ENTRIES) break;
      }
      storage.set(CACHE_KEY, snapshot);
    } catch {
      // Ignorar errores de persistencia
    }
  }, 1000);
}

function cacheGet(key: string): string | undefined {
  hydrateCacheFromStorage();
  return translationCache.get(key);
}

function cacheSet(key: string, value: string): void {
  translationCache.set(key, value);
  if (translationCache.size > MAX_CACHE_ENTRIES) {
    const oldest = translationCache.keys().next().value;
    if (oldest !== undefined) {
      translationCache.delete(oldest);
    }
  }
  scheduleCachePersist();
}

// Pool con límite de concurrencia: evita disparar N requests en paralelo
// cuando se traducen listados/títulos (rate-limit/429 en Google API).
async function mapPool<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  };

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () =>
      worker(),
    ),
  );

  return results;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function getSearchTerms(text: string): string[] {
  return normalizeText(text).split(/\s+/).filter(Boolean);
}

const SEARCH_STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'of',
  'and',
  'or',
  'in',
  'on',
  'at',
  'to',
  'for',
  'with',
  'by',
  'from',
  'as',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'i',
  'you',
  'he',
  'she',
  'we',
  'they',
  'my',
  'his',
  'her',
  'our',
  'their',
  'your',
  'me',
  'him',
  'us',
  'them',
  'no',
  'not',
  'so',
  'but',
  'if',
  'then',
  'than',
  'too',
  'up',
  'out',
  'el',
  'la',
  'los',
  'las',
  'un',
  'una',
  'unos',
  'unas',
  'de',
  'del',
  'al',
  'en',
  'y',
  'o',
  'u',
  'que',
  'se',
  'su',
  'sus',
  'mi',
  'mis',
  'tu',
  'tus',
  'con',
  'por',
  'para',
  'como',
  'mas',
  'es',
  'son',
  'fue',
  'fueron',
  'era',
  'eran',
  'esta',
  'estan',
  'hay',
  'este',
  'estos',
  'estas',
  'ese',
  'esa',
  'esos',
  'esas',
  'lo',
  'le',
  'les',
  'te',
  'nos',
  'si',
  'ni',
  'pero',
  'porque',
  'cuando',
  'donde',
  'muy',
  'tambien',
  'solo',
  'entre',
  'hasta',
  'desde',
  'sobre',
  'tras',
  'ante',
  'bajo',
  'contra',
  'hacia',
  'segun',
  'sin',
]);

function getSignificantTerms(text: string): string[] {
  return getSearchTerms(text).filter(
    term => term.length > 1 && !SEARCH_STOPWORDS.has(term),
  );
}

export function searchTermsMatch(title: string, query: string): boolean {
  const normalizedTitle = normalizeText(title);
  const normalizedQuery = normalizeText(query);

  if (!normalizedTitle || !normalizedQuery) {
    return false;
  }

  if (normalizedTitle.includes(normalizedQuery)) {
    return true;
  }

  const terms = getSignificantTerms(query);

  if (!terms.length) {
    return false;
  }

  return terms.every(term => normalizedTitle.includes(term));
}

export function searchScore(title: string, query: string): number {
  const normalizedTitle = normalizeText(title);
  const normalizedQuery = normalizeText(query);

  if (!normalizedTitle || !normalizedQuery) {
    return 0;
  }

  if (normalizedTitle === normalizedQuery) {
    return 1000;
  }

  if (normalizedTitle.startsWith(normalizedQuery)) {
    return 800;
  }

  if (normalizedTitle.includes(normalizedQuery)) {
    return 600;
  }

  const terms = getSignificantTerms(query);

  const matchingTerms = terms.filter(term =>
    normalizedTitle.includes(term),
  ).length;

  return matchingTerms * 100;
}

async function translateText(
  text: string,
  targetLang = 'es',
  sourceLang = 'auto',
  config: TranslationConfig = DEFAULT_TRANSLATION_CONFIG,
): Promise<string> {
  const normalized = text.trim();

  if (!normalized) {
    return '';
  }

  const cacheKey = `${sourceLang}:${targetLang}:${normalized}`;

  if (config.cacheEnabled) {
    const cachedValue = cacheGet(cacheKey);
    if (cachedValue) {
      return cachedValue;
    }
  }

  const providers = [
    {
      name: config.provider,
      url: getProviderUrl(
        config.provider,
        normalized,
        sourceLang,
        targetLang,
        config.apiKey,
      ),
    },
    ...(config.fallbackProvider
      ? [
          {
            name: config.fallbackProvider,
            url: getProviderUrl(
              config.fallbackProvider,
              normalized,
              sourceLang,
              targetLang,
              config.apiKey,
            ),
          },
        ]
      : []),
  ];

  for (const provider of providers) {
    try {
      const res = await fetchApi(provider.url);

      if (!res.ok) {
        continue;
      }

      const json = await res.json();
      const translated = extractTranslation(json, provider.name);

      if (translated && translated !== normalized) {
        if (config.cacheEnabled) {
          cacheSet(cacheKey, translated);
        }
        return translated;
      }
    } catch {
      // Try next provider
    }
  }

  return text;
}

function getProviderUrl(
  provider: string,
  text: string,
  sourceLang: string,
  targetLang: string,
  apiKey?: string,
): string {
  const encoded = encodeURIComponent(text);

  switch (provider) {
    case 'google':
      return `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encoded}`;
    case 'deepl':
      return `https://api-free.deepl.com/v2/translate?auth_key=${apiKey}&text=${encodeURIComponent(text)}&target_lang=${targetLang.toUpperCase()}&source_lang=${sourceLang === 'auto' ? '' : sourceLang}`;
    case 'libretranslate':
      return `https://libretranslate.de/translate?q=${encodeURIComponent(text)}&source=${sourceLang}&target=${targetLang}&format=text`;
    default:
      return `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encoded}`;
  }
}

function extractTranslation(json: unknown, provider: string): string | null {
  try {
    switch (provider) {
      case 'google':
        if (Array.isArray(json) && json[0] && Array.isArray(json[0])) {
          return json[0]
            .map((item: unknown[]) => item[0])
            .filter(Boolean)
            .join('');
        }
        break;
      case 'deepl':
        if (
          typeof json === 'object' &&
          json !== null &&
          'translations' in json
        ) {
          return (
            (json as { translations: { text: string }[] }).translations[0]
              ?.text || null
          );
        }
        break;
      case 'libretranslate':
        if (
          typeof json === 'object' &&
          json !== null &&
          'translatedText' in json
        ) {
          return (json as { translatedText: string }).translatedText;
        }
        break;
    }
  } catch {
    // Ignore extraction errors
  }
  return null;
}

// Máximo de caracteres por batch de traducción (límite de URL GET del
// proveedor). Más que esto es mejor dividir en oraciones.
const MAX_TRANSLATION_CHARS = 2000;

function splitOversizedParagraph(text: string, limit = 1800): string[] {
  if (text.length <= limit) {
    return [text];
  }

  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf('. ', limit);
    if (cut < 0) cut = remaining.lastIndexOf('! ', limit);
    if (cut < 0) cut = remaining.lastIndexOf('? ', limit);
    if (cut < 0) cut = remaining.lastIndexOf('.', limit);
    if (cut <= 0) {
      cut = limit;
    } else {
      cut += 1;
    }
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trimStart();
  }

  if (remaining) {
    parts.push(remaining);
  }

  return parts.filter(Boolean);
}

export async function translateParagraphs(
  paragraphs: string[],
  config: TranslationConfig = DEFAULT_TRANSLATION_CONFIG,
): Promise<string[]> {
  const translatedParagraphs: string[] = [];

  // Partir párrafos que superan el límite por oraciones para no exceder la
  // longitud de URL del proveedor (GET).
  const normalizedInput: string[] = [];

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();

    if (!trimmed) {
      continue;
    }

    if (trimmed.length > MAX_TRANSLATION_CHARS) {
      normalizedInput.push(...splitOversizedParagraph(trimmed));
    } else {
      normalizedInput.push(trimmed);
    }
  }

  let currentBatch = '';

  for (const normalizedParagraph of normalizedInput) {
    const separator = currentBatch === '' ? '' : '\n';

    if (
      `${currentBatch}${separator}${normalizedParagraph}`.length >
      MAX_TRANSLATION_CHARS
    ) {
      if (currentBatch !== '') {
        const translatedBatch = await translateText(
          currentBatch,
          config.targetLang,
          config.sourceLang,
          config,
        );

        const batchResult =
          translatedBatch && translatedBatch !== currentBatch
            ? translatedBatch
            : currentBatch;

        translatedParagraphs.push(
          ...batchResult
            .split(/\n+/)
            .map(text => text.trim())
            .filter(Boolean),
        );
      }

      currentBatch = normalizedParagraph;
    } else {
      currentBatch =
        currentBatch === ''
          ? normalizedParagraph
          : `${currentBatch}\n${normalizedParagraph}`;
    }
  }

  if (currentBatch !== '') {
    const translatedBatch = await translateText(
      currentBatch,
      config.targetLang,
      config.sourceLang,
      config,
    );

    const batchResult =
      translatedBatch && translatedBatch !== currentBatch
        ? translatedBatch
        : currentBatch;

    translatedParagraphs.push(
      ...batchResult
        .split(/\n+/)
        .map(text => text.trim())
        .filter(Boolean),
    );
  }

  return translatedParagraphs;
}

export async function translateShortText(
  text: string,
  targetLang = 'es',
  sourceLang = 'auto',
  config: TranslationConfig = DEFAULT_TRANSLATION_CONFIG,
): Promise<string> {
  const normalizedText = text.trim();

  if (!normalizedText) {
    return '';
  }

  return translateText(normalizedText, targetLang, sourceLang, config);
}

export async function translateTitles(
  titles: string[],
  targetLang = 'es',
  sourceLang = 'auto',
  config: TranslationConfig = DEFAULT_TRANSLATION_CONFIG,
): Promise<string[]> {
  return mapPool(titles, config.batchSize, title =>
    translateShortText(title, targetLang, sourceLang, config),
  );
}

export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export async function translateTextToEnglish(
  text: string,
  config: TranslationConfig = DEFAULT_TRANSLATION_CONFIG,
): Promise<string> {
  return translateText(text, 'en', 'auto', config);
}

export function cleanTextForTts(text: string): string {
  return text
    .replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E]/g, '')
    .replace(/[\\/]{2,}/g, '')
    .replace(/[—––─]/g, '-')
    .replace(/[*_~|•♦¤°]/g, '')
    .replace(/\.{4,}/g, '...')
    .replace(/ {2,}/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

export function parseRelativeTime(text: string): Date | null {
  const match = text.match(
    /\b(\d+)\s+(day|days|week|weeks|month|months|year|years|día|días|semana|semanas|mes|meses|año|años)\s+ago\b/i,
  );

  if (!match) {
    return null;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const now = new Date();

  if (unit.startsWith('day') || unit.startsWith('día')) {
    return new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
  }
  if (unit.startsWith('week') || unit.startsWith('semana')) {
    return new Date(now.getTime() - value * 7 * 24 * 60 * 60 * 1000);
  }
  if (unit.startsWith('month') || unit.startsWith('mes')) {
    return new Date(now.getTime() - value * 30 * 24 * 60 * 60 * 1000);
  }
  if (unit.startsWith('year') || unit.startsWith('año')) {
    return new Date(now.getTime() - value * 365 * 24 * 60 * 60 * 1000);
  }

  return null;
}

export function extractChapterNumberFromUrl(url: string): number | null {
  const match = url.match(/\/chapter-(\d+)(?:\/)?(?:[?#].*)?$/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

export function hasNoiseClass(classAttr: string | undefined): boolean {
  if (!classAttr) return false;

  const keywords = /(^|-)(ad|sidebar|related|recommend)(-|$)/i;

  return classAttr.split(/\s+/).some(token => keywords.test(token));
}

export type WithTranslationConfig = TranslationConfig & {
  translatePopular?: boolean;
  translateSearch?: boolean;
  translateSearchQuery?: boolean;
  translateNovel?: boolean;
  translateChapter?: boolean;
};

const DEFAULT_WITH_TRANSLATION_CONFIG: WithTranslationConfig = {
  ...DEFAULT_TRANSLATION_CONFIG,
  translatePopular: true,
  translateSearch: true,
  translateSearchQuery: true,
  translateNovel: true,
  translateChapter: true,
};

const STATUS_TRANSLATIONS: Record<string, string> = {
  ongoing: 'En curso',
  completed: 'Completado',
  hiatus: 'En pausa',
  dropped: 'Abandonado',
  cancelled: 'Cancelado',
  unknown: 'Desconocido',
};

export function translateStatus(status?: string): string {
  if (!status) return status || '';

  const key = status.trim().toLowerCase();
  if (STATUS_TRANSLATIONS[key]) return STATUS_TRANSLATIONS[key];

  const normalized = key.replace(/[\s\-_]+/g, '');

  if (normalized.startsWith('ongoing')) return 'En curso';
  if (normalized.startsWith('complet')) return 'Completado';
  if (normalized.startsWith('hiatus')) return 'En pausa';
  if (normalized.startsWith('dropped') || normalized.startsWith('abandon')) {
    return 'Abandonado';
  }
  if (normalized.startsWith('cancel')) return 'Cancelado';

  return status;
}

async function translateItems(
  items: NovelItem[],
  config: WithTranslationConfig,
): Promise<NovelItem[]> {
  if (!config.enabled || !items?.length) return items;

  try {
    const translatedNames = await translateTitles(
      items.map(item => item.name),
      config.targetLang,
      config.sourceLang,
      config,
    );

    const seenPaths = new Set<string>();

    return items
      .map((item, index) => ({
        ...item,
        name: translatedNames[index] || item.name,
      }))
      .filter(item => {
        if (!item.path) return true;
        if (seenPaths.has(item.path)) return false;
        seenPaths.add(item.path);
        return true;
      });
  } catch {
    return items;
  }
}

async function translateSourceNovel(
  novel: SourceNovel,
  config: WithTranslationConfig,
): Promise<SourceNovel> {
  if (!config.enabled || !novel) return novel;

  const translated: SourceNovel = { ...novel };

  try {
    if (novel.name) {
      const [translatedName] = await translateTitles(
        [novel.name],
        config.targetLang,
        config.sourceLang,
        config,
      );
      if (translatedName) translated.name = translatedName;
    }

    if (novel.summary) {
      const paragraphs = novel.summary
        .split(/\r?\n/)
        .map(text => text.trim())
        .filter(Boolean);
      if (paragraphs.length) {
        const translatedParagraphs = await translateParagraphs(
          paragraphs,
          config,
        );
        if (translatedParagraphs.length) {
          translated.summary = translatedParagraphs.join('\n\n').trim();
        }
      }
    }

    if (novel.status) {
      // El status de la app es un enum; la lib devuelve el texto traducido.
      translated.status = translateStatus(novel.status as string) as
        | SourceNovel['status'];
    }

    if (novel.genres) {
      const translatedGenres = await translateShortText(
        novel.genres,
        config.targetLang,
        config.sourceLang,
        config,
      );
      if (translatedGenres) {
        translated.genres = translatedGenres;
      }
    }

    if (novel.chapters?.length) {
      const translatedNames = await translateTitles(
        novel.chapters.map(ch => ch.name),
        config.targetLang,
        config.sourceLang,
        config,
      );
      translated.chapters = novel.chapters.map((ch, index) => ({
        ...ch,
        name: translatedNames[index] || ch.name,
      }));
    }
  } catch {
    // Fall back to the original novel on any translation error
  }

  return translated;
}

const CHAPTER_BLOCK_SELECTOR =
  'p, li, blockquote, h1, h2, h3, h4, h5, h6, div, section, article';

function hasNoiseAncestor(element: Cheerio<AnyNode>): boolean {
  return (
    hasNoiseClass(element.attr('class')) ||
    element
      .parents('[class]')
      .toArray()
      .some(parent => hasNoiseClass(parent.attribs?.class))
  );
}

function ownTextWithBreaks(element: Cheerio<AnyNode>): string {
  const clone = element.clone();

  clone.find('script, style, ins, iframe, noscript').remove();
  clone.find('br').replaceWith('\n');
  clone
    .find('p, li, blockquote, h1, h2, h3, h4, h5, h6, div, section, article')
    .remove();

  return clone
    .text()
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();
}

const BLOCK_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => BLOCK_ESCAPE[ch] || ch);
}

async function translateChapterHtml(
  html: string,
  config: WithTranslationConfig,
): Promise<string> {
  if (!config.enabled || !html) return html;

  let $: ReturnType<typeof parseHTML>;

  try {
    $ = parseHTML(html);
  } catch {
    return html;
  }

  // Recolecta bloques de texto (p, li, encabezados y contenedores div/br).
  // Requisitos: no estar dentro de un bloque ya elegido (evita duplicados),
  // no pertenecer a ads/sidebar y traer texto propio > 10 chars.
  const targets: { element: AnyNode; text: string }[] = [];
  const targetSet = new Set<AnyNode>();

  $(CHAPTER_BLOCK_SELECTOR).each((_, element) => {
    if (hasNoiseAncestor($(element))) return;

    if (
      $(element)
        .parents(CHAPTER_BLOCK_SELECTOR)
        .toArray()
        .some(parent => targetSet.has(parent))
    ) {
      return;
    }

    const text = ownTextWithBreaks($(element));

    if (!text || text.length <= 10) return;

    targets.push({ element, text });
    targetSet.add(element);
  });

  if (!targets.length) {
    return html;
  }

  try {
    const translated = await translateParagraphs(
      targets.map(target => target.text),
      config,
    );

    targets.forEach((target, index) => {
      const translatedText = translated[index];
      if (!translatedText || translatedText === target.text) return;

      const $target = $(target.element);

      if ($target.find('br').length > 0) {
        // Layout con <br>: reconstruir conservando los saltos de línea
        $target.html(translatedText.split('\n').map(escapeHtml).join('<br>'));
      } else {
        // Bloques simples (<p>, <li>, encabezados): reemplazar el texto
        $target.text(translatedText);
      }
    });

    return $.html() || html;
  } catch {
    return html;
  }
}

async function translateSearch(
  plugin: Plugin,
  searchTerm: string,
  pageNo: number,
  config: WithTranslationConfig,
): Promise<NovelItem[]> {
  const query = (searchTerm || '').trim();

  if (!config.enabled || !query) {
    return plugin.searchNovels(query, pageNo);
  }

  let englishQuery = query;

  if (config.translateSearchQuery) {
    const translated = await translateTextToEnglish(query, config);
    englishQuery = translated.trim() || query;
  }

  const candidateQueries = [englishQuery, query].filter(
    (candidate, index, all) => !!candidate && all.indexOf(candidate) === index,
  );

  const seenPaths = new Set<string>();
  const novels: NovelItem[] = [];
  let firstError: unknown = null;

  for (const candidate of candidateQueries) {
    try {
      const results = await plugin.searchNovels(candidate, pageNo);

      for (const result of results || []) {
        if (result.path && !seenPaths.has(result.path)) {
          seenPaths.add(result.path);
          novels.push(result);
        }
      }

      // If there are already candidates that match, do not query more.
      if (novels.some(novel => searchTermsMatch(novel.name, candidate))) {
        break;
      }
    } catch (error) {
      if (!firstError) firstError = error;
    }
  }

  if (!novels.length && firstError) {
    return plugin.searchNovels(query, pageNo);
  }

  const scored = novels
    .map(novel => {
      const scores = candidateQueries.map(candidate => ({
        candidate,
        score: searchScore(novel.name, candidate),
        matches: searchTermsMatch(novel.name, candidate),
      }));

      const best = scores.reduce(
        (current, value) => (value.score > current.score ? value : current),
        { candidate: '', score: 0, matches: false },
      );

      return {
        novel,
        score: best.score,
        matches: best.matches,
      };
    })
    .filter(item => item.matches && item.score > 0)
    .sort((a, b) => b.score - a.score);

  return translateItems(
    scored.map(item => item.novel),
    config,
  );
}

/**
 * Envuelve un plugin y traduce automáticamente los listados, búsquedas, novelas
 * y capítulos al idioma objetivo, replicando el comportamiento de novelyra.
 * Los métodos no relacionados con la traducción se delegan sin cambios.
 */
export function withTranslation(
  plugin: Plugin,
  config: Partial<WithTranslationConfig> = {},
): Plugin {
  const cfg: WithTranslationConfig = {
    ...DEFAULT_WITH_TRANSLATION_CONFIG,
    ...config,
  };

  const wrapped = Object.assign(
    Object.create(Object.getPrototypeOf(plugin) as object),
    plugin,
  ) as Plugin;

  if (cfg.translatePopular) {
    wrapped.popularNovels = (pageNo: number, options) =>
      plugin
        .popularNovels(pageNo, options)
        .then(results => translateItems(results, cfg));
  }

  if (cfg.translateSearch) {
    wrapped.searchNovels = (searchTerm: string, pageNo: number) =>
      translateSearch(plugin, searchTerm, pageNo, cfg);
  }

  if (cfg.translateNovel) {
    wrapped.parseNovel = (novelPath: string) =>
      plugin
        .parseNovel(novelPath)
        .then(novel => translateSourceNovel(novel, cfg));
  }

  if (cfg.translateChapter) {
    wrapped.parseChapter = (chapterPath: string) =>
      plugin
        .parseChapter(chapterPath)
        .then(html => translateChapterHtml(html, cfg));
  }

  return wrapped;
}