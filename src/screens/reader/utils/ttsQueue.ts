import { load } from 'cheerio';

import type { TtsParagraph } from '@modules/nitro-tts';

const PARAGRAPH_ID_PREFIX = 'lnreader-chapter';
const MAX_SEGMENT_LENGTH = 3000;

export type DecodedTtsParagraphId = {
  chapterId: number;
  paragraphIndex: number;
  chunkIndex: number;
  chapterName: string;
};

export const encodeTtsParagraphId = (
  chapterId: number,
  paragraphIndex: number,
  chapterName: string,
  chunkIndex = 0,
) =>
  `${PARAGRAPH_ID_PREFIX}:${chapterId}:${paragraphIndex}:${chunkIndex}:${encodeURIComponent(
    chapterName,
  )}`;

export const decodeTtsParagraphId = (
  paragraphId: string,
): DecodedTtsParagraphId | undefined => {
  const parts = paragraphId.split(':');
  const isLegacyId = parts.length === 4;
  const [prefix, chapterId, paragraphIndex] = parts;
  const chunkIndex = isLegacyId ? '0' : parts[3];
  const encodedChapterName = isLegacyId ? parts[3] : parts[4];
  const parsedChapterId = Number(chapterId);
  const parsedParagraphIndex = Number(paragraphIndex);
  const parsedChunkIndex = Number(chunkIndex);

  if (
    prefix !== PARAGRAPH_ID_PREFIX ||
    (parts.length !== 4 && parts.length !== 5) ||
    !Number.isFinite(parsedChapterId) ||
    !Number.isFinite(parsedParagraphIndex) ||
    !Number.isFinite(parsedChunkIndex) ||
    encodedChapterName === undefined
  ) {
    return undefined;
  }

  try {
    return {
      chapterId: parsedChapterId,
      paragraphIndex: parsedParagraphIndex,
      chunkIndex: parsedChunkIndex,
      chapterName: decodeURIComponent(encodedChapterName),
    };
  } catch {
    return undefined;
  }
};

const cleanTextForTTS = (text: string) =>
  Array.from(text.normalize('NFKC'))
    .filter(character => {
      const code = character.charCodeAt(0);
      return !(
        (code >= 0 && code <= 31) ||
        (code >= 127 && code <= 159) ||
        code === 0x200b ||
        code === 0x200c ||
        code === 0x200d ||
        code === 0xfeff
      );
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

const splitLongText = (text: string): string[] => {
  if (!text) {
    return [];
  }
  if (text.length <= MAX_SEGMENT_LENGTH) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > MAX_SEGMENT_LENGTH) {
    const window = remaining.slice(0, MAX_SEGMENT_LENGTH);
    const punctuationBoundary = Math.max(
      window.lastIndexOf('. '),
      window.lastIndexOf('! '),
      window.lastIndexOf('? '),
      window.lastIndexOf('; '),
      window.lastIndexOf(': '),
    );
    const whitespaceBoundary = window.lastIndexOf(' ');
    const preferredMinimum = Math.floor(MAX_SEGMENT_LENGTH * 0.55);
    const splitAt =
      punctuationBoundary >= preferredMinimum
        ? punctuationBoundary + 1
        : whitespaceBoundary >= preferredMinimum
        ? whitespaceBoundary
        : MAX_SEGMENT_LENGTH;
    const chunk = remaining.slice(0, splitAt).trim();
    if (chunk) {
      chunks.push(chunk);
    }
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }
  return chunks;
};

/** Converts sanitized chapter HTML into the same paragraph-sized queue as the WebView. */
export const extractTtsSegments = (chapterHtml: string): string[] => {
  if (!chapterHtml.trim()) {
    return [];
  }

  const $ = load(
    `<div id="lnreader-tts-root">${chapterHtml}</div>`,
    null,
    false,
  );
  const root = $('#lnreader-tts-root');
  root.find('script, style, noscript').remove();

  const blockSelector = 'p, li, blockquote, pre, h1, h2, h3, h4, h5, h6';
  const segments: string[] = [];

  root.find(blockSelector).each((_index, element) => {
    // A blockquote containing paragraphs should not be read twice.
    if ($(element).find(blockSelector).length > 0) {
      return;
    }
    const cleaned = cleanTextForTTS($(element).text());
    if (cleaned.length >= 2) {
      segments.push(cleaned);
    }
  });

  if (segments.length > 0) {
    return segments;
  }
  const fallback = cleanTextForTTS(root.text());
  return fallback.length >= 2 ? [fallback] : [];
};

export const createTtsParagraphs = (
  chapterId: number,
  chapterName: string,
  segments: string[],
): TtsParagraph[] =>
  segments
    .map((text, paragraphIndex) => ({
      paragraphIndex,
      text: cleanTextForTTS(text),
    }))
    .filter(item => item.text.length >= 2)
    .flatMap(item =>
      splitLongText(item.text).map((text, chunkIndex) => ({
        id: encodeTtsParagraphId(
          chapterId,
          item.paragraphIndex,
          chapterName,
          chunkIndex,
        ),
        text,
      })),
    );
