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
import color from 'color';

import { useTheme } from '@hooks/persisted';
import { getString } from '@strings/translations';

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
import { getBatteryLevelSync } from 'react-native-device-info';
import { PLUGIN_STORAGE } from '@utils/Storages';
import NativeTTSMediaControl from '@specs/NativeTTSMediaControl';
import { useChapterContext } from '../ChapterContext';
import { useTTSStore } from '@hooks/useTTSStore';
import {
  showTTSNotification,
  updateTTSNotification,
  updateTTSPlaybackState,
  updateTTSProgress,
  ttsMediaEmitter,
} from '@utils/ttsNotification';
import { registerTTSWebView, unregisterTTSWebView } from '@utils/ttsService';

type WebViewPostEvent = {
  type: string;
  data?: { [key: string]: unknown };
  autoStartTTS?: boolean;
  index?: number;
  total?: number;
};

type WebViewReaderProps = {
  onPress(): void;
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

const { RNDeviceInfo } = NativeModules;
const deviceInfoEmitter = new NativeEventEmitter(RNDeviceInfo);

const assetsUriPrefix = __DEV__
  ? 'http://localhost:8081/assets'
  : 'file:///android_asset';

const WebViewReader: React.FC<WebViewReaderProps> = ({ onPress }) => {
  const {
    novel,
    chapter,
    chapterText: html,
    navigateChapter,
    saveProgress,
    nextChapter,
    prevChapter,
    webViewRef,
  } = useChapterContext();
  const theme = useTheme();
  const [readerSettings, setReaderSettings] = useState<ChapterReaderSettings>(
    () =>
      getMMKVObject<ChapterReaderSettings>(CHAPTER_READER_SETTINGS) ||
      initialChapterReaderSettings,
  );
  const chapterGeneralSettings = useMemo(
    () =>
      getMMKVObject<ChapterGeneralSettings>(CHAPTER_GENERAL_SETTINGS) ||
      initialChapterGeneralSettings,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chapter.id],
  );

  useEffect(() => {
    setReaderSettings(
      getMMKVObject<ChapterReaderSettings>(CHAPTER_READER_SETTINGS) ||
        initialChapterReaderSettings,
    );
  }, [chapter.id]);

  const batteryLevel = useMemo(() => getBatteryLevelSync(), []);
  const plugin = getPlugin(novel?.pluginId);
  const pluginCustomJS = `file://${PLUGIN_STORAGE}/${plugin?.id}/custom.js`;
  const pluginCustomCSS = `file://${PLUGIN_STORAGE}/${plugin?.id}/custom.css`;
  const nextChapterScreenVisible = useRef<boolean>(false);
  const autoStartTTSRef = useRef<boolean>(false);
  const isTTSReadingRef = useRef<boolean>(false);
  const readerSettingsRef = useRef<ChapterReaderSettings>(readerSettings);
  const appStateRef = useRef(AppState.currentState);
  const isSpeakingRef = useRef<boolean>(false);
  const nativePlaybackStartedRef = useRef<boolean>(false);
  const nativePlaybackPausedRef = useRef<boolean>(false);
  const isAutoStartingRef = useRef<boolean>(false);
  const isTransitioningRef = useRef<boolean>(false);
  const ttsSegmentsRef = useRef<string[]>([]);
  const ttsIndexRef = useRef<number>(0);
  const ttsChapterIdRef = useRef<number | null>(null);
  const speechSessionRef = useRef<number>(0);
  const pendingNavigationRef = useRef<'NEXT' | 'PREV' | null>(null);

  const {
    queue: ttsQueue,
    currentChapterIndex: ttsCurrentChapterIndex,
    setQueue: setTTSQueue,
    clearQueue: clearTTSQueue,
    setCurrentChapterIndex: setTTSCurrentChapterIndex,
    setIsPlaying: setTTSIsPlaying,
    updateCurrentItemCurrentIndex,
  } = useTTSStore();

  const currentTTSItem = ttsQueue[ttsCurrentChapterIndex];
  const currentTTSIndex = currentTTSItem?.currentIndex ?? 0;
  const currentTTSSegments = useMemo(
    () => currentTTSItem?.textSegments ?? [],
    [currentTTSItem],
  );

  useEffect(() => {
    readerSettingsRef.current = readerSettings;
  }, [readerSettings]);

  useEffect(() => {
    ttsSegmentsRef.current = currentTTSSegments;
    ttsIndexRef.current = currentTTSIndex;
  }, [currentTTSIndex, currentTTSSegments]);

  useEffect(() => {
    speechSessionRef.current += 1;
    isSpeakingRef.current = false;
    isAutoStartingRef.current = false;
    nativePlaybackStartedRef.current = false;
    nativePlaybackPausedRef.current = false;
    ttsSegmentsRef.current = [];
    ttsIndexRef.current = 0;
    ttsChapterIdRef.current = null;
  }, [chapter.id]);

  const requestChapterNavigation = useCallback(
    (position: 'NEXT' | 'PREV') => {
      const targetChapter = position === 'NEXT' ? nextChapter : prevChapter;

      if (!targetChapter || isTransitioningRef.current) {
        if (!targetChapter) {
          autoStartTTSRef.current = false;
          isTransitioningRef.current = false;
          isTTSReadingRef.current = false;
          setTTSIsPlaying(false);
          updateTTSPlaybackState(false);
          webViewRef.current?.injectJavaScript(`
            if (window.tts) { tts.stop(); }
            true;
          `);
        }
        return;
      }

      isTransitioningRef.current = true;
      isAutoStartingRef.current = false;
      autoStartTTSRef.current = true;
      pendingNavigationRef.current = position;

      // Invalida todos los callbacks del párrafo o capítulo anterior.
      speechSessionRef.current += 1;
      NativeTTSMediaControl.stopNativePlayback();
      isSpeakingRef.current = false;
      nativePlaybackStartedRef.current = false;
      nativePlaybackPausedRef.current = false;

      const navigateWhenActive = () => {
        if (pendingNavigationRef.current !== position) {
          return;
        }

        // Android puede suspender el WebView con la pantalla apagada.
        // Conservamos la navegación pendiente hasta volver al primer plano.
        if (appStateRef.current !== 'active') {
          return;
        }

        pendingNavigationRef.current = null;
        navigateChapter(position);
      };

      if (appStateRef.current === 'active') {
        setTimeout(navigateWhenActive, 500);
      }
    },
    [navigateChapter, nextChapter, prevChapter, setTTSIsPlaying, webViewRef],
  );

  const tryAutoStartTTS = useCallback(() => {
    if (
      !autoStartTTSRef.current ||
      isAutoStartingRef.current ||
      appStateRef.current !== 'active'
    ) {
      return;
    }

    isAutoStartingRef.current = true;
    const chapterId = chapter.id;

    // Se conserva la pausa de 500 ms solicitada para que el capítulo termine
    // de montar antes de iniciar su primer párrafo.
    setTimeout(() => {
      if (!autoStartTTSRef.current || appStateRef.current !== 'active') {
        isAutoStartingRef.current = false;
        return;
      }

      webViewRef.current?.injectJavaScript(`
        (function waitForTTSReady(attempt) {
          const readerReady =
            window.reader &&
            window.reader.generalSettings &&
            window.reader.generalSettings.val;
          const ttsReady =
            window.tts && typeof window.tts.start === 'function';

          if (
            readerReady &&
            ttsReady &&
            window.reader.generalSettings.val.TTSEnable
          ) {
            window.tts.start();

            const controller = document.getElementById('TTS-Controller');
            if (controller && controller.firstElementChild) {
              controller.firstElementChild.innerHTML = pauseIcon;
            }

            window.ReactNativeWebView.postMessage(
              JSON.stringify({
                type: 'tts-auto-started',
                data: { chapterId: ${chapterId} },
              }),
            );
            return;
          }

          if (attempt < 50) {
            setTimeout(function() {
              waitForTTSReady(attempt + 1);
            }, 100);
            return;
          }

          window.ReactNativeWebView.postMessage(
            JSON.stringify({
              type: 'tts-auto-start-failed',
              data: { chapterId: ${chapterId} },
            }),
          );
        })(0);
        true;
      `);
    }, 500);
  }, [chapter.id, webViewRef]);

  useEffect(() => {
    registerTTSWebView(webViewRef);
    return () => {
      unregisterTTSWebView();
    };
  }, [webViewRef]);

  useEffect(() => {
    const playListener = ttsMediaEmitter.addListener('TTSPlay', () => {
      nativePlaybackPausedRef.current = false;
      isSpeakingRef.current = true;
      NativeTTSMediaControl.resumePlayback();
      webViewRef.current?.injectJavaScript(`
        if (window.tts && !tts.reading) { tts.resume(); }
        true;
      `);
    });

    const pauseListener = ttsMediaEmitter.addListener('TTSPause', () => {
      nativePlaybackPausedRef.current = true;
      isSpeakingRef.current = false;
      NativeTTSMediaControl.pausePlayback();
      webViewRef.current?.injectJavaScript(`
        if (window.tts && tts.reading) { tts.pause(); }
        true;
      `);
    });

    const stopListener = ttsMediaEmitter.addListener('TTSStop', () => {
      speechSessionRef.current += 1;
      nativePlaybackStartedRef.current = false;
      nativePlaybackPausedRef.current = false;
      isSpeakingRef.current = false;
      webViewRef.current?.injectJavaScript(`
        if (window.tts) { tts.stop(); }
        true;
      `);
    });

    const rewindListener = ttsMediaEmitter.addListener('TTSRewind', () => {
      // El servicio reinicia el párrafo actual y emitirá TTSNativeSegment
      // cuando comience. Evitamos reiniciar también el motor del WebView.
      nativePlaybackPausedRef.current = false;
    });

    const prevListener = ttsMediaEmitter.addListener('TTSPrev', () => {
      requestChapterNavigation('PREV');
    });

    const nextListener = ttsMediaEmitter.addListener('TTSNext', () => {
      requestChapterNavigation('NEXT');
    });

    const seekToListener = ttsMediaEmitter.addListener(
      'TTSSeekTo',
      (event: { position: number }) => {
        const position = event.position;
        webViewRef.current?.injectJavaScript(`
          if (window.tts && tts.started) { tts.seekTo(${position}); }
          true;
        `);
      },
    );

    const segmentListener = ttsMediaEmitter.addListener(
      'TTSNativeSegment',
      (event: { position?: number }) => {
        const index = event.position;

        if (
          typeof index !== 'number' ||
          index < 0 ||
          index >= ttsSegmentsRef.current.length
        ) {
          return;
        }

        nativePlaybackStartedRef.current = true;
        nativePlaybackPausedRef.current = false;
        isSpeakingRef.current = true;
        ttsIndexRef.current = index;
        updateCurrentItemCurrentIndex(index);
        updateTTSProgress(index, ttsSegmentsRef.current.length);

        webViewRef.current?.injectJavaScript(`
          (function() {
            if (!window.tts || !window.tts.allReadableElements) { return; }
            var idx = ${index};
            if (idx >= tts.allReadableElements.length) { return; }
            if (tts.currentElement) {
              tts.currentElement.classList.remove('highlight');
            }
            tts.elementsRead = idx;
            tts.currentElement = tts.allReadableElements[idx];
            tts.prevElement = null;
            tts.started = true;
            tts.reading = true;
            tts.currentElement.classList.add('highlight');
            tts.scrollToElement(tts.currentElement);
          })();
          true;
        `);
      },
    );

    const queueFinishedListener = ttsMediaEmitter.addListener(
      'TTSNativeQueueFinished',
      () => {
        if (!nativePlaybackStartedRef.current) {
          return;
        }

        nativePlaybackStartedRef.current = false;
        nativePlaybackPausedRef.current = false;
        isSpeakingRef.current = false;

        if (nextChapter) {
          requestChapterNavigation('NEXT');
          return;
        }

        isTTSReadingRef.current = false;
        setTTSIsPlaying(false);
        clearTTSQueue();
        setTTSCurrentChapterIndex(0);
        updateTTSPlaybackState(false);
        NativeTTSMediaControl.stopNativePlayback();
        webViewRef.current?.injectJavaScript(`
          if (window.tts) { tts.stop(); }
          true;
        `);
      },
    );

    const nativeErrorListener = ttsMediaEmitter.addListener(
      'TTSNativeError',
      (event: { message?: string }) => {
        console.warn('[TTS] Error del motor nativo:', event.message);
      },
    );

    return () => {
      playListener.remove();
      pauseListener.remove();
      stopListener.remove();
      rewindListener.remove();
      prevListener.remove();
      nextListener.remove();
      seekToListener.remove();
      segmentListener.remove();
      queueFinishedListener.remove();
      nativeErrorListener.remove();
    };
  }, [
    clearTTSQueue,
    nextChapter,
    requestChapterNavigation,
    setTTSCurrentChapterIndex,
    setTTSIsPlaying,
    updateCurrentItemCurrentIndex,
    webViewRef,
  ]);

  useEffect(() => {
    if (isTTSReadingRef.current) {
      updateTTSNotification({
        novelName: novel?.name || 'Unknown',
        chapterName: chapter.name,
        coverUri: novel?.cover || '',
        isPlaying: isTTSReadingRef.current,
      });
    }
  }, [novel?.name, novel?.cover, chapter.name]);

  useEffect(() => {
    return () => {
      if (!isTTSReadingRef.current) {
        updateTTSPlaybackState(false);
      }
      NativeTTSMediaControl.stopNativePlayback();
      isSpeakingRef.current = false;
    };
  }, []);

  useEffect(() => {
    const mmkvListener = MMKVStorage.addOnValueChangedListener(key => {
      switch (key) {
        case CHAPTER_READER_SETTINGS:
          const newSettings =
            getMMKVObject<ChapterReaderSettings>(CHAPTER_READER_SETTINGS) ||
            initialChapterReaderSettings;
          setReaderSettings(newSettings);

          NativeTTSMediaControl.stopNativePlayback();
          isSpeakingRef.current = false;
          nativePlaybackStartedRef.current = false;
          nativePlaybackPausedRef.current = false;

          webViewRef.current?.injectJavaScript(
            `
            reader.readerSettings.val = ${MMKVStorage.getString(
              CHAPTER_READER_SETTINGS,
            )};
            if (window.tts && tts.reading) {
              const currentElement = tts.currentElement;
              const wasReading = tts.reading;
              tts.stop();
              if (wasReading) {
                setTimeout(() => {
                  tts.start(currentElement);
                }, 100);
              }
            }
            `,
          );
          break;
        case CHAPTER_GENERAL_SETTINGS:
          webViewRef.current?.injectJavaScript(
            `reader.generalSettings.val = ${MMKVStorage.getString(
              CHAPTER_GENERAL_SETTINGS,
            )}`,
          );
          break;
      }
    });

    const subscription = deviceInfoEmitter.addListener(
      'RNDeviceInfo_batteryLevelDidChange',
      (level: number) => {
        webViewRef.current?.injectJavaScript(
          `reader.batteryLevel.val = ${level}`,
        );
      },
    );
    return () => {
      subscription.remove();
      mmkvListener.remove();
    };
  }, [webViewRef]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      appStateRef.current = nextState;

      if (nextState !== 'active') {
        return;
      }

      const pendingNavigation = pendingNavigationRef.current;
      if (pendingNavigation) {
        setTimeout(() => {
          if (
            appStateRef.current === 'active' &&
            pendingNavigationRef.current === pendingNavigation
          ) {
            pendingNavigationRef.current = null;
            navigateChapter(pendingNavigation);
          }
        }, 500);
        return;
      }

      if (autoStartTTSRef.current) {
        isAutoStartingRef.current = false;
        tryAutoStartTTS();
        return;
      }

      if (isTTSReadingRef.current) {
        const index = ttsIndexRef.current;
        webViewRef.current?.injectJavaScript(`
          if (window.tts && window.tts.allReadableElements) {
            const idx = ${index};
            if (idx < tts.allReadableElements.length) {
              if (tts.currentElement) {
                tts.currentElement.classList.remove('highlight');
              }
              tts.elementsRead = idx;
              tts.currentElement = tts.allReadableElements[idx];
              tts.prevElement = null;
              tts.started = true;
              if (tts.currentElement) {
                tts.scrollToElement(tts.currentElement);
                tts.currentElement.classList.add('highlight');
              }
            }
          }
          true;
        `);
      }
    });

    return () => subscription.remove();
  }, [navigateChapter, tryAutoStartTTS, webViewRef]);

  // Función para limpiar texto antes de enviarlo al TTS
  const cleanTextForTTS = (text: string): string => {
    if (!text) return '';
    let cleaned = text;

    // 1. Limpieza de Kaomojis y Emociones
    const kaomojiEmotions: { [key: string]: string } = {
      '(◕ᴗ◕)': 'feliz',
      '(◕‿◕)': 'feliz',
      '(◠‿◠)': 'feliz',
      '(✿◠‿◠)': 'feliz',
      '(◕‿◕✿)': 'feliz',
      '(≧◡≦)': 'feliz',
      '(^◡^)': 'feliz',
      '(｡◕‿◕｡)': 'feliz',
      '(´・ω・`)': 'triste',
      '(╥﹏╥)': 'llorando',
      '(;´༎ຶ༎ຶ`)': 'llorando',
      '(T_T)': 'llorando',
      '(ToT)': 'llorando',
      '(；ω；)': 'llorando',
      '(ノ_<。)': 'llorando',
      '(╯°□°)╯︵ ┻━┻': 'enojado volcando mesa',
      '(╬ಠ益ಠ)': 'muy enojado',
      '(ಠ_ಠ)': 'desaprobación',
      '(¬_¬)': 'desaprobación',
      '(ー_ー)': 'molesto',
      '(￣へ￣)': 'enojado',
      '(｀Д´)': 'enojado',
      '(⊙_⊙)': 'sorprendido',
      '(°ロ°)': 'sorprendido',
      '(O_O)': 'sorprendido',
      '(O_O;)': 'sorprendido',
      '(⊙_⊙;)': 'sorprendido',
      '(°□°)': 'sorprendido',
      '(*/ω＼*)': 'avergonzado',
      '(*/▽＼*)': 'avergonzado',
      '(⁄ ⁄•⁄ω⁄•⁄ ⁄)': 'avergonzado',
      '(〃▽〃)': 'avergonzado',
      '(♥ω♥)': 'enamorado',
      '(♡ω♡)': 'enamorado',
      '(´,,•ω•,,)♡': 'cariñoso',
      '(∗•ω•∗)': 'cariñoso',
      '(・_・?)': 'confundido',
      '(?_?)': 'confundido',
      '¯\\_(ツ)_/¯': 'indiferente',
      '(ᕙᕗ)': 'fuerte',
      '(ง •̀_•́)ง': 'determinado',
      '(ʕ•ᴥ•ʔ)': 'oso cute',
      '(=^･ω･^=)': 'gatito',
      '(￣o￣) zzZ': 'dormido',
      '(～o～) zzZ': 'dormido',
    };

    Object.entries(kaomojiEmotions).forEach(([kaomoji, emotion]) => {
      const escaped = kaomoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'g');
      cleaned = cleaned.replace(regex, ` ${emotion} `);
    });

    // Limpieza genérica de kaomojis restantes
    cleaned = cleaned
      .replace(/\([^()]*[◕◠◡‿][^()]*\)/g, ' feliz ')
      .replace(/\([^()]*[╥༎ຶ;][^()]*\)/g, ' llorando ')
      .replace(/\([^()]*[╯╰][^()]*\)/g, ' frustrado ')
      .replace(/┻━┻/g, ' volcando mesa ')
      .replace(/\([^()]*[ಠ益][^()]*\)/g, ' enojado ')
      .replace(/\([^()]*[ω・][^()]*\)/g, ' triste ')
      .replace(/\([^()]*[☆★✦✧][^()]*\)/g, ' brillante ')
      .replace(/\([^()]*[♥♡❤][^()]*\)/g, ' con amor ');

    // 2. Decodificación de Entidades HTML
    cleaned = cleaned
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&apos;/gi, "'")
      .replace(/&mdash;/gi, ' - ')
      .replace(/&ndash;/gi, ' - ')
      .replace(/&hellip;/gi, '...')
      .replace(/&laquo;/gi, '"')
      .replace(/&raquo;/gi, '"')
      .replace(/&ldquo;/gi, '"')
      .replace(/&rdquo;/gi, '"')
      .replace(/&lsquo;/gi, "'")
      .replace(/&rsquo;/gi, "'");

    // 3. Eliminación de códigos numéricos y hexadecimales
    cleaned = cleaned.replace(/&#\d+;/gi, ' ');
    cleaned = cleaned.replace(/&#x[0-9a-f]+;/gi, ' ');

    // 4. Eliminación de símbolos decorativos y emojis
    cleaned = cleaned
      .replace(/[★☆✦✧✩✪✫✬✭✮✯✰]+/g, '')
      .replace(
        /[─━│┃┄┅┆┇┈┉┊┋┌┍┎┏┐┑┒┓└┕┖┗┘┙┚┛├┝┞┟┠┡┢┣┤┥┦┧┨┩┪┫┬┭┮┯┰┱┲┳┴┵┶┷┸┹┺┻┼┽┾┿╀╁╂╃╄╅╆╇╈╉╊╋]+/g,
        '',
      )
      .replace(/[◆◇◈◉◊○◌◍◎●◐◑◒◓◔◕◖◗◘◙◚◛]+/g, '')
      .replace(/[♠♣♥♦♩♪♫♬♭♮♯]+/g, '')
      .replace(/[→←↑↓↔↕↖↗↘↙]+/g, '')
      .replace(/[✔✓✗✘✚✛✜✝✞✟✠✡✢✣✤✥✦]+/g, '')
      .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
      .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
      .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
      .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '');

    // 5. Limpieza de caracteres de control invisibles
    // Remove control characters by character code to avoid control-regex warnings
    const filtered = Array.from(cleaned)
      .filter(ch => {
        const code = ch.charCodeAt(0);
        if (code >= 0 && code <= 31) return false;
        if (code >= 127 && code <= 159) return false;
        if (
          code === 0x200b ||
          code === 0x200c ||
          code === 0x200d ||
          code === 0xfeff
        ) {
          return false;
        }
        return true;
      })
      .join('');
    cleaned = filtered.replace(/\u2028|\u2029/g, ' ');

    // 6. Reemplazo de abreviaturas comunes
    const customReplacements: { [key: string]: string } = {
      'TL': 'Traducción',
      'JP': 'Japonés',
      'CN': 'Chino',
      'KR': 'Coreano',
      'T/N': 'Nota del traductor',
      'N/T': 'Nota del traductor',
      'A/N': 'Nota del autor',
      'N/A': 'Nota del autor',
      'ED': 'Edición',
      'PR': 'Prólogo',
      'EP': 'Epílogo',
    };

    Object.entries(customReplacements).forEach(([key, value]) => {
      const regex = new RegExp(`\\b${key}\\b`, 'gi');
      cleaned = cleaned.replace(regex, value);
    });

    // 7. Normalización final de espacios y puntuación
    cleaned = cleaned
      .replace(/\s+/g, ' ')
      .replace(/\s+([.,!?;:])/g, '$1')
      .replace(/([.,!?;:])\s*([.,!?;:])/g, '$1')
      .replace(/^\s+|\s+$/g, '')
      .trim();

    if (cleaned.length < 2) return '';
    return cleaned;
  };

  const speakText = (
    text: string,
    index = ttsIndexRef.current,
    sessionId = speechSessionRef.current,
  ) => {
    if (sessionId !== speechSessionRef.current) {
      return;
    }

    if (
      nativePlaybackStartedRef.current &&
      nativePlaybackPausedRef.current &&
      index === ttsIndexRef.current
    ) {
      nativePlaybackPausedRef.current = false;
      isSpeakingRef.current = true;
      NativeTTSMediaControl.resumePlayback();
      return;
    }

    const selectedVoice = readerSettingsRef.current.tts?.voice;
    const segments =
      ttsSegmentsRef.current.length > 0 ? ttsSegmentsRef.current : [text];
    const preparedSegments = segments.map(segment =>
      cleanTextForTTS(segment)
        .replace(/\\/g, '')
        .replace(/""/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"')
        .replace(/[`]/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    );

    ttsIndexRef.current = index;
    isSpeakingRef.current = true;
    nativePlaybackStartedRef.current = true;
    nativePlaybackPausedRef.current = false;

    NativeTTSMediaControl.startPlayback(
      JSON.stringify(preparedSegments),
      index,
      selectedVoice?.identifier || '',
      selectedVoice?.language || '',
      readerSettingsRef.current.tts?.rate || 1,
      readerSettingsRef.current.tts?.pitch || 1,
    );
  };

  const isRTL = plugin?.lang === 'Arabic' || plugin?.lang === 'Hebrew';
  const readerDir = isRTL ? 'rtl' : 'ltr';

  const cleanupScript = `
    (function() {
      if (window.reader && window.reader.post) {
        var originalPost = window.reader.post;
        window.reader.post = function(event) {
          if (event && event.type === 'speak' && typeof event.data === 'string') {
            event.data = event.data
              .replace(/\\\\/g, '').replace(/\\\\"/g, '"').replace(/\\\\'/g, "'")
              .replace(/\\n/g, ' ').replace(/\\t/g, ' ').replace(/\\r/g, '')
              .replace(/\\b/g, '').replace(/\\f/g, '').replace(/\\v/g, '')
              .replace(/\\0/g, '').replace(/\\x[0-9a-fA-F]{2}/g, '')
              .replace(/\\u[0-9a-fA-F]{4}/g, '').replace(/\\u{[0-9a-fA-F]+}/g, '')
              .replace(/\\c[a-zA-Z]/g, '').replace(/\\[^0-9xucbfnrtv0]/g, '')
              .replace(/\\s+/g, ' ').trim();
          }
          originalPost.call(this, event);
        };
        console.log('[LNReader] TTS Cleanup Hook Injected');
      }
    })();
  `;

  return (
    <WebView
      ref={webViewRef}
      style={{ backgroundColor: readerSettings.theme }}
      allowFileAccess={true}
      originWhitelist={['*']}
      scalesPageToFit={true}
      showsVerticalScrollIndicator={false}
      javaScriptEnabled={true}
      webviewDebuggingEnabled={__DEV__}
      onLoadEnd={() => {
        const currentBatteryLevel = getBatteryLevelSync();
        webViewRef.current?.injectJavaScript(
          `if (window.reader && window.reader.batteryLevel) {
            window.reader.batteryLevel.val = ${currentBatteryLevel};
          }
          true;`,
        );

        webViewRef.current?.injectJavaScript(cleanupScript);

        if (autoStartTTSRef.current) {
          tryAutoStartTTS();
        } else {
          isAutoStartingRef.current = false;
          isTransitioningRef.current = false;
        }
      }}
      onMessage={(ev: { nativeEvent: { data: string } }) => {
        __DEV__ && onLogMessage(ev);
        const event: WebViewPostEvent = JSON.parse(ev.nativeEvent.data);
        switch (event.type) {
          case 'tts-auto-started': {
            const data = event.data as { chapterId?: unknown } | undefined;

            if (data?.chapterId === chapter.id) {
              autoStartTTSRef.current = false;
              isAutoStartingRef.current = false;
              isTransitioningRef.current = false;
              isTTSReadingRef.current = true;
              setTTSIsPlaying(true);
              updateTTSPlaybackState(true);

              updateTTSNotification({
                novelName: novel?.name || 'Unknown',
                chapterName: chapter.name,
                coverUri: novel?.cover || '',
                isPlaying: true,
              });
            }
            break;
          }
          case 'tts-auto-start-failed': {
            const data = event.data as { chapterId?: unknown } | undefined;

            if (data?.chapterId === chapter.id) {
              autoStartTTSRef.current = false;
              isAutoStartingRef.current = false;
              isTransitioningRef.current = false;
              isTTSReadingRef.current = false;
              setTTSIsPlaying(false);
              updateTTSPlaybackState(false);
              console.warn(
                '[TTS] No fue posible iniciar automáticamente el capítulo nuevo',
              );
            }
            break;
          }
          case 'tts-queue': {
            const payload = event.data as
              | { queue?: unknown; startIndex?: unknown }
              | undefined;
            const queue = Array.isArray(payload?.queue)
              ? payload?.queue.filter(
                  (item): item is string =>
                    typeof item === 'string' && item.trim().length > 0,
                )
              : [];
            const initialIndex =
              typeof payload?.startIndex === 'number' ? payload.startIndex : 0;

            ttsSegmentsRef.current = queue;
            ttsIndexRef.current = initialIndex;
            ttsChapterIdRef.current = chapter.id;

            setTTSQueue([
              {
                chapterId: chapter.id,
                chapterName: chapter.name,
                novelId: novel.id,
                textSegments: queue,
                currentIndex: initialIndex,
              },
            ]);
            setTTSCurrentChapterIndex(0);

            setTimeout(() => {
              webViewRef.current?.injectJavaScript(`
                if(window.tts && window.tts.allReadableElements) {
                  var idx = ${initialIndex};
                  if(idx < tts.allReadableElements.length) {
                    tts.elementsRead = idx;
                    tts.currentElement = tts.allReadableElements[idx];
                    if(tts.currentElement) {
                      tts.currentElement.classList.add('highlight');
                      tts.scrollToElement(tts.currentElement);
                    }
                  }
                }
              `);
            }, 100);
            break;
          }
          case 'hide':
            onPress();
            break;
          case 'next':
            nextChapterScreenVisible.current = true;
            if (event.autoStartTTS) {
              requestChapterNavigation('NEXT');
            } else {
              navigateChapter('NEXT');
            }
            break;
          case 'prev':
            if (event.autoStartTTS) {
              requestChapterNavigation('PREV');
            } else {
              navigateChapter('PREV');
            }
            break;
          case 'save':
            if (event.data && typeof event.data === 'number') {
              saveProgress(event.data);
            }
            break;
          case 'speak':
            if (event.data && typeof event.data === 'string') {
              if (ttsChapterIdRef.current !== chapter.id) {
                break;
              }

              const requestedIndex =
                typeof event.index === 'number'
                  ? event.index
                  : ttsIndexRef.current;

              // El WebView puede emitir el mismo evento dos veces durante una
              // transición. No reiniciamos el párrafo que ya se está leyendo.
              if (
                isSpeakingRef.current &&
                requestedIndex === ttsIndexRef.current
              ) {
                break;
              }

              if (isSpeakingRef.current) {
                speechSessionRef.current += 1;
                isSpeakingRef.current = false;
              }

              ttsIndexRef.current = requestedIndex;
              updateCurrentItemCurrentIndex(requestedIndex);

              if (!isTTSReadingRef.current) {
                isTTSReadingRef.current = true;
                setTTSIsPlaying(true);
                showTTSNotification({
                  novelName: novel?.name || 'Unknown',
                  chapterName: chapter.name,
                  coverUri: novel?.cover || '',
                  isPlaying: true,
                });
              } else {
                updateTTSNotification({
                  novelName: novel?.name || 'Unknown',
                  chapterName: chapter.name,
                  coverUri: novel?.cover || '',
                  isPlaying: true,
                });
              }

              if (typeof event.total === 'number' && event.total > 0) {
                updateTTSProgress(requestedIndex, event.total);
              }

              const sessionId = speechSessionRef.current;
              speakText(event.data, requestedIndex, sessionId);
            } else {
              webViewRef.current?.injectJavaScript('tts.next?.(); true;');
            }
            break;
          case 'pause-speak':
            NativeTTSMediaControl.pausePlayback();
            nativePlaybackPausedRef.current = true;
            isSpeakingRef.current = false;
            break;
          case 'stop-speak':
            speechSessionRef.current += 1;
            NativeTTSMediaControl.stopNativePlayback();
            nativePlaybackStartedRef.current = false;
            nativePlaybackPausedRef.current = false;
            isSpeakingRef.current = false;
            if (!autoStartTTSRef.current) {
              isTTSReadingRef.current = false;
              setTTSIsPlaying(false);
              clearTTSQueue();
              setTTSCurrentChapterIndex(0);
              updateTTSPlaybackState(false);
            }
            break;
          case 'tts-state':
            if (event.data && typeof event.data === 'object') {
              const data = event.data as { isReading?: boolean };
              const isReading = data.isReading === true;
              if (isReading || !autoStartTTSRef.current) {
                isTTSReadingRef.current = isReading;
                updateTTSPlaybackState(isReading);
              }
            }
            break;
        }
      }}
      source={{
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
                --readerSettings-theme: ${readerSettings.theme};
                --readerSettings-padding: ${readerSettings.padding}px;
                --readerSettings-textSize: ${readerSettings.textSize}px;
                --readerSettings-textColor: ${readerSettings.textColor};
                --readerSettings-textAlign: ${readerSettings.textAlign};
                --readerSettings-lineHeight: ${readerSettings.lineHeight};
                --readerSettings-fontFamily: ${readerSettings.fontFamily};
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
                
                @font-face {
                  font-family: ${readerSettings.fontFamily};
                  src: url("file:///android_asset/fonts/${
                    readerSettings.fontFamily
                  }.ttf");
                }
                </style>
 
              <link rel="stylesheet" href="${pluginCustomCSS}">
              <style>${readerSettings.customJS}</style>
            </head>
            <body class="${
              chapterGeneralSettings.pageReader ? 'page-reader' : ''
            }">
              <div class="transition-chapter" style="transform: ${
                nextChapterScreenVisible.current
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
                  nextChapterScreenVisible: nextChapterScreenVisible.current,
                })};
 
                var initialReaderConfig = ${JSON.stringify({
                  readerSettings,
                  chapterGeneralSettings,
                  novel,
                  chapter,
                  nextChapter,
                  prevChapter,
                  batteryLevel,
                  autoSaveInterval: 2222,
                  DEBUG: __DEV__,
                  strings: {
                    finished:
                      getString('readerScreen.finished') +
                      ': ' +
                      chapter.name.trim(),
                    nextChapter: getString('readerScreen.nextChapter', {
                      name: nextChapter?.name,
                    }),
                    noNextChapter: getString('readerScreen.noNextChapter'),
                  },
                })}
              </script>
              <script src="${assetsUriPrefix}/js/polyfill-onscrollend.js"></script>
              <script src="${assetsUriPrefix}/js/icons.js"></script>
              <script src="${assetsUriPrefix}/js/van.js"></script>
              <script src="${assetsUriPrefix}/js/text-vibe.js"></script>
              <script src="${assetsUriPrefix}/js/core.js"></script>
              <script src="${assetsUriPrefix}/js/index.js"></script>
              <script src="${pluginCustomJS}"></script>
              <script>
                ${readerSettings.customJS}
              </script>
              <script>
                ${cleanupScript}
              </script>
          </html>
          `,
      }}
    />
  );
};

export default memo(WebViewReader);
