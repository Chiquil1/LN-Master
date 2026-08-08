import {
  getChapter as getDbChapter,
  getChapterCount,
  getNextChapter,
  getPrevChapter,
  insertChapters,
} from '@database/queries/ChapterQueries';
import { insertHistory } from '@database/queries/HistoryQueries';
import { ChapterInfo, NovelInfo } from '@database/types';
import {
  useChapterGeneralSettings,
  useLibrarySettings,
  useTrackedNovel,
  useTracker,
} from '@hooks/persisted';
import { fetchChapter, fetchPage } from '@services/plugin/fetch';
import { NOVEL_STORAGE } from '@utils/Storages';
import {
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { sanitizeChapterText } from '../utils/sanitizeChapterText';
import { parseChapterNumber } from '@utils/parseChapterNumber';
import WebView from 'react-native-webview';
import { useFullscreenMode } from '@hooks';
import { Dimensions, NativeEventEmitter } from 'react-native';
import * as Speech from 'expo-speech';
import { defaultTo } from 'lodash-es';
import { showToast } from '@utils/showToast';
import { getString } from '@strings/translations';
import NativeVolumeButtonListener from '@specs/NativeVolumeButtonListener';
import NativeFile from '@specs/NativeFile';
import { useNovelActions } from '@screens/novel/NovelContext';

const emmiter = new NativeEventEmitter(NativeVolumeButtonListener);

export interface PreparedTTSChapter {
  chapter: ChapterInfo;
  chapterText: string;
}

const DEFAULT_TTS_CHAPTER_BUFFER_SIZE = 6;

export default function useChapter(
  webViewRef: RefObject<WebView | null>,
  initialChapter: ChapterInfo,
  novel: NovelInfo,
) {
  const {
    setLastRead,
    markChapterRead,
    updateChapterProgress,
    chapterTextCache,
  } = useNovelActions();

  const [hidden, setHidden] = useState(true);
  const [chapter, setChapter] = useState(initialChapter);
  const [loading, setLoading] = useState(true);
  const [chapterText, setChapterText] = useState('');

  const [[nextChapter, prevChapter], setAdjacentChapter] = useState<
    ChapterInfo[] | undefined[]
  >([]);

  const {
    autoScroll,
    autoScrollInterval,
    autoScrollOffset,
    useVolumeButtons,
    volumeButtonsOffset,
  } = useChapterGeneralSettings();

  const { incognitoMode } = useLibrarySettings();
  const [error, setError] = useState<string>();
  const { tracker } = useTracker();
  const { trackedNovel, updateAllTrackedNovels } = useTrackedNovel(novel.id);
  const { setImmersiveMode, showStatusAndNavBar } = useFullscreenMode();

  const connectVolumeButton = useCallback(() => {
    const offset = defaultTo(
      volumeButtonsOffset,
      Math.round(Dimensions.get('window').height * 0.75),
    );

    emmiter.addListener('VolumeUp', () => {
      webViewRef.current?.injectJavaScript(`(()=>{
        window.scrollBy({top: -${offset}, behavior: 'smooth'})
      })()`);
    });

    emmiter.addListener('VolumeDown', () => {
      webViewRef.current?.injectJavaScript(`(()=>{
        window.scrollBy({top: ${offset}, behavior: 'smooth'})
      })()`);
    });
  }, [webViewRef, volumeButtonsOffset]);

  useEffect(() => {
    if (useVolumeButtons) {
      connectVolumeButton();
    } else {
      emmiter.removeAllListeners('VolumeUp');
      emmiter.removeAllListeners('VolumeDown');
    }

    return () => {
      emmiter.removeAllListeners('VolumeUp');
      emmiter.removeAllListeners('VolumeDown');
    };
  }, [useVolumeButtons, connectVolumeButton]);

  useEffect(() => {
    return () => {
      // Cancela el audio y los callbacks pertenecientes al capítulo anterior.
      // También detiene el TTS cuando el lector se desmonta completamente.
      Speech.stop();
    };
  }, [chapter.id]);

  const loadChapterText = useCallback(
    async (targetChapter: ChapterInfo, reportError = true) => {
      const filePath = `${NOVEL_STORAGE}/${novel.pluginId}/${targetChapter.novelId}/${targetChapter.id}/index.html`;
      let text = '';

      if (NativeFile.exists(filePath)) {
        text = NativeFile.readFile(filePath);
      } else {
        await fetchChapter(novel.pluginId, targetChapter.path)
          .then(res => {
            text = res;
          })
          .catch(e => {
            if (reportError) {
              setError(e.message);
            }
          });
      }

      return text;
    },
    [novel.pluginId],
  );

  const getNextChapterForTTS = useCallback(
    async (sourceChapter: ChapterInfo) => {
      let nextChap = await getNextChapter(
        sourceChapter.novelId,
        sourceChapter.position!,
        sourceChapter.page ?? '',
      );

      if (nextChap) {
        return nextChap;
      }

      const totalPages = novel.totalPages ?? 0;
      const currentPage = Number(sourceChapter.page);

      if (
        totalPages <= 0 ||
        !Number.isFinite(currentPage) ||
        currentPage >= totalPages
      ) {
        return undefined;
      }

      const nextPage = String(currentPage + 1);

      try {
        const count = await getChapterCount(sourceChapter.novelId, nextPage);

        if (count === 0) {
          const sourcePage = await fetchPage(
            novel.pluginId,
            novel.path,
            nextPage,
          );

          await insertChapters(
            sourceChapter.novelId,
            sourcePage.chapters.map(ch => ({
              ...ch,
              page: nextPage,
            })),
          );
        }

        nextChap = await getNextChapter(
          sourceChapter.novelId,
          sourceChapter.position!,
          sourceChapter.page ?? '',
        );
      } catch {
        return undefined;
      }

      return nextChap;
    },
    [novel.path, novel.pluginId, novel.totalPages],
  );

  const getPrevChapterForTTS = useCallback(
    async (sourceChapter: ChapterInfo) => {
      let prevChap = await getPrevChapter(
        sourceChapter.novelId,
        sourceChapter.position!,
        sourceChapter.page ?? '',
      );

      if (prevChap) {
        return prevChap;
      }

      const currentPage = Number(sourceChapter.page);

      if (!Number.isFinite(currentPage) || currentPage <= 1) {
        return undefined;
      }

      const prevPage = String(currentPage - 1);

      try {
        const count = await getChapterCount(sourceChapter.novelId, prevPage);

        if (count === 0) {
          const sourcePage = await fetchPage(
            novel.pluginId,
            novel.path,
            prevPage,
          );

          await insertChapters(
            sourceChapter.novelId,
            sourcePage.chapters.map(ch => ({
              ...ch,
              page: prevPage,
            })),
          );
        }

        prevChap = await getPrevChapter(
          sourceChapter.novelId,
          sourceChapter.position!,
          sourceChapter.page ?? '',
        );
      } catch {
        return undefined;
      }

      return prevChap;
    },
    [novel.path, novel.pluginId],
  );

  const prepareTTSChapterQueue = useCallback(
    async (
      maxChapters = DEFAULT_TTS_CHAPTER_BUFFER_SIZE,
    ): Promise<PreparedTTSChapter[]> => {
      const normalizedLimit = Math.max(1, Math.floor(maxChapters));
      const queueChapters: ChapterInfo[] = [];

      // Reservamos una posición para el capítulo anterior cuando exista. Así,
      // Android puede ejecutar Previous sin depender de React/WebView.
      if (normalizedLimit > 1) {
        const previousChapter = await getPrevChapterForTTS(chapter);

        if (previousChapter) {
          queueChapters.push(previousChapter);
        }
      }

      queueChapters.push(chapter);

      let nextQueueChapter: ChapterInfo | undefined = chapter;

      while (queueChapters.length < normalizedLimit && nextQueueChapter) {
        nextQueueChapter = await getNextChapterForTTS(nextQueueChapter);

        if (!nextQueueChapter) {
          break;
        }

        if (!queueChapters.some(item => item.id === nextQueueChapter?.id)) {
          queueChapters.push(nextQueueChapter);
        }
      }

      const preparedChapters: PreparedTTSChapter[] = [];

      for (const queueChapter of queueChapters) {
        const isCurrentChapter = queueChapter.id === chapter.id;
        const cachedText = chapterTextCache.read(queueChapter.id);
        const rawText = await (cachedText ??
          loadChapterText(queueChapter, isCurrentChapter));

        // Un fallo de precarga de un capítulo adyacente no debe impedir que
        // el capítulo actual ni el resto del buffer sigan disponibles.
        if (!rawText && !isCurrentChapter) {
          continue;
        }

        if (!cachedText && rawText) {
          chapterTextCache.write(queueChapter.id, rawText);
        }

        preparedChapters.push({
          chapter: queueChapter,
          chapterText: rawText
            ? sanitizeChapterText(
                novel.pluginId,
                novel.name,
                queueChapter.name,
                rawText,
              )
            : '',
        });
      }

      return preparedChapters;
    },
    [
      chapter,
      chapterTextCache,
      getNextChapterForTTS,
      getPrevChapterForTTS,
      loadChapterText,
      novel.name,
      novel.pluginId,
    ],
  );

  const getChapter = useCallback(
    async (navChapter?: ChapterInfo) => {
      try {
        const dbChapter = navChapter
          ? undefined
          : await getDbChapter(chapter.id);

        const chap = dbChapter ?? navChapter ?? chapter;
        const cachedText = chapterTextCache.read(chap.id);
        const text = cachedText ?? loadChapterText(chap);

        const [nextChapResult, prevChapResult, awaitedText] = await Promise.all(
          [
            getNextChapter(chap.novelId, chap.position!, chap.page ?? ''),
            getPrevChapter(chap.novelId, chap.position!, chap.page ?? ''),
            text,
          ],
        );

        let nextChap = nextChapResult;
        let prevChap = prevChapResult;
        const totalPages = novel.totalPages ?? 0;

        // Pre-fetch adjacent page chapters if at a page boundary
        const currentPage = Number(chap.page);

        if (!nextChap && totalPages > 0 && currentPage < totalPages) {
          const nextPage = String(currentPage + 1);

          try {
            const count = await getChapterCount(chap.novelId, nextPage);

            if (count === 0) {
              const sourcePage = await fetchPage(
                novel.pluginId,
                novel.path,
                nextPage,
              );

              await insertChapters(
                chap.novelId,
                sourcePage.chapters.map(ch => ({
                  ...ch,
                  page: nextPage,
                })),
              );
            }

            nextChap = await getNextChapter(
              chap.novelId,
              chap.position!,
              chap.page ?? '',
            );
          } catch {}
        }

        if (!prevChap && currentPage > 1) {
          const prevPage = String(currentPage - 1);

          try {
            const count = await getChapterCount(chap.novelId, prevPage);

            if (count === 0) {
              const sourcePage = await fetchPage(
                novel.pluginId,
                novel.path,
                prevPage,
              );

              await insertChapters(
                chap.novelId,
                sourcePage.chapters.map(ch => ({
                  ...ch,
                  page: prevPage,
                })),
              );
            }

            prevChap = await getPrevChapter(
              chap.novelId,
              chap.position!,
              chap.page ?? '',
            );
          } catch {}
        }

        if (nextChap && !chapterTextCache.read(nextChap.id)) {
          chapterTextCache.write(nextChap.id, loadChapterText(nextChap));
        }

        if (!cachedText) {
          chapterTextCache.write(chap.id, text);
        }

        setChapter(chap);

        setChapterText(
          sanitizeChapterText(
            novel.pluginId,
            novel.name,
            chap.name,
            awaitedText,
          ),
        );

        setAdjacentChapter([nextChap!, prevChap!]);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [
      chapter,
      chapterTextCache,
      loadChapterText,
      setChapter,
      setChapterText,
      novel.pluginId,
      novel.name,
      novel.path,
      novel.totalPages,
      setLoading,
    ],
  );

  const scrollInterval = useRef<NodeJS.Timeout>(null);

  useEffect(() => {
    if (autoScroll) {
      scrollInterval.current = setInterval(() => {
        webViewRef.current?.injectJavaScript(`(()=>{
          window.scrollBy({top:${defaultTo(
            autoScrollOffset,
            Dimensions.get('window').height,
          )},behavior:'smooth'})
        })()`);
      }, autoScrollInterval * 1000);
    } else if (scrollInterval.current) {
      clearInterval(scrollInterval.current);
    }

    return () => {
      if (scrollInterval.current) {
        clearInterval(scrollInterval.current);
      }
    };
  }, [autoScroll, autoScrollInterval, autoScrollOffset, webViewRef]);

  const updateTracker = useCallback(() => {
    const chapterNumber = parseChapterNumber(novel.name, chapter.name);

    if (tracker && trackedNovel && chapterNumber > trackedNovel.progress) {
      updateAllTrackedNovels({
        progress: chapterNumber,
      });
    }
  }, [chapter.name, novel.name, trackedNovel, tracker, updateAllTrackedNovels]);

  const saveProgress = useCallback(
    (percentage: number) => {
      if (!incognitoMode) {
        updateChapterProgress(chapter.id, percentage > 100 ? 100 : percentage);

        if (percentage >= 97) {
          // a relative number
          markChapterRead(chapter.id);
          updateTracker();
        }
      }
    },
    [
      chapter.id,
      incognitoMode,
      markChapterRead,
      updateChapterProgress,
      updateTracker,
    ],
  );

  const hideHeader = useCallback(() => {
    if (!hidden) {
      webViewRef.current?.injectJavaScript('reader.hidden.val = true');
      setImmersiveMode();
    } else {
      webViewRef.current?.injectJavaScript('reader.hidden.val = false');
      showStatusAndNavBar();
    }

    setHidden(!hidden);
  }, [hidden, setImmersiveMode, showStatusAndNavBar, webViewRef]);

  const navigateChapter = useCallback(
    (position: 'NEXT' | 'PREV') => {
      let nextNavChapter;

      if (position === 'NEXT') {
        nextNavChapter = nextChapter;
      } else if (position === 'PREV') {
        nextNavChapter = prevChapter;
      } else {
        return;
      }

      if (nextNavChapter) {
        getChapter(nextNavChapter);
      } else {
        showToast(
          position === 'NEXT'
            ? getString('readerScreen.noNextChapter')
            : getString('readerScreen.noPreviousChapter'),
        );
      }
    },
    [getChapter, nextChapter, prevChapter],
  );

  useEffect(() => {
    if (!incognitoMode) {
      insertHistory(chapter.id);
      getDbChapter(chapter.id).then(result => result && setLastRead(result));
    }

    return () => {
      if (!incognitoMode) {
        getDbChapter(chapter.id).then(result => result && setLastRead(result));
      }
    };
  }, [incognitoMode, setLastRead, setLoading, chapter.id]);

  useEffect(() => {
    if (!chapter || !chapterText) {
      getChapter();
    }
  }, [chapter, chapterText, getChapter]);

  const refetch = useCallback(() => {
    setLoading(true);
    setError('');
    getChapter();
  }, [getChapter]);

  return useMemo(
    () => ({
      hidden,
      chapter,
      nextChapter,
      prevChapter,
      error,
      loading,
      chapterText,
      setHidden,
      saveProgress,
      hideHeader,
      navigateChapter,
      refetch,
      setChapter,
      setLoading,
      getChapter,
      prepareTTSChapterQueue,
    }),
    [
      hidden,
      chapter,
      nextChapter,
      prevChapter,
      error,
      loading,
      chapterText,
      setHidden,
      saveProgress,
      hideHeader,
      navigateChapter,
      refetch,
      setChapter,
      setLoading,
      getChapter,
      prepareTTSChapterQueue,
    ],
  );
}
