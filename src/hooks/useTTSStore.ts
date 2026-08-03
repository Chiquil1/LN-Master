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
        void set({ queue: newQueue, currentChapterIndex });
        return;
      },
      addQueueItem: (item: TTSQueueItem): void => {
        void set(state => ({ queue: [...state.queue, item] }));
        return;
      },
      clearQueue: (): void => { void set({ queue: [], currentChapterIndex: 0 }); },
      setCurrentChapterIndex: (index: number): void => { void set({ currentChapterIndex: index }); },
      setIsPlaying: (value: boolean): void => { void set({ isPlaying: value }); },
      setIsLoadingNext: (value: boolean): void => { void set({ isLoadingNext: value }); },
      updateCurrentItemCurrentIndex: (index: number): void => {
        const state = get();
        const currentChapterIndex = state.currentChapterIndex;
        if (
          currentChapterIndex < 0 ||
          currentChapterIndex >= state.queue.length ||
          state.queue.length === 0
        ) {
          // invalid index, no-op
          return;
        }
        const updatedQueue = [...state.queue];
        const currentItem = updatedQueue[currentChapterIndex];
        updatedQueue[currentChapterIndex] = {
          ...currentItem,
          currentIndex: index,
        };
        void set({ queue: updatedQueue });
        return;
      },
      advanceSegment: (): boolean => {
        const state = get();
        const currentChapterIndex = state.currentChapterIndex;
        const item = state.queue[currentChapterIndex];
        if (!item) {
          return false;
        }
        if (item.currentIndex + 1 < item.textSegments.length) {
          const updatedQueue = [...state.queue];
          updatedQueue[currentChapterIndex] = {
            ...item,
            currentIndex: item.currentIndex + 1,
          };
          void set({ queue: updatedQueue });
          return true;
        }
        return false;
      },
      advanceChapter: (): boolean => {
        const state = get();
        const nextChapterIndex = state.currentChapterIndex + 1;
        if (nextChapterIndex < state.queue.length) {
          void set({ currentChapterIndex: nextChapterIndex });
          return true;
        }
        return false;
      },
    }),
    {
      name: 'useTTSStore',
      storage: createJSONStorage(() => ({
        getItem: (name: string) => MMKVStorage.getString(name) ?? null,
        setItem: (name: string, value: string) => MMKVStorage.set(name, value),
        removeItem: (name: string) => (MMKVStorage as any).delete(name),
      })),
      partialize: state => ({
        queue: state.queue,
        currentChapterIndex: state.currentChapterIndex,
        isPlaying: state.isPlaying,
      }),
    },
  ),
);
