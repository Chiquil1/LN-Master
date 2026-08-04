import { TurboModule, TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  showMediaNotification(
    title: string,
    subtitle: string,
    coverUri: string,
    isPlaying: boolean,
  ): void;

  updatePlaybackState(isPlaying: boolean): void;

  updateProgress(current: number, total: number): void;

  startPlayback(
    textSegmentsJson: string,
    startIndex: number,
    voiceIdentifier: string,
    language: string,
    rate: number,
    pitch: number,
  ): void;

  pausePlayback(): void;

  resumePlayback(): void;

  speakTest(text: string): void;

  stopNativePlayback(): void;

  dismiss(): void;

  addListener: (eventName: string) => void;

  removeListeners: (count: number) => void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeTTSMediaControl');
