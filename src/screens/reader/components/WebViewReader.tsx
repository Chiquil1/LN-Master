import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  NativeEventEmitter,
  NativeModules,
  StatusBar,
} from 'react-native';
import WebView from 'react-native-webview';
import * as Linking from 'expo-linking';
import color from 'color';

import { useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';

import { getPlugin } from '@plugins/pluginManager';
import { MMKVStorage, getMMKVObject } from '@utils/mmkv/mmkv';
import {
  CHAPTER_GENERAL_SETTINGS,
  CHAPTER_READER_SETTINGS,
  ChapterGeneralSettings,
  ChapterReaderSettings,
  initialChapterGeneralSettings,
  initialChapterReaderSettings,
} from '@hooks/persisted/useSettings';
import { getBatteryLevel } from 'react-native-device-info';
import { PLUGIN_STORAGE } from '@utils/Storages';
import { useChapterContext } from '../ChapterContext';
import { ReaderSearchResult } from '../types';
import { useTtsSession } from '../hooks/useTtsSession';
import type { TtsParagraph, TtsSettings } from '@modules/nitro-tts';
import { ChapterInfo } from '@database/types';
import { isPluginIssueReportUrl } from '../utils/sanitizeChapterText';
import {
  createTtsParagraphs,
  decodeTtsParagraphId,
  extractTtsSegments,
} from '../utils/ttsQueue';
import type { PreparedTTSChapter } from '../hooks/useChapter';

type WebViewPostEvent = {
  type: string;
  data?: unknown;
  autoStartTTS?: boolean;
};

type WebViewReaderProps = {
  onPress(): void;
  onTouchStart?(): void;
  onSearchResult(result: ReaderSearchResult): void;
  searchTextRef: React.MutableRefObject<string>;
};

const onLogMessage = (payload: { nativeEvent: { data: string } }) => {
  const dataPayload = JSON.parse(payload.nativeEvent.data);
  if (dataPayload) {
    if (dataPayload.type === 'console') {
      /* eslint-disable no-console */
      console.info(`[Console] ${JSON.stringify(dataPayload.msg, null, 2)}`);
    }
  }
};

/** Checks whether two TTS settings objects are equal */
const areTTSSettingsEqual = (
  a: ChapterReaderSettings['tts'],
  b: ChapterReaderSettings['tts'],
) => {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.rate === b.rate &&
    a.pitch === b.pitch &&
    a.autoPageAdvance === b.autoPageAdvance &&
    a.scrollToTop === b.scrollToTop &&
    a.voice?.identifier === b.voice?.identifier &&
    a.engine?.name === b.engine?.name
  );
};

const toNativeTtsSettings = (
  settings: ChapterReaderSettings['tts'],
): TtsSettings => ({
  engineName: settings?.engine?.name,
  voiceIdentifier: settings?.voice?.identifier,
  rate: settings?.rate ?? 1,
  pitch: settings?.pitch ?? 1,
});

/**
 * The adjacent chapters are resolved after the chapter itself is on screen, so
 * they are pushed into the loaded page instead of being baked into the HTML –
 * rebuilding the HTML would reload the WebView and lose the reading position.
 */
const buildAdjacentChapterScript = (
  nextChapter?: ChapterInfo,
  prevChapter?: ChapterInfo,
) => `
  window.reader?.setAdjacentChapters?.(${JSON.stringify({
    nextChapter,
    prevChapter,
    strings: {
      nextChapter: getString('readerScreen.nextChapter', {
        name: nextChapter?.name,
      }),
    },
  })});
  true;
`;

const { RNDeviceInfo } = NativeModules;
const deviceInfoEmitter = new NativeEventEmitter(RNDeviceInfo);

/**
 * Last level seen, so a chapter can be rendered without the synchronous native
 * call the sync variant of this API performs. It is refreshed asynchronously
 * and pushed into the page, which also happens on every battery change event.
 */
let lastKnownBatteryLevel = 0;

const assetsUriPrefix = __DEV__
  ? 'http://localhost:8081/assets'
  : 'file:///android_asset';

const TTS_CHAPTER_BUFFER_SIZE = 10;
const TTS_CHAPTER_PREFETCH_THRESHOLD = 3;

