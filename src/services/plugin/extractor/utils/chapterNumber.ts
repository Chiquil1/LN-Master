export function extractChapterNumber(text: string): number | null {
  const patterns = [
    /(?:cap[ií]tulo|chapter|ch\.?|cap\.?|第)\s*(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*(?:cap[ií]tulo|chapter|ch\.?|cap\.?)/i,
    /^(\d+(?:\.\d+)?)[\s\-:]/,
    /[\s\-_](\d+(?:\.\d+)?)(?=[\s\-_]|$)/,
    /(?:vol\.?|volume|tomo)\s*\d+\s*(?:cap|ch)\.?\s*(\d+(?:\.\d+)?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const num = parseFloat(match[1]);
      if (!isNaN(num) && num > 0) return num;
    }
  }

  return null;
}

export function extractChapterNumberFromUrl(url: string): number | null {
  const patterns = [
    /\/chapter-(\d+(?:\.\d+)?)/i,
    /\/capitulo-(\d+(?:\.\d+)?)/i,
    /\/cap-(\d+(?:\.\d+)?)/i,
    /\/ch-(\d+(?:\.\d+)?)/i,
    /\/c(\d+(?:\.\d+)?)/i,
    /[/-](\d+(?:\.\d+)?)(?:\/|$)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      const num = parseFloat(match[1]);
      if (!isNaN(num) && num > 0) return num;
    }
  }

  return null;
}

export function compareChapterNumbers(a: string, b: string): number {
  const numA = extractChapterNumber(a);
  const numB = extractChapterNumber(b);

  if (numA !== null && numB !== null) return numA - numB;
  if (numA !== null) return -1;
  if (numB !== null) return 1;

  return a.localeCompare(b, undefined, { numeric: true });
}

export function normalizeChapterTitle(title: string): string {
  return title
    .replace(/^(cap[ií]tulo|chapter|ch\.?|cap\.?)\s*\d+[\s\-:]*/i, '')
    .replace(/^\d+[\s\-:]*/, '')
    .trim();
}
