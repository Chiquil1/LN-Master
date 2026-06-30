import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  NativeEventEmitter,
  NativeModules,
  StatusBar,
} from 'react-native';
import WebView from 'react-native-webview';
import color from 'color';

// Import seguro de BackgroundService
let BackgroundService: any = null;
try {
  BackgroundService = require('react-native-background-actions').default;
} catch (e) {
  console.warn('BackgroundService not available:', e);
}

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
import * as Speech from 'expo-speech';
import { PLUGIN_STORAGE } from '@utils/Storages';
import { useChapterContext } from '../ChapterContext';
import {
  showTTSNotification,
  updateTTSNotification,
  updateTTSPlaybackState,
  updateTTSProgress,
  dismissTTSNotification,
  ttsMediaEmitter,
} from '@utils/ttsNotification';

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
  const ttsQueueRef = useRef<string[]>([]);
  const ttsQueueIndexRef = useRef<number>(0);
  const isSpeakingRef = useRef<boolean>(false);

  const veryIntensiveTask = async () => {
    await new Promise(() => {});
  };

  const backgroundOptions = {
    taskName: 'LNReader TTS',
    taskTitle: 'LN Reader - Reproduciendo',
    taskDesc: 'Leyendo en voz alta',
    taskIcon: {
      name: 'ic_launcher',
      type: 'mipmap',
    },
    color: '#ff00ff',
    linkingURI: 'lnreader://',
    parameters: {},
  };

  useEffect(() => {
    readerSettingsRef.current = readerSettings;
  }, [readerSettings]);

  useEffect(() => {
    const playListener = ttsMediaEmitter.addListener('TTSPlay', () => {
      webViewRef.current?.injectJavaScript(`
        if (window.tts && !tts.reading) { tts.resume(); }
      `);
    });
    const pauseListener = ttsMediaEmitter.addListener('TTSPause', () => {
      webViewRef.current?.injectJavaScript(`
        if (window.tts && tts.reading) { tts.pause(); }
      `);
    });
    const stopListener = ttsMediaEmitter.addListener('TTSStop', () => {
      webViewRef.current?.injectJavaScript(`
        if (window.tts) { tts.stop(); }
      `);
    });
    const rewindListener = ttsMediaEmitter.addListener('TTSRewind', () => {
      webViewRef.current?.injectJavaScript(`
        if (window.tts && tts.started) { tts.rewind(); }
      `);
    });
    const prevListener = ttsMediaEmitter.addListener('TTSPrev', () => {
      webViewRef.current?.injectJavaScript(`
        if (window.tts && window.reader && window.reader.prevChapter) {
          window.reader.post({ type: 'prev', autoStartTTS: true });
        }
      `);
    });
    const nextListener = ttsMediaEmitter.addListener('TTSNext', () => {
      webViewRef.current?.injectJavaScript(`
        if (window.tts && window.reader && window.reader.nextChapter) {
          window.reader.post({ type: 'next', autoStartTTS: true });
        }
      `);
    });
    const seekToListener = ttsMediaEmitter.addListener(
      'TTSSeekTo',
      (event: { position: number }) => {
        const position = event.position;
        webViewRef.current?.injectJavaScript(`
          if (window.tts && tts.started) { tts.seekTo(${position}); }
        `);
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
    };
  }, [webViewRef]);

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
      dismissTTSNotification();
      if (BackgroundService) {
        BackgroundService.stop().catch(() => {});
      }
      Speech.stop();
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

          Speech.stop();
          isSpeakingRef.current = false;

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
      if (nextState === 'active' && isTTSReadingRef.current) {
        const index = ttsQueueIndexRef.current;
        webViewRef.current?.injectJavaScript(`
          if (window.tts && window.tts.allReadableElements) {
            const idx = ${index};
            if (idx < tts.allReadableElements.length) {
              tts.elementsRead = idx;
              tts.currentElement = tts.allReadableElements[idx];
              tts.prevElement = null;
              tts.started = true;
              tts.reading = true;
              tts.scrollToElement(tts.currentElement);
              tts.currentElement.classList.add('highlight');
            }
          }
        `);
      }
    });

    return () => subscription.remove();
  }, [webViewRef]);

  // Función para limpiar texto antes de enviarlo al TTS
  const cleanTextForTTS = (text: string): string => {
    if (!text) return '';
    let cleaned = text;

    // 1. Limpieza de Kaomojis y Emociones
    const kaomojiEmotions: { [key: string]: string } = {
      '(◕ᴗ◕)': 'feliz', '(◕‿◕)': 'feliz', '(◠‿◠)': 'feliz', '(✿◠‿◠)': 'feliz',
      '(◕‿◕✿)': 'feliz', '(≧◡≦)': 'feliz', '(^◡^)': 'feliz', '(｡◕‿◕｡)': 'feliz',
      '(´・ω・`)': 'triste', '(╥﹏╥)': 'llorando', '(;´༎ຶ༎ຶ`)': 'llorando',
      '(T_T)': 'llorando', '(ToT)': 'llorando', '(；ω；)': 'llorando', '(ノ_<。)': 'llorando',
      '(╯°□°)╯︵ ┻━┻': 'enojado volcando mesa', '(╬ಠ益ಠ)': 'muy enojado',
      '(ಠ_ಠ)': 'desaprobación', '(¬_¬)': 'desaprobación', '(ー_ー)': 'molesto',
      '(￣へ￣)': 'enojado', '(｀Д´)': 'enojado',
      '(⊙_⊙)': 'sorprendido', '(°ロ°)': 'sorprendido', '(O_O)': 'sorprendido',
      '(O_O;)': 'sorprendido', '(⊙_⊙;)': 'sorprendido', '(°□°)': 'sorprendido',
      '(*/ω＼*)': 'avergonzado', '(*/▽＼*)': 'avergonzado', '(⁄ ⁄•⁄ω⁄•⁄ ⁄)': 'avergonzado',
      '(〃▽〃)': 'avergonzado',
      '(♥ω♥)': 'enamorado', '(♡ω♡)': 'enamorado', '(´,,•ω•,,)♡': 'cariñoso', '(∗•ω•∗)': 'cariñoso',
      '(・_・?)': 'confundido', '(?_?)': 'confundido',
      '¯\\_(ツ)_/¯': 'indiferente',
      '(ᕙᕗ)': 'fuerte', '(ง •̀_•́)ง': 'determinado',
      '(ʕ•ᴥ•ʔ)': 'oso cute', '(=^･ω･^=)': 'gatito',
      '(￣o￣) zzZ': 'dormido', '(～o～) zzZ': 'dormido',
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
      .replace(/[─━│┃┄┅┆┇┈┉┊┋┌┍┎┏┐┑┒┓└┕┖┗┘┙┚┛├┝┞┟┠┡┢┣┤┥┦┧┨┩┪┫┬┭┮┯┰┱┲┳┴┵┶┷┸┹┺┻┼┽┾┿╀╁╂╃╄╅╆╇╈╉╊╋]+/g, '')
      .replace(/[◆◇◈◉◊○◌◍◎●◐◑◒◓◔◕◖◗◘◙◚◛]+/g, '')
      .replace(/[♠♣♥♦♩♪♫♬♭♮♯]+/g, '')
      .replace(/[→←↑↓↔↕↖↗↘↙]+/g, '')
      .replace(/[✔✓✗✘✚✛✜✝✞✟✠✡✢✣✤✥✦]+/g, '')
      .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
      .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
      .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
      .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '');

    // 5. Limpieza de caracteres de control invisibles
    cleaned = cleaned
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/[\u2028\u2029]/g, ' ');

    // 6. Reemplazo de abreviaturas comunes
    // CORRECCIÓN CRÍTICA: Se eliminó 'EN': 'Inglés' para evitar que diga esa palabra.
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
      // 'EN' se deja intacto o se puede poner '' si quieres borrarlo, pero NO convertirlo a 'Inglés'
    };
    
    Object.entries(customReplacements).forEach(([key, value]) => {
      const regex = new RegExp(`\\b${key}\\b`, 'gi');
      cleaned = cleaned.replace(regex, value);
    });

    // 7. Normalización final de espacios y puntuación
    cleaned = cleaned
      .replace(/\s+/g, ' ') // Múltiples espacios a uno
      .replace(/\s+([.,!?;:])/g, '$1') // Espacio antes de puntuación
      .replace(/([.,!?;:])\s*([.,!?;:])/g, '$1') // Puntuación duplicada
      .replace(/^\s+|\s+$/g, '') // Trim inicial/final
      .trim();

    if (cleaned.length < 2) return '';
    return cleaned;
  };

  const speakText = (text: string) => {
    // Prevención de superposición
    if (isSpeakingRef.current) {
      Speech.stop();
    }
    isSpeakingRef.current = true;

    let processedText = cleanTextForTTS(text);

    // Limpieza agresiva final específica para caracteres de escape
    processedText = processedText
      .replace(/\\/g, '')
      .replace(/""/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/[`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!processedText || processedText.length < 2) {
      const handleEmptyText = () => {
        isSpeakingRef.current = false;
        const isBackground = appStateRef.current === 'background' || appStateRef.current === 'inactive';
        if (ttsQueueRef.current.length > 0 && ttsQueueIndexRef.current + 1 < ttsQueueRef.current.length) {
          const nextIndex = ttsQueueIndexRef.current + 1;
          const nextText = ttsQueueRef.current[nextIndex];
          if (nextText) {
            ttsQueueIndexRef.current = nextIndex;
            webViewRef.current?.injectJavaScript(`
              if(window.tts) {
                tts.elementsRead = ${nextIndex};
                if(tts.allReadableElements[${nextIndex}]) {
                  tts.currentElement = tts.allReadableElements[${nextIndex}];
                  tts.scrollToElement(tts.currentElement);
                  tts.currentElement.classList.add('highlight');
                }
              }
            `);
            speakText(nextText);
            return;
          }
        }
        if (ttsQueueRef.current.length > 0 && nextChapter) {
          autoStartTTSRef.current = true;
          navigateChapter('NEXT');
          return;
        }
        if (isBackground) {
          isTTSReadingRef.current = false;
          if (BackgroundService) BackgroundService.stop().catch(() => {});
          dismissTTSNotification();
          webViewRef.current?.injectJavaScript('tts.stop?.()');
          return;
        }
        webViewRef.current?.injectJavaScript('tts.next?.()');
      };
      setTimeout(handleEmptyText, 50);
      return;
    }

    const selectedVoice = readerSettingsRef.current.tts?.voice;

    // SOLUCIÓN RADICAL: NO PASAR 'language' NUNCA.
    // Al omitir esta propiedad, Android usa la configuración regional del dispositivo
    // y la voz seleccionada sin intentar cambiar de paquete ni anunciar idiomas.
    Speech.speak(processedText, {
      onDone() {
        isSpeakingRef.current = false;
        const isBackground = appStateRef.current === 'background' || appStateRef.current === 'inactive';
        const currentIndex = ttsQueueIndexRef.current;

        if (ttsQueueRef.current.length > 0 && currentIndex + 1 < ttsQueueRef.current.length) {
          const nextIndex = currentIndex + 1;
          const nextText = ttsQueueRef.current[nextIndex];

          if (nextText) {
            ttsQueueIndexRef.current = nextIndex;
            
            webViewRef.current?.injectJavaScript(`
              (function() {
                if(window.tts && window.tts.allReadableElements) {
                  var idx = ${nextIndex};
                  if(idx < tts.allReadableElements.length) {
                    if(tts.currentElement) tts.currentElement.classList.remove('highlight');
                    tts.elementsRead = idx;
                    tts.currentElement = tts.allReadableElements[idx];
                    if(tts.currentElement) {
                      tts.currentElement.classList.add('highlight');
                      tts.scrollToElement(tts.currentElement);
                    }
                  }
                }
              })();
              true;
            `);
            
            speakText(nextText);
            return;
          }
        }

        if (ttsQueueRef.current.length > 0 && nextChapter) {
          autoStartTTSRef.current = true;
          navigateChapter('NEXT');
          return;
        }
        if (isBackground) {
          isTTSReadingRef.current = false;
          if (BackgroundService) BackgroundService.stop().catch(() => {});
          dismissTTSNotification();
          webViewRef.current?.injectJavaScript('tts.stop?.()');
          return;
        }
        webViewRef.current?.injectJavaScript('tts.next?.()');
      },
      onError(e) {
        console.warn('TTS Error:', e);
        isSpeakingRef.current = false;
        
        const currentIndex = ttsQueueIndexRef.current;
        if (ttsQueueRef.current.length > 0 && currentIndex + 1 < ttsQueueRef.current.length) {
           const nextIndex = currentIndex + 1;
           const nextText = ttsQueueRef.current[nextIndex];
           if(nextText) {
             ttsQueueIndexRef.current = nextIndex;
             speakText(nextText);
             return;
           }
        }
        webViewRef.current?.injectJavaScript('tts.next?.()');
      },
      voice: selectedVoice?.identifier,
      pitch: readerSettingsRef.current.tts?.pitch || 1,
      rate: readerSettingsRef.current.tts?.rate || 1,
      // language: ELIMINADO INTENCIONALMENTE para evitar anuncios de idioma.
    });
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
          }`,
        );
        
        webViewRef.current?.injectJavaScript(cleanupScript);

        if (autoStartTTSRef.current) {
          autoStartTTSRef.current = false;
          setTimeout(() => {
            webViewRef.current?.injectJavaScript(`
              (function() {
                if (window.tts && reader.generalSettings.val.TTSEnable) {
                  setTimeout(() => {
                    tts.start();
                    const controller = document.getElementById('TTS-Controller');
                    if (controller && controller.firstElementChild) {
                      controller.firstElementChild.innerHTML = pauseIcon;
                    }
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
              ? payload?.queue.filter(
                  (item): item is string =>
                    typeof item === 'string' && item.trim().length > 0,
                )
              : [];
            ttsQueueRef.current = queue;
            if (typeof payload?.startIndex === 'number') {
              ttsQueueIndexRef.current = payload.startIndex;
              
              setTimeout(() => {
                 webViewRef.current?.injectJavaScript(`
                  if(window.tts && window.tts.allReadableElements) {
                    var idx = ${payload.startIndex};
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
            } else {
              ttsQueueIndexRef.current = 0;
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
          case 'speak':
            if (event.data && typeof event.data === 'string') {
              if (typeof event.index === 'number') {
                ttsQueueIndexRef.current = event.index;
              }
              if (!isTTSReadingRef.current) {
                isTTSReadingRef.current = true;
                if (BackgroundService) {
                  BackgroundService.start(veryIntensiveTask, backgroundOptions).catch(() => {});
                }
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
              if (
                typeof event.index === 'number' &&
                typeof event.total === 'number' &&
                event.total > 0
              ) {
                updateTTSProgress(event.index, event.total);
              }
              speakText(event.data);
            } else {
              webViewRef.current?.injectJavaScript('tts.next?.()');
            }
            break;
          case 'pause-speak':
            Speech.stop();
            isSpeakingRef.current = false;
            break;
          case 'stop-speak':
            Speech.stop();
            isSpeakingRef.current = false;
            if (BackgroundService) {
              BackgroundService.stop().catch(() => {});
            }
            if (!autoStartTTSRef.current) {
              isTTSReadingRef.current = false;
              ttsQueueRef.current = [];
              ttsQueueIndexRef.current = 0;
              dismissTTSNotification();
            }
            break;
          case 'tts-state':
            if (event.data && typeof event.data === 'object') {
              const data = event.data as { isReading?: boolean };
              const isReading = data.isReading === true;
              isTTSReadingRef.current = isReading;
              updateTTSPlaybackState(isReading);
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
                  src: url("file:///android_asset/fonts/${readerSettings.fontFamily
          }.ttf");
                }
                </style>
 
              <link rel="stylesheet" href="${pluginCustomCSS}">
              <style>${readerSettings.customJS}</style>
            </head>
            <body class="${chapterGeneralSettings.pageReader ? 'page-reader' : ''
          }">
              <div class="transition-chapter" style="transform: ${nextChapterScreenVisible.current
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
              finished: getString('readerScreen.finished') + ': ' + chapter.name.trim(),
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