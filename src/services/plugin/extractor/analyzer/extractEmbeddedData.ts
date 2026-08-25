import { type CheerioAPI } from 'cheerio';
import type { EmbeddedJsonInfo } from '../types';

export function extractEmbeddedData(
  $: CheerioAPI,
  html: string,
): {
  embeddedData: {
    selector: string;
    id?: string;
    data: unknown;
    pattern?: string;
  }[];
  chapterData: EmbeddedJsonInfo | null;
  metaData: Record<string, unknown> | null;
} {
  const embeddedData: {
    selector: string;
    id?: string;
    data: unknown;
    pattern?: string;
  }[] = [];

  const scriptSelectors = [
    'script[type="application/json"]',
    'script[type="application/ld+json"]',
    'script[data-novel]',
    'script[data-chapters]',
    'script[id*="novel"]',
    'script[id*="chapter"]',
    'script[id*="__NEXT_DATA__"]',
    'script[id*="__NUXT__"]',
    'script[id*="__INITIAL_STATE__"]',
    'script:contains("chapters")',
    'script:contains("volumes")',
    'script:contains("novel")',
  ];

  for (const selector of scriptSelectors) {
    const scripts = $(selector);
    for (const script of scripts.toArray()) {
      const content = $(script).html() || '';
      if (!content.trim()) continue;

      try {
        let json: unknown;
        const type = $(script).attr('type');

        if (type === 'application/json' || type === 'application/ld+json') {
          json = JSON.parse(content);
        } else if (selector.includes(':contains')) {
          const match = content.match(/({[\s\S]*})/);
          if (match) json = JSON.parse(match[1]);
        } else {
          json = JSON.parse(content);
        }

        if (json && typeof json === 'object') {
          embeddedData.push({ selector, id: $(script).attr('id'), data: json });
        }
      } catch {}
    }
  }

  const inlineScripts = $('script:not([src])').toArray();
  for (const script of inlineScripts) {
    const content = $(script).html() || '';
    if (content.length < 100) continue;

    const patterns = [
      /window\.__DATA__\s*=\s*({[\s\S]*?});/,
      /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/,
      /window\.__NUXT__\s*=\s*({[\s\S]*?});/,
      /window\.__NEXT_DATA__\s*=\s*({[\s\S]*?});/,
      /var\s+(?:novel|chapter|volume)Data\s*=\s*({[\s\S]*?});/,
      /const\s+(?:novel|chapter|volume)Data\s*=\s*({[\s\S]*?});/,
      /let\s+(?:novel|chapter|volume)Data\s*=\s*({[\s\S]*?});/,
      /"chapters"\s*:\s*\[[\s\S]*?\]/,
      /"volumes"\s*:\s*\[[\s\S]*?\]/,
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        try {
          const json = JSON.parse(match[1] || match[0]);
          if (json && typeof json === 'object') {
            embeddedData.push({
              selector: 'inline-script',
              data: json,
              pattern: pattern.source,
            });
          }
        } catch {}
      }
    }
  }

  const chapterData = findChapterData(embeddedData);
  const metaData = findMetaData(embeddedData);

  return { embeddedData, chapterData, metaData };
}

function findChapterData(
  embeddedData: { data: unknown }[],
): EmbeddedJsonInfo | null {
  for (const { data } of embeddedData) {
    const chaptersPath = findChaptersPathInObject(data);
    if (chaptersPath) {
      const sampleChapter = getNestedValue(data, `${chaptersPath}[0]`);
      if (sampleChapter && typeof sampleChapter === 'object') {
        return {
          scriptSelector: 'embedded',
          jsonPath: '',
          chaptersPath,
          chapterTitlePath: findKeyPath(sampleChapter, [
            'title',
            'name',
            'chp_title',
            'chp_index_title',
            'chapter_name',
            'chapter_title',
          ]),
          chapterUrlPath: findKeyPath(sampleChapter, [
            'url',
            'path',
            'href',
            'link',
            'chp_url',
            'chapter_url',
            'url_path',
          ]),
          chapterNumberPath: findKeyPath(sampleChapter, [
            'number',
            'chapter',
            'chp_number',
            'chapter_number',
            'id',
            'index',
          ]),
          chapterDatePath: findKeyPath(sampleChapter, [
            'date',
            'created',
            'createdAt',
            'release_date',
            'release_time',
            'updated_at',
            'published_at',
          ]),
          confidence: 85,
        };
      }
    }
  }
  return null;
}

