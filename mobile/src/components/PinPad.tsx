// ============================================================
// MySargal Caisse - Pave numerique pour code PIN
// ============================================================

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radius, fonts } from '../theme';
import { useTheme } from '../theme/ThemeProvider';
import { tapLight } from '../utils/haptics';
import { Icon } from './Icon';

interface Props {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  error?: boolean;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

export function PinPad({ value, onChange, length = 4, error }: Props) {
  const t = useTheme();
  const press = (k: string) => {
    tapLight();
    if (k === 'del') {
      onChange(value.slice(0, -1));
      return;
    }
    if (k === '') return;
    if (value.length >= length) return;
    onChange(value + k);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.dots}>
        {Array.from({ length }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { borderColor: t.accentBorder },
              i < value.length && { backgroundColor: t.accent, borderColor: t.accent },
              error && styles.dotError,
            ]}
          />
        ))}
      </View>
      <View style={styles.grid}>
        {KEYS.map((k, idx) => (
          <Pressable
            key={idx}
            onPress={() => press(k)}
            disabled={k === ''}
            style={({ pressed }) => [
              styles.key,
              k === '' && styles.keyEmpty,
              pressed && k !== '' && styles.keyPressed,
            ]}
          >
            {k === 'del' ? (
              <Icon name="delete" size={26} color={colors.tx} />
            ) : (
              <Text style={styles.keyTxt}>{k}</Text>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 28 },
  dots: { flexDirection: 'row', gap: 16 },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.b3,
    backgroundColor: 'transparent',
  },
  dotFilled: { backgroundColor: colors.tx, borderColor: colors.tx },
  dotError: { borderColor: colors.red },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 264,
    justifyContent: 'space-between',
    rowGap: 16,
  },
  key: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.s2,
    borderWidth: 1,
    borderColor: colors.b1,
  },
  keyEmpty: { backgroundColor: 'transparent', borderColor: 'transparent' },
  keyPressed: { backgroundColor: colors.s4 },
  keyTxt: { fontFamily: fonts.heading, fontSize: 26, color: colors.tx },
});
