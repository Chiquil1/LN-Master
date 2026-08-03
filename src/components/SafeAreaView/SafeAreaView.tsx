import React, { memo } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface SafeAreaViewProps {
  children: React.ReactNode;
  excludeTop?: boolean;
  excludeBottom?: boolean;
  style?: StyleProp<ViewStyle>;
}

const SafeAreaView: React.FC<SafeAreaViewProps> = ({
  children,
  style,
  excludeTop,
  excludeBottom,
}) => {
  const { bottom, top, right, left } = useSafeAreaInsets();
  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
    padding: {
      paddingBottom: excludeBottom ? 0 : bottom,
      paddingStart: left,
      paddingEnd: right,
      paddingTop: excludeTop ? 0 : top,
    },
  });
  const onlyText = React.Children.toArray(children).every(
    c => typeof c === 'string' || typeof c === 'number',
  );

  return (
    <View style={[styles.container, styles.padding, style]}>
      {onlyText ? <Text>{children}</Text> : children}
    </View>
  );
};

export default memo(SafeAreaView);
