// ============================================================
// MySargal Caisse - Controle segmente (onglets internes)
// ============================================================

import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { colors, radius, fonts } from '../theme';
import { useTheme } from '../theme/ThemeProvider';
import { tapLight } from '../utils/haptics';

export interface SegItem {
  key: string;
  label: string;
}

interface Props {
  items: SegItem[];
  value: string;
  onChange: (key: string) => void;
  scroll?: boolean;
}

export function Segmented({ items, value, onChange, scroll }: Props) {
  const t = useTheme();
  const inner = (
    <View style={[styles.wrap, scroll && styles.wrapScroll]}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Pressable
            key={it.key}
            style={[
              styles.seg,
              on && { backgroundColor: t.accentSoftBg, borderWidth: 1, borderColor: t.accentBorder },
              scroll && styles.segScroll,
            ]}
            onPress={() => {
              tapLight();
              onChange(it.key);
            }}
          >
            <Text style={[styles.txt, on && { color: t.accentDark }]} numberOfLines={1}>
              {it.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
  if (scroll) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {inner}
      </ScrollView>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  scrollContent: { paddingRight: 8 },
  wrap: { flexDirection: 'row', backgroundColor: colors.s2, borderRadius: radius.md, padding: 4, gap: 4 },
  wrapScroll: { alignSelf: 'flex-start' },
  seg: { flex: 1, paddingVertical: 10, paddingHorizontal: 10, alignItems: 'center', borderRadius: radius.sm },
  segScroll: { flex: 0, paddingHorizontal: 16 },
  txt: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.tx3 },
});
