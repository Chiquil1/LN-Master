import * as React from 'react';
import * as Speech from 'expo-speech';

export type TTSWebViewRef = React.RefObject<{
  injectJavaScript?: (script: string) => void;
} | null>;

let currentWebViewRef: TTSWebViewRef | null = null;

const injectToWebView = (script: string): boolean => {
  if (currentWebViewRef?.current?.injectJavaScript) {
    currentWebViewRef.current.injectJavaScript(script);
    return true;
  }
  return false;
};

export const registerTTSWebView = (ref: TTSWebViewRef) => {
  currentWebViewRef = ref;
};

export const unregisterTTSWebView = () => {
  currentWebViewRef = null;
};

export const pauseTTSWebView = () =>
  injectToWebView(`if (window.tts && tts.reading) { tts.pause(); }`);

export const resumeTTSWebView = () =>
  injectToWebView(`if (window.tts && !tts.reading) { tts.resume(); }`);

export const stopTTSWebView = () =>
  injectToWebView(`if (window.tts) { tts.stop(); }`);

export const nextTTSWebView = () =>
  injectToWebView(`if (window.tts) { tts.next?.(); }`);

export const prevTTSWebView = () =>
  injectToWebView(`if (window.tts && window.reader && window.reader.prevChapter) { window.reader.post({ type: 'prev', autoStartTTS: true }); }`);

export const rewindTTSWebView = () =>
  injectToWebView(`if (window.tts && tts.started) { tts.rewind(); }`);

export const seekTTSWebView = (position: number) =>
  injectToWebView(`if (window.tts && tts.started) { tts.seekTo(${position}); }`);

export const pauseAudio = () => {
  if (typeof Speech.pause === 'function') {
    Speech.pause();
  }
};

export const resumeAudio = () => {
  if (typeof Speech.resume === 'function') {
    Speech.resume();
  }
};

export const stopAudio = () => Speech.stop();
