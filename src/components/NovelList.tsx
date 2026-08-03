import { useLibrarySettings } from '@hooks/persisted';
import { DisplayModes } from '@screens/library/constants/constants';
import React, { useMemo } from 'react';
import {
  StyleSheet,
  FlatList,
  FlatListProps,
  ListRenderItem,
} from 'react-native';
import { NovelItem } from '@plugins/types';
import { NovelInfo } from '../database/types';
import { useDeviceOrientation } from '@hooks';

export type NovelListRenderItem = ListRenderItem<NovelInfo | NovelItem>;

type listDataItem =
  | (NovelInfo | NovelItem) & {
      completeRow?: number;
    };

interface NovelListProps extends FlatListProps<NovelInfo | NovelItem> {
  inSource?: boolean;
  data: Array<listDataItem>;
}

const novelListKeyExtractor = (item: NovelInfo | NovelItem, index: number) => {
  const maybeId = (item as any).id;
  const key =
    maybeId != null ? String(maybeId) : (item as any).path ?? String(index);
  return key;
};

const NovelList: React.FC<NovelListProps> = props => {
  const { displayMode = DisplayModes.Comfortable, novelsPerRow = 3 } =
    useLibrarySettings();
  const orientation = useDeviceOrientation();

  const isListView = displayMode === DisplayModes.List;

  const numColumns = useMemo(() => {
    if (isListView) {
      return 1;
    }

    if (orientation === 'landscape') {
      return 6;
    } else {
      return novelsPerRow;
    }
  }, [isListView, orientation, novelsPerRow]);

  const extendedNovelList: Array<listDataItem> = useMemo(() => {
    if (!props.data) return [] as Array<listDataItem>;
    if (!props.inSource || !props.data.length) return props.data;

    const remainder = numColumns - (props.data.length % numColumns);
    const extension: Array<listDataItem> = [];
    if (remainder !== 0 && remainder !== numColumns) {
      for (let i = 0; i < remainder; i++) {
        extension.push({
          cover: '',
          name: '',
          path: 'loading-' + remainder + '-' + i,
          completeRow: 1,
        } as listDataItem);
      }
    }
    extension.push({
      cover: '',
      name: '',
      path: 'loading-' + remainder + '-end',
      completeRow: 2,
    } as listDataItem);

    return [...props.data, ...extension];
  }, [props.data, props.inSource, numColumns]);

  const performanceDefaults = {
    initialNumToRender:
      (props.initialNumToRender as number) ?? (isListView ? 10 : 9),
    windowSize: (props.windowSize as number) ?? 21,
    removeClippedSubviews: (props.removeClippedSubviews as boolean) ?? true,
    maxToRenderPerBatch: (props.maxToRenderPerBatch as number) ?? 10,
    updateCellsBatchingPeriod:
      (props.updateCellsBatchingPeriod as number) ?? 50,
  };

  return (
    <FlatList
      contentContainerStyle={[
        !isListView && styles.listView,
        styles.flatListCont,
      ]}
      numColumns={numColumns}
      key={numColumns}
      keyExtractor={novelListKeyExtractor}
      {...performanceDefaults}
      {...props}
      data={extendedNovelList}
    />
  );
};

export default React.memo(NovelList);

const styles = StyleSheet.create({
  flatListCont: {
    flexGrow: 1,
    paddingBottom: 56,
  },
  listView: {
    paddingHorizontal: 4,
  },
});
