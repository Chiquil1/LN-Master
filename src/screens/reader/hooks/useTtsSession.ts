import { useCallback, useEffect, useRef, useState } from 'react';

import {
  Tts,
  TtsMetadata,
  TtsParagraph,
  TtsPlaybackState,
  TtsProgress,
  TtsSession,
  TtsSettings,
} from '@modules/nitro-tts';

type TtsCommand = 'next' | 'pause' | 'play' | 'previous' | 'replay' | 'stop';

const initialProgress: TtsProgress = {
  index: 0,
  total: 0,
  paragraphId: '',
};

const normalizeQueue = (queue: string[] | TtsParagraph[]) =>
  queue.map((item, index) =>
    typeof item === 'string' ? { id: String(index), text: item } : item,
  );

export const useTtsSession = () => {
  const sessionRef = useRef<TtsSession | null>(null);
  const sessionPromiseRef = useRef<Promise<TtsSession> | null>(null);
  const subscriptionsRef = useRef<{ remove(): void }[]>([]);
  const queueOperationRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const [state, setState] = useState<TtsPlaybackState>('idle');
  const [progress, setProgress] = useState<TtsProgress>(initialProgress);
  const [error, setError] = useState<string | null>(null);

  const ensureSession = useCallback(async () => {
    if (sessionRef.current) {
      return sessionRef.current;
    }
    if (!sessionPromiseRef.current) {
      sessionPromiseRef.current = Tts.createSession()
        .then(session => {
          if (!mountedRef.current) {
            void session.stop();
            return session;
          }
          sessionRef.current = session;
          subscriptionsRef.current = [
            session.addOnStateChangedListener(setState),
            session.addOnProgressChangedListener(setProgress),
            session.addOnErrorListener(setError),
          ];
          return session;
        })
        .catch(cause => {
          sessionPromiseRef.current = null;
          throw cause;
        });
    }
    return sessionPromiseRef.current;
  }, []);

  const run = useCallback(
    async (operation: (session: TtsSession) => Promise<void>) => {
      if (!mountedRef.current) {
        return;
      }
      try {
        setError(null);
        await operation(await ensureSession());
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [ensureSession],
  );

  const enqueueQueueOperation = useCallback(
    (operation: (session: TtsSession) => Promise<void>) => {
      const pending = queueOperationRef.current
        .catch(() => {})
        .then(() => run(operation));
      queueOperationRef.current = pending;
      return pending;
    },
    [run],
  );

  const loadAndPlay = useCallback(
    async (
      queue: string[] | TtsParagraph[],
      startIndex: number,
      metadata: TtsMetadata,
      settings: TtsSettings,
    ) => {
      if (queue.length === 0) {
        setError('No readable paragraphs were found in this chapter.');
        return;
      }
      await enqueueQueueOperation(async session => {
        await session.load(
          normalizeQueue(queue),
          startIndex,
          metadata,
          settings,
        );
        await session.play();
      });
    },
    [enqueueQueueOperation],
  );

  const appendToQueue = useCallback(
    async (
      queue: TtsParagraph[],
      metadata: TtsMetadata,
      settings: TtsSettings,
    ) => {
      if (queue.length === 0) {
        return;
      }
      // A negative initial index is the backwards-compatible native signal for
      // appending. It avoids changing generated Nitro bridge code.
      await enqueueQueueOperation(session =>
        session.load(queue, -1, metadata, settings),
      );
    },
    [enqueueQueueOperation],
  );

  const command = useCallback(
    (nextCommand: TtsCommand) => {
      if (nextCommand === 'stop') {
        // A queued append/load must never be allowed to run after stop and
        // silently resurrect playback. Put stop at the end of the same queue.
        void enqueueQueueOperation(session => session.stop());
        return;
      }

      void run(session => {
        switch (nextCommand) {
          case 'next':
            return session.skipNext();
          case 'pause':
            return session.pause();
          case 'play':
            return session.play();
          case 'previous':
            return session.skipPrevious();
          case 'replay':
            return session.replayCurrent();
        }
      });
    },
    [enqueueQueueOperation, run],
  );

  const seekTo = useCallback(
    (index: number) => {
      void run(session => session.seekTo(index));
    },
    [run],
  );

  const updateSettings = useCallback(
    (settings: TtsSettings) => {
      if (sessionRef.current) {
        void run(session => session.updateSettings(settings));
      }
    },
    [run],
  );

  useEffect(() => {
    void ensureSession().catch(cause => {
      if (mountedRef.current) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    });
    return () => {
      mountedRef.current = false;
      subscriptionsRef.current.forEach(subscription => subscription.remove());
      subscriptionsRef.current = [];
      const session = sessionRef.current;
      if (session) {
        // An operation that already crossed the mounted guard can still be in
        // flight. Stop only after it settles so unmount remains the last word.
        void queueOperationRef.current
          .catch(() => {})
          .then(() => session.stop());
      }
      sessionRef.current = null;
    };
  }, [ensureSession]);

  return {
    appendToQueue,
    command,
    error,
    loadAndPlay,
    progress,
    seekTo,
    state,
    updateSettings,
  };
};
