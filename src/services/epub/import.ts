import dayjs from 'dayjs';
import {
  updateNovelCategoryById,
  updateNovelInfo,
} from '@database/queries/NovelQueries';
import { LOCAL_PLUGIN_ID } from '@plugins/pluginManager';
import { getString } from '@strings/translations';
import { NOVEL_STORAGE } from '@utils/Storages';
import { dbManager } from '@database/db';
import { novelSchema, chapterSchema } from '@database/schema';
import { BackgroundTaskMetadata } from '@services/ServiceManager';
import NativeFile from '@specs/NativeFile';
import NativeZipArchive from '@specs/NativeZipArchive';
import NativeEpub from '@specs/NativeEpub';
import { sleep } from '@utils/sleep';

const decodePath = (path: string) => {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
};

const insertLocalNovel = async (
  name: string,
  path: string,
  cover?: string,
  author?: string,
  artist?: string,
  summary?: string,
) => {
  const { insertId } = await dbManager.write(async tx => {
    return tx
      .insert(novelSchema)
      .values({ name, path, pluginId: 'local', inLibrary: true, isLocal: true })
      .run();
  });

  if (insertId !== undefined && insertId >= 0) {
    await updateNovelCategoryById(insertId, [2]);
    const novelDir = NOVEL_STORAGE + '/local/' + insertId;
    NativeFile.mkdir(novelDir);
    const newCoverPath = `file://${novelDir}/${cover?.split(/[/\\]/).pop()}`;

    if (cover) {
      const decodedPath = decodePath(cover);
      if (NativeFile.exists(decodedPath)) {
        NativeFile.moveFile(decodedPath, newCoverPath);
      }
    }
    await updateNovelInfo({
      id: insertId,
      pluginId: LOCAL_PLUGIN_ID,
      author: author,
      artist: artist,
      summary: summary,
      path: NOVEL_STORAGE + '/local/' + insertId,
      cover: newCoverPath,
      name: name,
      inLibrary: true,
      isLocal: true,
      totalPages: 0,
    });
    return insertId;
  }
  throw new Error(getString('advancedSettingsScreen.novelInsertFailed'));
};

// insertLocalChapter is no longer used; batch inserts are performed in importEpub

export const importEpub = async (
  {
    uri,
    filename,
  }: {
    uri: string;
    filename: string;
  },
  setMeta: (
    transformer: (meta: BackgroundTaskMetadata) => BackgroundTaskMetadata,
  ) => void,
) => {
  setMeta(meta => ({
    ...meta,
    isRunning: true,
    progress: 0,
  }));

  const epubFilePath =
    NativeFile.getConstants().ExternalCachesDirectoryPath + '/novel.epub';
  try {
    NativeFile.copyFile(uri, epubFilePath);
  } catch {
    throw new Error(
      `Failed to read EPUB file "${filename}". The file may have been moved or deleted. Please try importing again.`,
    );
  }
  const epubDirPath =
    NativeFile.getConstants().ExternalCachesDirectoryPath + '/epub';
  if (NativeFile.exists(epubDirPath)) {
    NativeFile.unlink(epubDirPath);
  }
  NativeFile.mkdir(epubDirPath);
  await NativeZipArchive.unzip(epubFilePath, epubDirPath);
  const novel = NativeEpub.parseNovelAndChapters(epubDirPath);
  if (!novel.name) {
    novel.name = filename.replace('.epub', '') || 'Untitled';
  }
  const novelId = await insertLocalNovel(
    novel.name,
    epubDirPath + novel.name, // temporary
    novel.cover || '',
    novel.author || '',
    novel.artist || '',
    novel.summary || '',
  );
  const now = dayjs().toISOString();
  if (novel.chapters && novel.chapters.length) {
    // Prepare DB rows for batch insert (so we can get inserted ids)
    const rows = novel.chapters.map((chapter, i) => {
      const name = chapter.name || chapter.path.split(/[/\\]/).pop() || 'unknown';
      return {
        novelId,
        name,
        path: NOVEL_STORAGE + '/local/' + novelId + '/' + i,
        releaseTime: now,
        position: i,
        isDownloaded: true,
      };
    });

    const inserted: Array<{ id: number }> = await dbManager.write(async tx => {
      return tx.insert(chapterSchema).values(rows).returning({ id: chapterSchema.id }).all();
    });

    // Write chapter files in parallel with limited concurrency
    const CONCURRENCY = 6;
    let completed = 0;
    const tasks = inserted.map((ins, idx) => async () => {
      const chapter = novel.chapters![idx];
      const insertedId = ins.id;
      const name = chapter.name || chapter.path.split(/[/\\]/).pop() || 'unknown';
      setMeta(meta => ({ ...meta, progressText: name }));

      let chapterText = '';
      try {
        chapterText = NativeFile.readFile(decodePath(chapter.path));
      } catch (e) {
        chapterText = '';
      }
      if (!chapterText) {
        completed++;
        setMeta(meta => ({ ...meta, progress: completed / inserted.length }));
        return;
      }

      const novelDir = `${NOVEL_STORAGE}/local/${novelId}`;
      const adjusted = chapterText.replace(
        /[=](?<= href=| src=)(["'])([^]*?)\1/g,
        (_, __, $2: string) => {
          return `="file://${novelDir}/${$2.split(/[/\\]/).pop()}"`;
        },
      );

      NativeFile.mkdir(novelDir + '/' + insertedId);
      NativeFile.writeFile(`${novelDir}/${insertedId}/index.html`, adjusted);
      completed++;
      setMeta(meta => ({ ...meta, progress: completed / inserted.length }));
    });

    // run in chunks
    for (let i = 0; i < tasks.length; i += CONCURRENCY) {
      const batch = tasks.slice(i, i + CONCURRENCY).map(fn => fn());
      await Promise.all(batch);
      await sleep(50);
    }
  }
  const novelDir = NOVEL_STORAGE + '/local/' + novelId;

  setMeta(meta => ({
    ...meta,
    progressText: getString('advancedSettingsScreen.importStaticFiles'),
  }));

  for (const filePath of novel.imagePaths) {
    const decodedPath = decodePath(filePath);

    if (NativeFile.exists(decodedPath)) {
      NativeFile.moveFile(
        decodedPath,
        novelDir + '/' + filePath.split(/[/\\]/).pop(),
      );
    }
  }

  for (const filePath of novel.cssPaths) {
    const decodedPath = decodePath(filePath);
    if (NativeFile.exists(decodedPath)) {
      NativeFile.moveFile(
        decodedPath,
        novelDir + '/' + filePath.split(/[/\\]/).pop(),
      );
    }
  }

  setMeta(meta => ({
    ...meta,
    progress: 1,
    isRunning: false,
  }));
};
