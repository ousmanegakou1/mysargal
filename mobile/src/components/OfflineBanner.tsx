// ============================================================
// MySargal Caisse - Bandeau hors ligne / operations en attente
// ============================================================

import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { colors, radius, fonts } from '../theme';
import { useNetwork } from '../offline/NetworkProvider';

export function OfflineBanner() {
  const { online, pendingCount, syncing, syncNow } = useNetwork();

  if (online && pendingCount === 0) return null;

  if (!online) {
    return (
      <View style={[styles.wrap, styles.offline]}>
        <View style={styles.dotRed} />
        <Text style={styles.txt}>
          Hors ligne{pendingCount > 0 ? ` - ${pendingCount} operation${pendingCount > 1 ? 's' : ''} en attente` : ''}
        </Text>
      </View>
    );
  }

  // En ligne avec file en attente : proposer la synchro.
  return (
    <Pressable onPress={syncNow} style={[styles.wrap, styles.pending]}>
      {syncing ? (
        <ActivityIndicator size="small" color={colors.gold} />
      ) : (
        <View style={styles.dotGold} />
      )}
      <Text style={styles.txt}>
        {syncing
          ? 'Synchronisation en cours...'
          : `${pendingCount} operation${pendingCount > 1 ? 's' : ''} a synchroniser - toucher pour reessayer`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  offline: { backgroundColor: colors.redSoft, borderColor: 'rgba(239,68,68,0.35)' },
  pending: { backgroundColor: colors.goldSoft, borderColor: 'rgba(245,200,66,0.35)' },
  dotRed: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red },
  dotGold: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold },
  txt: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 12.5, color: colors.tx },
});
