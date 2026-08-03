import * as cheerio from 'cheerio';

interface MALNovel {
  novelName: string;
  novelCover: string;
  score?: string;
  info?: string[];
}

const safeImageParts = (src?: string) => {
  if (!src) return [] as string[];
  return src.split('/');
};

const buildCoverUrl = (parts: string[]) => {
  if (parts.length >= 9) {
    const folder = parts[7];
    const file = parts[8].split('.')[0];
    return `https://cdn.myanimelist.net/images/manga/${folder}/${file}.jpg`;
  }
  return '';
};

const scrapeTopNovels = async (pageNo: number): Promise<MALNovel[]> => {
  const url = `https://myanimelist.net/topmanga.php?type=lightnovels&limit=${pageNo}`;

  const res = await fetch(url);
  const body = await res.text();

  const $ = cheerio.load(body);

  const novels: MALNovel[] = [];

  $('tr.ranking-list').each(function () {
    const imgSrc = $(this).find('img').attr('data-src');
    const parts = safeImageParts(imgSrc);
    const novelCover = buildCoverUrl(parts);
    const novelName = $(this).find('h3').text().trim();

    const score = $(this)
      .find('.js-top-ranking-score-col > span.score-label')
      .text()
      .trim();

    const infoText = $(this).find('div.information').text().trim();
    const info = infoText ? infoText.split(/\s\s+/) : [];

    novels.push({ novelName, novelCover, score, info });
  });

  return novels;
};

const scrapeSearchResults = async (searchTerm: string): Promise<MALNovel[]> => {
  const url = `https://myanimelist.net/manga.php?q=${encodeURIComponent(
    searchTerm,
  )}&cat=manga&type=2`;

  const res = await fetch(url);
  const body = await res.text();

  const $ = cheerio.load(body);

  const novels: MALNovel[] = [];

  $('.list')
    .find('tr')
    .each(function () {
      const novelName = $(this).find('a > strong').text().trim();

      if (novelName) {
        const imgSrc = $(this).find('img').attr('data-src');
        const parts = safeImageParts(imgSrc);
        const novelCover = buildCoverUrl(parts);

        const score = $(this).find('td:nth-child(5)').text().trim();

        novels.push({ novelName, novelCover, score });
      }
    });

  return novels;
};

export { scrapeTopNovels, scrapeSearchResults };
