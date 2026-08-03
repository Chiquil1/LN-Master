import { create } from 'zustand';

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

export const useTTSStore = create<TTSState>((set, get) => ({
  queue: [],
  currentChapterIndex: 0,
  isPlaying: false,
  isLoadingNext: false,
  setQueue: (queue, currentChapterIndex = 0) =>
    set({ queue, currentChapterIndex }),
  addQueueItem: item =>
    set(state => ({ queue: [...state.queue, item] })),
  clearQueue: () => set({ queue: [], currentChapterIndex: 0 }),
  setCurrentChapterIndex: index => set({ currentChapterIndex: index }),
  setIsPlaying: value => set({ isPlaying: value }),
  setIsLoadingNext: value => set({ isLoadingNext: value }),
  updateCurrentItemCurrentIndex: index =>
    set(state => {
      const currentChapterIndex = state.currentChapterIndex;
      if (
        currentChapterIndex < 0 ||
        currentChapterIndex >= state.queue.length ||
        state.queue.length === 0
      ) {
        return {} as Partial<TTSState>;
      }
      const updatedQueue = [...state.queue];
      const currentItem = updatedQueue[currentChapterIndex];
      updatedQueue[currentChapterIndex] = {
        ...currentItem,
        currentIndex: index,
      };
      return { queue: updatedQueue };
    }),
  advanceSegment: () => {
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
      set({ queue: updatedQueue });
      return true;
    }
    return false;
  },
  advanceChapter: () => {
    const state = get();
    const nextChapterIndex = state.currentChapterIndex + 1;
    if (nextChapterIndex < state.queue.length) {
      set({ currentChapterIndex: nextChapterIndex });
      return true;
    }
    return false;
  },
}));
