import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@hooks/persisted';
import { useTTSStore } from '@hooks/useTTSStore';
import {
  pauseAudio,
  resumeAudio,
  stopAudio,
  pauseTTSWebView,
  resumeTTSWebView,
  stopTTSWebView,
  nextTTSWebView,
  prevTTSWebView,
} from '@utils/ttsService';
import { updateTTSPlaybackState } from '@utils/ttsNotification';
import { navigate } from '@navigators/RootNavigation';
import IconButton from './IconButtonV2/IconButtonV2';

const TTSMiniPlayer: React.FC = () => {
  const theme = useTheme();
  const { queue, currentChapterIndex, isPlaying, setIsPlaying, clearQueue } =
    useTTSStore();

  const currentItem = queue[currentChapterIndex];
  const isVisible = queue.length > 0;

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      pauseAudio();
      pauseTTSWebView();
      setIsPlaying(false);
      updateTTSPlaybackState(false);
    } else {
      resumeAudio();
      resumeTTSWebView();
      setIsPlaying(true);
      updateTTSPlaybackState(true);
    }
  }, [isPlaying, setIsPlaying]);

  const handleStop = useCallback(() => {
    stopAudio();
    stopTTSWebView();
    setIsPlaying(false);
    clearQueue();
    updateTTSPlaybackState(false);
  }, [clearQueue, setIsPlaying]);

  const handleOpenReader = useCallback(() => {
    if (!currentItem) {
      return;
    }

    navigate('ReaderStack', {
      screen: 'Chapter',
      params: {
        novel: {
          id: currentItem.novelId,
          name: currentItem.chapterName,
          path: '',
          pluginId: '',
          cover: '',
          isLocal: false,
        },
        chapter: {
          id: currentItem.chapterId,
          novelId: currentItem.novelId,
          name: currentItem.chapterName,
          path: '',
          isDownloaded: false,
          bookmark: false,
          position: 0,
          unread: false,
          sourceId: 0,
          readTime: null,
          updatedTime: null,
        },
      },
    });
  }, [currentItem]);

  if (!isVisible || !currentItem) {
    return null;
  }

  return (
    <Pressable
      onPress={handleOpenReader}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: pressed ? theme.surfaceVariant : theme.surface },
      ]}
    >
      <View style={styles.meta}>
        <Text
          style={[styles.title, { color: theme.onSurface }]}
          numberOfLines={1}
        >
          {currentItem.chapterName || 'TTS'}
        </Text>
        <Text
          style={[styles.subtitle, { color: theme.onSurfaceVariant }]}
          numberOfLines={1}
        >
          {`Chapter ${currentChapterIndex + 1} of ${queue.length}`}
        </Text>
      </View>
      <View style={styles.controls}>
        <IconButton
          name="skip-previous"
          onPress={prevTTSWebView}
          theme={theme}
        />
        <IconButton
          name={isPlaying ? 'pause' : 'play'}
          onPress={handleTogglePlay}
          theme={theme}
        />
        <IconButton name="skip-next" onPress={nextTTSWebView} theme={theme} />
        <IconButton name="stop" onPress={handleStop} theme={theme} />
      </View>
    </Pressable>
  );
};

export default React.memo(TTSMiniPlayer);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 72,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    zIndex: 999,
    elevation: 12,
  },
  meta: {
    flex: 1,
    paddingRight: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
