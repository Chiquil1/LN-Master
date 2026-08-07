import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { MMKVStorage } from '@utils/mmkv/mmkv';

export interface TTSQueueItem {
  chapterId: number;
  chapterName: string;
  novelId: number;
  textSegments: string[];
  currentIndex: number;
}

export interface TTSState {
  queue: TTSQueueItem[];
  currentChapterIndex: number;
  isPlaying: boolean;
  isLoadingNext: boolean;

  setQueue: (queue: TTSQueueItem[], currentChapterIndex?: number) => void;
  addQueueItem: (item: TTSQueueItem) => void;
  clearQueue: () => void;

  setCurrentChapterIndex: (index: number) => void;
  setIsPlaying: (value: boolean) => void;
  setIsLoadingNext: (value: boolean) => void;

  updateCurrentItemCurrentIndex: (index: number) => void;

  advanceSegment: () => boolean;
  advanceChapter: () => boolean;
}

export const useTTSStore = create<TTSState>()(
  persist(
    (set, get) => ({
      queue: [],
      currentChapterIndex: 0,
      isPlaying: false,
      isLoadingNext: false,

      setQueue: (newQueue: TTSQueueItem[], currentChapterIndex = 0): void => {
        const normalizedChapterIndex =
          newQueue.length === 0
            ? 0
            : Math.min(Math.max(currentChapterIndex, 0), newQueue.length - 1);

        set({
          queue: newQueue,
          currentChapterIndex: normalizedChapterIndex,
        });
      },

      addQueueItem: (item: TTSQueueItem): void => {
        set(state => ({
          queue: [...state.queue, item],
        }));
      },

      clearQueue: (): void => {
        set({
          queue: [],
          currentChapterIndex: 0,
          isPlaying: false,
          isLoadingNext: false,
        });
      },

      setCurrentChapterIndex: (index: number): void => {
        const state = get();

        if (state.queue.length === 0) {
          set({ currentChapterIndex: 0 });
          return;
        }

        const normalizedIndex = Math.min(
          Math.max(index, 0),
          state.queue.length - 1,
        );

        set({
          currentChapterIndex: normalizedIndex,
        });
      },

      setIsPlaying: (value: boolean): void => {
        set({
          isPlaying: value,
        });
      },

      setIsLoadingNext: (value: boolean): void => {
        set({
          isLoadingNext: value,
        });
      },

      updateCurrentItemCurrentIndex: (index: number): void => {
        const state = get();
        const currentChapterIndex = state.currentChapterIndex;

        if (
          state.queue.length === 0 ||
          currentChapterIndex < 0 ||
          currentChapterIndex >= state.queue.length
        ) {
          return;
        }

        const currentItem = state.queue[currentChapterIndex];

        if (!currentItem) {
          return;
        }

        const maxIndex = Math.max(currentItem.textSegments.length - 1, 0);

        const normalizedIndex = Math.min(Math.max(index, 0), maxIndex);

        const updatedQueue = [...state.queue];

        updatedQueue[currentChapterIndex] = {
          ...currentItem,
          currentIndex: normalizedIndex,
        };

        set({
          queue: updatedQueue,
        });
      },

      advanceSegment: (): boolean => {
        const state = get();
        const currentChapterIndex = state.currentChapterIndex;
        const item = state.queue[currentChapterIndex];

        if (!item) {
          return false;
        }

        const nextSegmentIndex = item.currentIndex + 1;

        if (nextSegmentIndex >= item.textSegments.length) {
          return false;
        }

        const updatedQueue = [...state.queue];

        updatedQueue[currentChapterIndex] = {
          ...item,
          currentIndex: nextSegmentIndex,
        };

        set({
          queue: updatedQueue,
        });

        return true;
      },

      advanceChapter: (): boolean => {
        const state = get();
        const nextChapterIndex = state.currentChapterIndex + 1;

        if (nextChapterIndex >= state.queue.length) {
          return false;
        }

        set({
          currentChapterIndex: nextChapterIndex,
        });

        return true;
      },
    }),
    {
      name: 'useTTSStore',

      storage: createJSONStorage(() => ({
        getItem: (name: string) => MMKVStorage.getString(name) ?? null,

        setItem: (name: string, value: string) => {
          MMKVStorage.set(name, value);
        },

        removeItem: (name: string) => {
          try {
            const { deleteMMKVKey } = require('@utils/mmkv/mmkv');

            deleteMMKVKey(name);
          } catch {
            (
              MMKVStorage as unknown as {
                delete?: (key: string) => void;
              }
            ).delete?.(name);
          }
        },
      })),

      /*
       * Solo persistimos datos que realmente pueden recuperarse después
       * de que Android cierre o reinicie el proceso.
       *
       * isPlaying NO debe persistirse porque el motor TextToSpeech real
       * desaparece cuando el proceso muere.
       *
       * isLoadingNext tampoco representa un estado recuperable.
       */
      partialize: state => ({
        queue: state.queue,
        currentChapterIndex: state.currentChapterIndex,
      }),

      /*
       * Versiones anteriores de LN-Master podían tener isPlaying=true
       * guardado dentro de MMKV.
       *
       * Aunque ya no lo persistamos, una instalación existente podría
       * hidratar ese valor antiguo. Por eso reconstruimos explícitamente
       * el estado recuperable y forzamos los estados temporales a false.
       */
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<TTSState>;

        const queue = Array.isArray(persisted.queue) ? persisted.queue : [];

        const storedChapterIndex =
          typeof persisted.currentChapterIndex === 'number'
            ? persisted.currentChapterIndex
            : 0;

        const currentChapterIndex =
          queue.length === 0
            ? 0
            : Math.min(Math.max(storedChapterIndex, 0), queue.length - 1);

        return {
          ...currentState,
          queue,
          currentChapterIndex,

          // Nunca restaurar estados físicos/transitorios.
          isPlaying: false,
          isLoadingNext: false,
        };
      },
    },
  ),
);
