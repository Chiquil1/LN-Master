import {
  getLibraryWithCategory,
  getLibraryNovelsFromDb,
} from '../../database/queries/LibraryQueries';

import { showToast } from '../../utils/showToast';
import { UpdateNovelOptions, updateNovel } from './LibraryUpdateQueries';
import { DBNovelInfo } from '@database/types';
import { sleep } from '@utils/sleep';
import { MMKVStorage, getMMKVObject } from '@utils/mmkv/mmkv';
import { LAST_UPDATE_TIME } from '@hooks/persisted/useUpdates';
import dayjs from 'dayjs';
import { APP_SETTINGS, AppSettings } from '@hooks/persisted/useSettings';
import { BackgroundTaskMetadata } from '@services/ServiceManager';

const updateLibrary = async (
  {
    categoryId,
  }: {
    categoryId?: number;
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

  const { downloadNewChapters, refreshNovelMetadata, onlyUpdateOngoingNovels } =
    getMMKVObject<AppSettings>(APP_SETTINGS) || {};
  const options: UpdateNovelOptions = {
    downloadNewChapters: downloadNewChapters || false,
    refreshNovelMetadata: refreshNovelMetadata || false,
  };

  let libraryNovels: DBNovelInfo[] = [];
  if (categoryId) {
    libraryNovels = await getLibraryWithCategory(
      categoryId,
      onlyUpdateOngoingNovels,
      true,
    );
  } else {
    libraryNovels = await getLibraryNovelsFromDb(
      '',
      onlyUpdateOngoingNovels ? "status = 'Ongoing'" : '',
      '',
      false,
      true,
    );
  }

  if (libraryNovels.length > 0) {
    MMKVStorage.set(LAST_UPDATE_TIME, dayjs().format('YYYY-MM-DD HH:mm:ss'));
    // Process updates with controlled concurrency to avoid N+1 slowness
    const CONCURRENCY = 4;
    let completed = 0;
    const chunks: DBNovelInfo[][] = [];
    for (let i = 0; i < libraryNovels.length; i += CONCURRENCY) {
      chunks.push(libraryNovels.slice(i, i + CONCURRENCY));
    }

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async novel => {
          setMeta(meta => ({ ...meta, progressText: novel.name }));
          try {
            await updateNovel(novel.pluginId, novel.path, novel.id, options);
          } catch (error: any) {
            showToast(novel.name + ': ' + error.message);
          } finally {
            completed++;
            setMeta(meta => ({ ...meta, progress: completed / libraryNovels.length }));
          }
        }),
      );
      // brief pause between batches to be gentle on remote sources
      await sleep(200);
    }
  } else {
    showToast("There's no novel to be updated");
  }

  setMeta(meta => ({
    ...meta,
    progress: 1,
    isRunning: false,
  }));
};

export { updateLibrary };