const buildTtsWebViewSyncScript = (
  paragraphIndex: number,
  playbackState: string,
) => `
  (function() {
    if (!window.tts || !window.reader?.chapterElement) { return true; }
    if (!Array.isArray(tts.allReadableElements) || tts.allReadableElements.length === 0) {
      var entries = tts.getAllReadableElements(reader.chapterElement)
        .map(function(element) {
          return { element: element, text: tts.normalizeText(element.innerText) };
        })
        .filter(function(entry) { return !!entry.text; });
      tts.allReadableElements = entries.map(function(entry) { return entry.element; });
      tts.textQueue = entries.map(function(entry) { return entry.text; });
      tts.totalElements = tts.allReadableElements.length;
    }
    if (tts.allReadableElements.length > 0) {
      tts.setActiveIndex(${paragraphIndex});
      tts.setPlaybackState(${JSON.stringify(playbackState)});
    }
    return true;
  })();
`;

const WebViewReader: React.FC<WebViewReaderProps> = ({
  onPress,
  onTouchStart,
  onSearchResult,
  searchTextRef,
}) => {
  const {
    novel,
    chapter,
    chapterText: html,
    navigateChapter,
    saveProgress,
    nextChapter,
    prevChapter,
    webViewRef,
    getChapter,
    prepareTTSChapterQueue,
    onUserInteraction,
    isTTSReadingRef,
  } = useChapterContext();
  const theme = useTheme();
  const initialReaderSettings = useMemo(
    () =>
      getMMKVObject<ChapterReaderSettings>(CHAPTER_READER_SETTINGS) ||
      initialChapterReaderSettings,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chapter.id],
  );

  const chapterGeneralSettings = useMemo(
    () =>
      getMMKVObject<ChapterGeneralSettings>(CHAPTER_GENERAL_SETTINGS) ||
      initialChapterGeneralSettings,
    // needed to preserve settings during chapter change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chapter.id],
  );

  const [batteryLevel] = useState(lastKnownBatteryLevel);
  const plugin = getPlugin(novel?.pluginId);
  const pluginCustomJS = `file://${PLUGIN_STORAGE}/${plugin?.id}/custom.js`;
  const pluginCustomCSS = `file://${PLUGIN_STORAGE}/${plugin?.id}/custom.css`;
  const nextChapterScreenVisible = useRef<boolean>(false);
  const autoStartTTSRef = useRef<boolean>(false);
  const activeChapterIdRef = useRef(chapter.id);
  const adjacentChapterScriptRef = useRef(buildAdjacentChapterScript());
  const {
    appendToQueue,
    command: runTtsCommand,
    loadAndPlay,
    progress: ttsProgress,
    seekTo: seekTts,
    state: ttsState,
    updateSettings: updateTtsSettings,
  } = useTtsSession();

  const [readerSettings, setReaderSettings] = useState(
    () =>
      getMMKVObject<ChapterReaderSettings>(CHAPTER_READER_SETTINGS) ||
      initialChapterReaderSettings,
  );

  const readerSettingsRef = useRef<ChapterReaderSettings>(readerSettings);
  const ttsSessionGenerationRef = useRef(0);
  const ttsStateRef = useRef(ttsState);
  const queuedChapterIdsRef = useRef<number[]>([]);
  const queuedChaptersRef = useRef<Map<number, ChapterInfo>>(new Map());
  const queuedParagraphsRef = useRef<TtsParagraph[]>([]);
  const queueExpansionRef = useRef<Promise<void> | null>(null);
  const expandingAnchorIdRef = useRef<number | null>(null);
  const expandedAnchorIdsRef = useRef<Set<number>>(new Set());
  const nativeNavigationTargetRef = useRef<number | null>(null);
  const pendingVisibleTtsChapterRef = useRef<ChapterInfo | null>(null);

  useEffect(() => {
    readerSettingsRef.current = readerSettings;
  }, [readerSettings]);

  const appendPreparedChapters = useCallback(
    async (preparedChapters: PreparedTTSChapter[], generation: number) => {
      const knownChapterIds = new Set(queuedChapterIdsRef.current);
      const newChapters = preparedChapters.filter(
        item => !knownChapterIds.has(item.chapter.id),
      );
      const paragraphs: TtsParagraph[] = [];
      const acceptedChapters: ChapterInfo[] = [];

      newChapters.forEach(item => {
        const chapterParagraphs = createTtsParagraphs(
          item.chapter.id,
          item.chapter.name,
          extractTtsSegments(item.chapterText),
        );
        if (chapterParagraphs.length > 0) {
          acceptedChapters.push(item.chapter);
          paragraphs.push(...chapterParagraphs);
        }
      });

      if (
        paragraphs.length === 0 ||
        generation !== ttsSessionGenerationRef.current
      ) {
        return;
      }

      acceptedChapters.forEach(item => {
        queuedChaptersRef.current.set(item.id, item);
      });
      queuedChapterIdsRef.current = [
        ...queuedChapterIdsRef.current,
        ...acceptedChapters.map(item => item.id),
      ];
      queuedParagraphsRef.current = [
        ...queuedParagraphsRef.current,
        ...paragraphs,
      ];

      await appendToQueue(
        paragraphs,
        {
          novelName: novel?.name || 'Unknown',
          chapterName: acceptedChapters[0]?.name || chapter.name,
          coverUri: novel?.cover || undefined,
        },
        toNativeTtsSettings(readerSettingsRef.current.tts),
      );

      if (generation !== ttsSessionGenerationRef.current) {
      }
    },
    [appendToQueue, chapter.name, novel?.cover, novel?.name],
  );

  const requestTtsQueueExpansion = useCallback(
    (anchorChapterId: number, includeAnchor: boolean) => {
      if (
        expandedAnchorIdsRef.current.has(anchorChapterId) ||
        expandingAnchorIdRef.current === anchorChapterId
      ) {
        return;
      }

      const generation = ttsSessionGenerationRef.current;
      expandedAnchorIdsRef.current.add(anchorChapterId);
      expandingAnchorIdRef.current = anchorChapterId;
      const expansion: Promise<void> = prepareTTSChapterQueue(
        TTS_CHAPTER_BUFFER_SIZE,
        anchorChapterId,
        includeAnchor,
      )
        .then(prepared => appendPreparedChapters(prepared, generation))
        .catch(() => {
          expandedAnchorIdsRef.current.delete(anchorChapterId);
        })
        .finally(() => {
          if (queueExpansionRef.current === expansion) {
            queueExpansionRef.current = null;
          }
          if (expandingAnchorIdRef.current === anchorChapterId) {
            expandingAnchorIdRef.current = null;
          }
        });
      queueExpansionRef.current = expansion;
    },
    [appendPreparedChapters, prepareTTSChapterQueue],
  );

  const syncVisibleTtsChapter = useCallback(
    (targetChapter: ChapterInfo) => {
      if (
        targetChapter.id === activeChapterIdRef.current ||
        targetChapter.id === nativeNavigationTargetRef.current
      ) {
        return;
      }
      if (AppState.currentState !== 'active') {
        pendingVisibleTtsChapterRef.current = targetChapter;
        return;
      }

      pendingVisibleTtsChapterRef.current = null;
      nativeNavigationTargetRef.current = targetChapter.id;
      void getChapter(targetChapter);
    },
    [getChapter],
  );

  useEffect(() => {
    ttsStateRef.current = ttsState;
    isTTSReadingRef.current = ttsState === 'playing';
    webViewRef.current?.injectJavaScript(`
      window.tts?.setPlaybackState?.(${JSON.stringify(ttsState)});
      true;
    `);

    if (ttsState === 'completed') {
      const generation = ttsSessionGenerationRef.current;
      const finishChapterQueue = () => {
        if (
          generation === ttsSessionGenerationRef.current &&
          ttsStateRef.current === 'completed' &&
          queueExpansionRef.current === null
        ) {
          webViewRef.current?.injectJavaScript(
            'window.tts?.complete?.(); true;',
          );
        }
      };
      const pendingExpansion = queueExpansionRef.current;
      if (pendingExpansion) {
        void pendingExpansion.finally(finishChapterQueue);
      } else {
        const timer = setTimeout(finishChapterQueue, 150);
        return () => clearTimeout(timer);
      }
    }

    if (ttsState === 'idle' && queuedChapterIdsRef.current.length > 0) {
      ttsSessionGenerationRef.current += 1;
      queuedChapterIdsRef.current = [];
      queuedChaptersRef.current.clear();
      queuedParagraphsRef.current = [];
      expandedAnchorIdsRef.current.clear();
      queueExpansionRef.current = null;
      expandingAnchorIdRef.current = null;
    }
    return undefined;
  }, [isTTSReadingRef, ttsState, webViewRef]);

  useEffect(() => {
    if (ttsProgress.total <= 0) {
      return;
    }

    const decoded = decodeTtsParagraphId(ttsProgress.paragraphId);
    if (!decoded || decoded.chapterId === activeChapterIdRef.current) {
      const localParagraphIndex = decoded?.paragraphIndex ?? ttsProgress.index;
      webViewRef.current?.injectJavaScript(
        buildTtsWebViewSyncScript(localParagraphIndex, ttsStateRef.current),
      );
    }

    if (!decoded) {
      return;
    }

    const activeTtsChapter = queuedChaptersRef.current.get(decoded.chapterId);
    if (activeTtsChapter) {
      syncVisibleTtsChapter(activeTtsChapter);
    }

    const nativeChapterIndex = queuedChapterIdsRef.current.indexOf(
      decoded.chapterId,
    );
    if (nativeChapterIndex < 0) {
      return;
    }
    const remainingChapters =
      queuedChapterIdsRef.current.length - nativeChapterIndex - 1;
    if (remainingChapters <= TTS_CHAPTER_PREFETCH_THRESHOLD) {
      const anchorChapterId = queuedChapterIdsRef.current.at(-1);
      if (anchorChapterId !== undefined) {
        requestTtsQueueExpansion(anchorChapterId, false);
      }
    }
  }, [
    requestTtsQueueExpansion,
    syncVisibleTtsChapter,
    ttsProgress,
    webViewRef,
  ]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active' && pendingVisibleTtsChapterRef.current) {
        syncVisibleTtsChapter(pendingVisibleTtsChapterRef.current);
      }
    });
    return () => subscription.remove();
  }, [syncVisibleTtsChapter]);

  useEffect(() => {
    if (activeChapterIdRef.current === chapter.id) {
      return;
    }

    if (nativeNavigationTargetRef.current === chapter.id) {
      nativeNavigationTargetRef.current = null;
      activeChapterIdRef.current = chapter.id;
      return;
    }

    activeChapterIdRef.current = chapter.id;
    ttsSessionGenerationRef.current += 1;
    expandedAnchorIdsRef.current.clear();
    runTtsCommand('stop');
  }, [chapter.id, runTtsCommand]);

  useEffect(() => {
    const script = buildAdjacentChapterScript(nextChapter, prevChapter);
    // Kept for onLoadEnd: an update that lands before the document is ready is
    // dropped by the WebView, so it is replayed once the page has loaded.
    adjacentChapterScriptRef.current = script;
    webViewRef.current?.injectJavaScript(script);
  }, [nextChapter, prevChapter, webViewRef]);

  useEffect(() => {
    const mmkvListener = MMKVStorage.addOnValueChangedListener(key => {
      switch (key) {
        case CHAPTER_READER_SETTINGS: {
          // Update reader settings
          const newReaderSettings =
            getMMKVObject<ChapterReaderSettings>(CHAPTER_READER_SETTINGS) ||
            initialChapterReaderSettings;
          setReaderSettings(newReaderSettings);
          if (
            !areTTSSettingsEqual(
              readerSettingsRef.current.tts,
              newReaderSettings.tts,
            )
          ) {
            updateTtsSettings(toNativeTtsSettings(newReaderSettings.tts));
          }
          // Update WebView settings
          webViewRef.current?.injectJavaScript(
            `
            reader.readerSettings.val = ${JSON.stringify(newReaderSettings)}
            `,
          );
          break;
        }
        case CHAPTER_GENERAL_SETTINGS: {
          const newGeneralSettings =
            getMMKVObject<ChapterGeneralSettings>(CHAPTER_GENERAL_SETTINGS) ||
            initialChapterGeneralSettings;
          webViewRef.current?.injectJavaScript(
            `reader.generalSettings.val = ${JSON.stringify(
              newGeneralSettings,
            )}`,
          );
          break;
        }
      }
    });

    const subscription = deviceInfoEmitter.addListener(
      'RNDeviceInfo_batteryLevelDidChange',
      (level: number) => {
        lastKnownBatteryLevel = level;
        webViewRef.current?.injectJavaScript(
          `reader.batteryLevel.val = ${level}`,
        );
      },
    );

    getBatteryLevel().then(level => {
      lastKnownBatteryLevel = level;
      webViewRef.current?.injectJavaScript(
        `if (window.reader?.batteryLevel) {
          window.reader.batteryLevel.val = ${level};
        }`,
      );
    });

    return () => {
      subscription.remove();
      mmkvListener.remove();
    };
  }, [updateTtsSettings, webViewRef]);
  const isRTL = plugin?.lang === 'Arabic' || plugin?.lang === 'Hebrew';
  const readerDir = isRTL ? 'rtl' : 'ltr';

  /**
   * Serialising the whole chapter is expensive, so the document is built once
   * per chapter. Handing the WebView a different `source` also reloads the
   * page, so nothing that changes while a chapter is on screen may be part of
   * it – those updates go through `injectJavaScript` instead.
   */
  const source = useMemo(() => {
    // eslint-disable-next-line react-hooks/refs
    const isNextChapterScreenVisible = nextChapterScreenVisible.current;
    return {
      baseUrl: !chapter.isDownloaded ? plugin?.site : undefined,
      headers: plugin?.imageRequestInit?.headers,
      method: plugin?.imageRequestInit?.method,
      body: plugin?.imageRequestInit?.body,
      html: `
        <!DOCTYPE html>
          <html dir="${readerDir}">
            <head>
              <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
              <link rel="stylesheet" href="${assetsUriPrefix}/css/index.css">
              <link rel="stylesheet" href="${assetsUriPrefix}/css/pageReader.css">
              <link rel="stylesheet" href="${assetsUriPrefix}/css/toolWrapper.css">
              <link rel="stylesheet" href="${assetsUriPrefix}/css/tts.css">
              <style>
              :root {
                --StatusBar-currentHeight: ${StatusBar.currentHeight}px;
                --readerSettings-theme: ${initialReaderSettings.theme};
                --readerSettings-padding: ${initialReaderSettings.padding}px;
                --readerSettings-textSize: ${initialReaderSettings.textSize}px;
                --readerSettings-textColor: ${initialReaderSettings.textColor};
                --readerSettings-textAlign: ${initialReaderSettings.textAlign};
                --readerSettings-lineHeight: ${
                  initialReaderSettings.lineHeight
                };
                --readerSettings-fontFamily: ${
                  initialReaderSettings.fontFamily
                };
                --theme-primary: ${theme.primary};
                --theme-onPrimary: ${theme.onPrimary};
                --theme-secondary: ${theme.secondary};
                --theme-tertiary: ${theme.tertiary};
                --theme-onTertiary: ${theme.onTertiary};
                --theme-onSecondary: ${theme.onSecondary};
                --theme-surface: ${theme.surface};
                --theme-surface-0-9: ${color(theme.surface)
                  .alpha(0.9)
                  .toString()};
                --theme-onSurface: ${theme.onSurface};
                --theme-surfaceVariant: ${theme.surfaceVariant};
                --theme-onSurfaceVariant: ${theme.onSurfaceVariant};
                --theme-outline: ${theme.outline};
                --theme-rippleColor: ${theme.rippleColor};
                }
                </style>
                <style id="ln-font">
                @font-face {
                  font-family: ${initialReaderSettings.fontFamily};
                  src: url("file:///android_asset/fonts/${
                    initialReaderSettings.fontFamily
                  }.ttf");
                }
				</style>
              <link rel="stylesheet" href="${pluginCustomCSS}">
              <style id="ln-custom-css">${
                initialReaderSettings.customCSS
              }</style>
            </head>
            <body class="${
              chapterGeneralSettings.pageReader ? 'page-reader' : ''
            }">
              <div class="transition-chapter" style="transform: ${
                isNextChapterScreenVisible
                  ? 'translateX(-100%)'
                  : 'translateX(0%)'
              };
              ${chapterGeneralSettings.pageReader ? '' : 'display: none'}"
              ">${chapter.name}</div>
              <div id="LNReader-chapter">
                ${html}
              </div>
              <div id="reader-ui"></div>
              </body>
              <script>
                var initialPageReaderConfig = ${JSON.stringify({
                  nextChapterScreenVisible: isNextChapterScreenVisible,
                })};


                var initialReaderConfig = ${JSON.stringify({
                  readerSettings: initialReaderSettings,
                  chapterGeneralSettings,
                  novel,
                  chapter,
                  batteryLevel,
                  autoSaveInterval: 2222,
                  DEBUG: __DEV__,
                  strings: {
                    finished:
                      getString('readerScreen.finished') +
                      ': ' +
                      chapter.name.trim(),
                    noNextChapter: getString('readerScreen.noNextChapter'),
                  },
                })}
              </script>
              <script src="${assetsUriPrefix}/js/polyfill-onscrollend.js"></script>
              <script src="${assetsUriPrefix}/js/icons.js"></script>
              <script src="${assetsUriPrefix}/js/van.js"></script>
              <script src="${assetsUriPrefix}/js/text-vibe.js"></script>
              <script src="${assetsUriPrefix}/js/core.js"></script>
              <script src="${assetsUriPrefix}/js/search.js"></script>
              <script src="${assetsUriPrefix}/js/index.js"></script>
              <script src="${pluginCustomJS}"></script>
              <script id="ln-custom-js">
                ${initialReaderSettings.customJS}
              </script>
          </html>
          `,
    };
  }, [
    batteryLevel,
    chapter,
    chapterGeneralSettings,
    html,
    initialReaderSettings,
    novel,
    plugin,
    pluginCustomCSS,
    pluginCustomJS,
    readerDir,
    theme,
  ]);

  return (
    <WebView
      ref={webViewRef}
      onTouchStart={onTouchStart}
      style={{ backgroundColor: readerSettings.theme }}
      allowFileAccess={true}
      originWhitelist={['*']}
      scalesPageToFit={true}
      showsVerticalScrollIndicator={false}
      javaScriptEnabled={true}
      webviewDebuggingEnabled={__DEV__}
      onShouldStartLoadWithRequest={({ url }) => {
        if (isPluginIssueReportUrl(url)) {
          void Linking.openURL(url);
          return false;
        }
        return true;
      }}
      onLoadEnd={() => {
        webViewRef.current?.injectJavaScript(
          `if (window.reader && window.reader.batteryLevel) {
            window.reader.batteryLevel.val = ${lastKnownBatteryLevel};
          }`,
        );
        webViewRef.current?.injectJavaScript(adjacentChapterScriptRef.current);

        const decodedProgress = decodeTtsParagraphId(ttsProgress.paragraphId);
        if (
          decodedProgress?.chapterId === chapter.id &&
          ttsProgress.total > 0
        ) {
          webViewRef.current?.injectJavaScript(
            buildTtsWebViewSyncScript(
              decodedProgress.paragraphIndex,
              ttsStateRef.current,
            ),
          );
        }

        const searchText = searchTextRef.current.trim();
        if (searchText) {
          webViewRef.current?.injectJavaScript(
            `window.readerSearch?.search(${JSON.stringify(searchText)}); true;`,
          );
        }

        if (autoStartTTSRef.current) {
          autoStartTTSRef.current = false;
          setTimeout(() => {
            webViewRef.current?.injectJavaScript(`
              (function() {
                if (window.tts && reader.generalSettings.val.TTSEnable) {
                  setTimeout(() => {
                    tts.start();
                  }, 500);
                }
              })();
            `);
          }, 300);
        }
      }}
      onMessage={(ev: { nativeEvent: { data: string } }) => {
        __DEV__ && onLogMessage(ev);
        const event: WebViewPostEvent = JSON.parse(ev.nativeEvent.data);
        switch (event.type) {
          case 'tts-queue': {
            const payload = event.data as
              | { queue?: unknown; startIndex?: unknown }
              | undefined;
            const queue = Array.isArray(payload?.queue)
              ? payload.queue.filter(
                  (item): item is string =>
                    typeof item === 'string' && item.trim().length > 0,
                )
              : [];
            const startIndex =
              typeof payload?.startIndex === 'number' ? payload.startIndex : 0;
            const generation = ttsSessionGenerationRef.current + 1;
            ttsSessionGenerationRef.current = generation;
            queuedChapterIdsRef.current = [chapter.id];
            queuedChaptersRef.current = new Map([[chapter.id, chapter]]);
            expandedAnchorIdsRef.current.clear();
            expandingAnchorIdRef.current = null;
            queueExpansionRef.current = null;

            const currentParagraphs = createTtsParagraphs(
              chapter.id,
              chapter.name,
              queue,
            );
            const nativeStartIndex = Math.max(
              currentParagraphs.findIndex(paragraph => {
                const decoded = decodeTtsParagraphId(paragraph.id);
                return decoded?.paragraphIndex === startIndex;
              }),
              0,
            );
            queuedParagraphsRef.current = currentParagraphs;
            void loadAndPlay(
              currentParagraphs,
              nativeStartIndex,
              {
                novelName: novel?.name || 'Unknown',
                chapterName: chapter.name,
                coverUri: novel?.cover || undefined,
              },
              toNativeTtsSettings(readerSettingsRef.current.tts),
            );
            if (
              currentParagraphs.length > 0 &&
              readerSettingsRef.current.tts?.autoPageAdvance === true
            ) {
              requestTtsQueueExpansion(chapter.id, true);
            }
            break;
          }
          case 'tts-command': {
            if (!event.data || typeof event.data !== 'object') {
              break;
            }
            const data = event.data as {
              command?: unknown;
              index?: unknown;
            };
            switch (data.command) {
              case 'next':
              case 'pause':
              case 'play':
              case 'previous':
              case 'replay':
              case 'stop':
                if (data.command === 'stop') {
                  ttsSessionGenerationRef.current += 1;
                  expandedAnchorIdsRef.current.clear();
                  queueExpansionRef.current = null;
                  expandingAnchorIdRef.current = null;
                }
                runTtsCommand(data.command);
                break;
              case 'seekTo':
                if (typeof data.index === 'number') {
                  const globalIndex = queuedParagraphsRef.current.findIndex(
                    paragraph => {
                      const decoded = decodeTtsParagraphId(paragraph.id);
                      return (
                        decoded?.chapterId === chapter.id &&
                        decoded.paragraphIndex === data.index
                      );
                    },
                  );
                  seekTts(globalIndex >= 0 ? globalIndex : data.index);
                }
                break;
            }
            break;
          }
          case 'hide':
            onPress();
            break;
          case 'next':
            nextChapterScreenVisible.current = true;
            if (event.autoStartTTS) {
              autoStartTTSRef.current = true;
            }
            navigateChapter('NEXT');
            break;
          case 'prev':
            if (event.autoStartTTS) {
              autoStartTTSRef.current = true;
            }
            navigateChapter('PREV');
            break;
          case 'save':
            if (event.data && typeof event.data === 'number') {
              saveProgress(event.data);
            }
            break;
          case 'search-result':
            if (event.data && typeof event.data === 'object') {
              const data = event.data as {
                query?: unknown;
                current?: unknown;
                total?: unknown;
                renderedTotal?: unknown;
                isTruncated?: unknown;
              };
              const query = typeof data.query === 'string' ? data.query : '';
              if (query !== searchTextRef.current.trim()) {
                break;
              }
              const total = typeof data.total === 'number' ? data.total : 0;
              onSearchResult({
                query,
                current: typeof data.current === 'number' ? data.current : 0,
                total,
                renderedTotal:
                  typeof data.renderedTotal === 'number'
                    ? data.renderedTotal
                    : total,
                isTruncated: data.isTruncated === true,
              });
            }
            break;
          case 'interaction':
            onUserInteraction();
            break;
        }
      }}
      source={source}
    />
  );
};

export default memo(WebViewReader);
