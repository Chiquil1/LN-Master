import React, { useEffect } from 'react';
import BackgroundService from 'react-native-background-actions';
import { useTTSStore } from '@hooks/useTTSStore';
import { updateTTSPlaybackState } from '@utils/ttsNotification';

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

const TTSPlayerService: React.FC = () => {
  const { isPlaying } = useTTSStore();

  useEffect(() => {
    if (isPlaying) {
      BackgroundService.start(veryIntensiveTask, backgroundOptions).catch(
        () => {},
      );
      updateTTSPlaybackState(true);
    } else {
      if (BackgroundService.isRunning()) {
        BackgroundService.stop().catch(() => {});
      }
      updateTTSPlaybackState(false);
    }
  }, [isPlaying]);

  return null;
};

export default React.memo(TTSPlayerService);
