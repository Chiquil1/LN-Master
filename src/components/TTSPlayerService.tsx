import React, { useEffect } from 'react';
import { useTTSStore } from '@hooks/useTTSStore';
import { updateTTSPlaybackState } from '@utils/ttsNotification';

const TTSPlayerService: React.FC = () => {
  const { isPlaying } = useTTSStore();

  useEffect(() => {
    // El servicio nativo ya es un foreground service y es el único que debe
    // publicar la notificación de lectura. Aquí sólo sincronizamos su estado
    // con el store que usa el mini reproductor.
    updateTTSPlaybackState(isPlaying);
  }, [isPlaying]);

  return null;
};

export default React.memo(TTSPlayerService);
