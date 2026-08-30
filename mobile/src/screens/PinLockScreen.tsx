// ============================================================
// MySargal Caisse - Verrou PIN
// Rouverture rapide de l'app entre vendeurs. Le PIN est verifie contre le
// hash stocke en zone securisee. Repli : deconnexion (retour OTP).
// ============================================================

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../components/Screen';
import { PinPad } from '../components/PinPad';
import { Icon } from '../components/Icon';
import { colors, fonts, spacing } from '../theme';
import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../auth/AuthContext';
import { verifyPin } from '../auth/pin';
import { notifyError } from '../utils/haptics';
import { firstName } from '../utils/format';

export function PinLockScreen() {
  const { unlock, logout, merchant } = useAuth();
  const theme = useTheme();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (pin.length === 4) {
      (async () => {
        const ok = await verifyPin(pin);
        if (ok) {
          unlock();
        } else {
          setError(true);
          notifyError();
          setTimeout(() => {
            setPin('');
            setError(false);
          }, 600);
        }
      })();
    }
  }, [pin, unlock]);

  return (
    <Screen padded contentStyle={styles.content}>
      <View style={styles.header}>
        <LinearGradient
          colors={[theme.accentDark, theme.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.orb}
        >
          <View style={styles.orbInner}>
            <Icon name="lock" size={30} color={theme.accentDark} />
          </View>
        </LinearGradient>
        <Text style={styles.title}>{merchant?.name || 'MySargal'}</Text>
        <Text style={styles.subtitle}>
          Entre ton code pour ouvrir la caisse{merchant?.name ? `, ${firstName(merchant.name)}` : ''}.
        </Text>
      </View>

      <PinPad value={pin} onChange={setPin} error={error} />

      <Pressable onPress={logout} style={styles.logout}>
        <Text style={styles.logoutTxt}>Utiliser un autre numero</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xxxl },
  header: { alignItems: 'center', gap: 12 },
  orb: { width: 72, height: 72, borderRadius: 36, padding: 3, alignItems: 'center', justifyContent: 'center' },
  orbInner: {
    flex: 1,
    width: '100%',
    borderRadius: 33,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbTxt: { fontSize: 28 },
  title: { fontFamily: fonts.heading, fontSize: 22, color: colors.tx },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.tx2, textAlign: 'center', paddingHorizontal: 30 },
  logout: { paddingVertical: 12 },
  logoutTxt: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.tx3 },
});
