import React from 'react';
import { View, StyleSheet, Text } from 'react-native';

const Row = ({
  children,
  style = {},
}: {
  children?: React.ReactNode;
  style?: any;
}) => {
  const onlyText = React.Children.toArray(children).every(
    c => typeof c === 'string' || typeof c === 'number',
  );
  return (
    <View style={[styles.row, style]}>
      {onlyText ? <Text>{children}</Text> : children}
    </View>
  );
};

export { Row };

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
  },
});