function findMetaData(
  embeddedData: { data: unknown }[],
): Record<string, unknown> | null {
  for (const { data } of embeddedData) {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const obj = data as Record<string, unknown>;
      const metaKeys = [
        'novel',
        'book',
        'manga',
        'series',
        'info',
        'metadata',
        'data',
      ];
      for (const key of metaKeys) {
        if (key in obj && typeof obj[key] === 'object') {
          return obj[key] as Record<string, unknown>;
        }
      }
      if (hasNovelFields(obj)) {
        return obj;
      }
    }
  }
  return null;
}

function hasNovelFields(obj: Record<string, unknown>): boolean {
  const novelFields = [
    'title',
    'name',
    'cover',
    'image',
    'author',
    'author_name',
    'summary',
    'description',
    'synopsis',
    'status',
    'genres',
    'tags',
  ];
  return novelFields.some(f => f in obj);
}

function findChaptersPathInObject(obj: unknown, path = ''): string | null {
  if (!obj || typeof obj !== 'object') return null;

  if (Array.isArray(obj)) {
    if (obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null) {
      const keys = Object.keys(obj[0]);
      const chapterKeys = ['chapter', 'chp_', 'vol_', 'episode', 'ep_'];
      if (
        keys.some(k => chapterKeys.some(ck => k.toLowerCase().includes(ck)))
      ) {
        return path;
      }
      if (
        keys.includes('id') &&
        (keys.includes('title') ||
          keys.includes('name') ||
          keys.includes('url') ||
          keys.includes('path'))
      ) {
        return path;
      }
    }
    return null;
  }

  const objRecord = obj as Record<string, unknown>;
  const priorityKeys = [
    'chapters',
    'volumes',
    'chapter_list',
    'volume_list',
    'episode_list',
    'data',
    'items',
    'list',
  ];

  for (const key of priorityKeys) {
    if (key in objRecord) {
      const result = findChaptersPathInObject(objRecord[key], key);
      if (result) return result;
    }
  }

  for (const [key, value] of Object.entries(objRecord)) {
    if (
      key.toLowerCase().includes('chapter') ||
      key.toLowerCase().includes('volume') ||
      key.toLowerCase().includes('episode')
    ) {
      const result = findChaptersPathInObject(
        value,
        path ? `${path}.${key}` : key,
      );
      if (result) return result;
    }
  }

  return null;
}

function findKeyPath(obj: unknown, keys: string[]): string {
  if (!obj || typeof obj !== 'object') return keys[0];
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

export function extractChaptersFromEmbedded(
  embeddedData: EmbeddedJsonInfo,
  json: Record<string, unknown>,
): {
  title: string;
  url: string;
  number?: number;
  date?: string;
  scanlator?: string;
}[] {
  if (!embeddedData) return [];

  const chaptersArray = getNestedValue(json, embeddedData.chaptersPath);
  if (!Array.isArray(chaptersArray)) return [];

  return chaptersArray
    .map((ch, index) => {
      const chapterObj = ch as Record<string, unknown>;
      return {
        title: String(
          chapterObj[embeddedData.chapterTitlePath] || `Chapter ${index + 1}`,
        ),
        url: String(chapterObj[embeddedData.chapterUrlPath] || ''),
        number: embeddedData.chapterNumberPath
          ? parseFloat(String(chapterObj[embeddedData.chapterNumberPath]))
          : index + 1,
        date: embeddedData.chapterDatePath
          ? String(chapterObj[embeddedData.chapterDatePath])
          : undefined,
        scanlator: embeddedData.chapterScanlatorPath
          ? String(chapterObj[embeddedData.chapterScanlatorPath])
          : undefined,
      };
    })
    .filter(c => c.url);
}
