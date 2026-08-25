import {
  createTtsParagraphs,
  decodeTtsParagraphId,
  encodeTtsParagraphId,
  extractTtsSegments,
} from '../ttsQueue';

describe('ttsQueue', () => {
  it('round-trips chapter metadata in paragraph ids', () => {
    const id = encodeTtsParagraphId(42, 3, 'Capítulo 7: El comienzo');

    expect(decodeTtsParagraphId(id)).toEqual({
      chapterId: 42,
      paragraphIndex: 3,
      chunkIndex: 0,
      chapterName: 'Capítulo 7: El comienzo',
    });
  });

  it('extracts readable blocks without scripts or duplicate blockquotes', () => {
    expect(
      extractTtsSegments(`
        <h2>Chapter title</h2>
        <blockquote><p>Quoted paragraph.</p></blockquote>
        <p>Normal paragraph.</p>
        <script>never read me</script>
      `),
    ).toEqual(['Chapter title', 'Quoted paragraph.', 'Normal paragraph.']);
  });

  it('creates stable native paragraphs and removes empty text', () => {
    const paragraphs = createTtsParagraphs(9, 'Chapter 9', [
      ' First paragraph ',
      ' ',
      'Second paragraph',
    ]);

    expect(paragraphs.map(item => item.text)).toEqual([
      'First paragraph',
      'Second paragraph',
    ]);
    expect(decodeTtsParagraphId(paragraphs[1].id)).toMatchObject({
      chapterId: 9,
      paragraphIndex: 2,
    });
  });

  it('splits very long elements without losing their WebView index', () => {
    const paragraphs = createTtsParagraphs(5, 'Chapter 5', [
      `${'word '.repeat(800)}end`,
    ]);

    expect(paragraphs.length).toBeGreaterThan(1);
    expect(new Set(paragraphs.map(item => item.id)).size).toBe(
      paragraphs.length,
    );
    paragraphs.forEach((paragraph, chunkIndex) => {
      expect(decodeTtsParagraphId(paragraph.id)).toMatchObject({
        chapterId: 5,
        paragraphIndex: 0,
        chunkIndex,
      });
      expect(paragraph.text.length).toBeLessThanOrEqual(3000);
    });
  });
});
