// ============================================================
// MySargal Caisse - Scan QR camera
// Detection rapide avec vibration (expo-haptics). Extrait le code, charge la
// fiche client (get-points) et navigue. Gere aussi les cartes cadeaux (GC-).
// Fonctionne hors ligne via le cache des derniers clients scannes.
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, Animated } from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult, scanFromURLAsync } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Field } from '../components/Field';
import { useToast } from '../components/Toast';
import { colors, fonts, radius, spacing } from '../theme';
import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../auth/AuthContext';
import { useAppStore } from '../store/appStore';
import { useNetwork } from '../offline/NetworkProvider';
import { getPoints, findGiftCardByCode } from '../api/endpoints';
import { extractCode } from '../utils/format';
import { fmtAmount } from '../utils/currency';
import { ApiError } from '../api/types';
import { notifySuccess, notifyError, tapHeavy } from '../utils/haptics';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Scan'>;

export function ScanScreen() {
  const navigation = useNavigation<Nav>();
  const { merchant } = useAuth();
  const { toast } = useToast();
  const { online } = useNetwork();
  const cacheClient = useAppStore((s) => s.cacheClient);
  const getCachedClient = useAppStore((s) => s.getCachedClient);
  const theme = useTheme();

  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const lastScan = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  // Flash visuel de retour (vert = ok, rouge = refus).
  const flashAnim = useRef(new Animated.Value(0)).current;
  const [flashKind, setFlashKind] = useState<'ok' | 'no'>('ok');
  const flash = useCallback(
    (kind: 'ok' | 'no') => {
      setFlashKind(kind);
      flashAnim.stopAnimation();
      flashAnim.setValue(0.9);
      Animated.timing(flashAnim, {
        toValue: 0,
        duration: kind === 'no' ? 520 : 360,
        useNativeDriver: true,
      }).start();
    },
    [flashAnim]
  );

  // Ligne de scan qui balaie le cadre en continu.
  const scanLine = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLine, { toValue: 1, duration: 1700, useNativeDriver: true }),
        Animated.timing(scanLine, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scanLine]);

  const processCode = useCallback(
    async (code: string) => {
      if (busy || !merchant || !code) return;
      tapHeavy();
      setBusy(true);

      try {
        // Carte cadeau ?
        if (code.startsWith('GC-')) {
          if (!online) {
            notifyError();
            toast('Carte cadeau : reseau requis.', 'warn');
            return;
          }
          const gc = await findGiftCardByCode(code, merchant.id);
          if (gc) {
            notifySuccess();
            flash('ok');
            toast(`${gc.recipient_name || 'Carte cadeau'} - solde ${fmtAmount(gc.balance, merchant.currency)}`, 'success');
          } else {
            notifyError();
            toast('Carte cadeau introuvable dans cette boutique.', 'warn');
          }
          return;
        }

        // Carte de fidelite : hors ligne -> cache, sinon get-points.
        if (!online) {
          const cached = getCachedClient(code);
          if (cached) {
            notifySuccess();
            flash('ok');
            navigation.replace('Client', { card: cached });
          } else {
            notifyError();
            toast('Hors ligne : carte absente du cache.', 'warn');
          }
          return;
        }

        const card = await getPoints(code, merchant.id);
        cacheClient(card);
        notifySuccess();
        flash('ok');
        navigation.replace('Client', { card });
      } catch (e) {
        notifyError();
        flash('no');
        const err = e as ApiError;
        toast(err.status === 404 ? 'Carte introuvable dans cette boutique.' : err.message || 'Scan impossible', 'error');
      } finally {
        setTimeout(() => setBusy(false), 700);
      }
    },
    [busy, merchant, online, navigation, cacheClient, getCachedClient, toast, flash]
  );

  // Scan camera : extrait le code et applique l'anti double scan.
  const handleScan = useCallback(
    (result: BarcodeScanningResult) => {
      const code = extractCode(result?.data || '');
      if (!code) return;
      const now = Date.now();
      if (lastScan.current.code === code && now - lastScan.current.at < 2500) return;
      lastScan.current = { code, at: now };
      processCode(code);
    },
    [processCode]
  );

  // Scan depuis une photo de la galerie (decodage natif expo-camera).
  const scanFromPhoto = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        toast('Acces aux photos refuse.', 'warn');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
      if (res.canceled || !res.assets?.length) return;
      const found = await scanFromURLAsync(res.assets[0].uri, ['qr']);
      if (found && found.length) {
        const code = extractCode(found[0].data || '');
        if (code) {
          processCode(code);
          return;
        }
      }
      notifyError();
      flash('no');
      toast('Aucun QR code trouve sur la photo.', 'warn');
    } catch (e: any) {
      toast(e?.message || 'Lecture de la photo impossible', 'error');
    }
  }, [processCode, toast, flash]);

  const submitManual = () => {
    const code = extractCode(manualCode.trim());
    if (!code) {
      toast('Entre un code valide.', 'warn');
      return;
    }
    setManualOpen(false);
    setManualCode('');
    processCode(code);
  };

  // Permission en attente / refusee.
  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permission}>
        <Icon name="camera" size={48} color={theme.accentDark} />
        <Text style={styles.permTitle}>Autoriser la camera</Text>
        <Text style={styles.permMsg}>
          MySargal a besoin de la camera pour scanner les cartes de fidelite.
        </Text>
        <Button label="Autoriser" onPress={requestPermission} full={false} />
        <Pressable onPress={() => navigation.goBack()} style={{ marginTop: 14 }}>
          <Text style={styles.cancel}>Retour</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'ean13', 'code39'] }}
        onBarcodeScanned={busy ? undefined : handleScan}
      />

      {/* Overlay */}
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topBar}>
          <Pressable onPress={() => navigation.goBack()} style={styles.closeBtn}>
            <Icon name="x" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.topTitle}>Scanner</Text>
          <View style={styles.closeBtn} />
        </View>

        <View style={styles.frameWrap}>
          <View style={styles.frame}>
            <View style={[styles.corner, styles.tl, { borderColor: theme.accent }]} />
            <View style={[styles.corner, styles.tr, { borderColor: theme.accent }]} />
            <View style={[styles.corner, styles.bl, { borderColor: theme.accent }]} />
            <View style={[styles.corner, styles.br, { borderColor: theme.accent }]} />
            {!busy ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.scanLine,
                  {
                    backgroundColor: theme.accent,
                    shadowColor: theme.accent,
                    transform: [
                      {
                        translateY: scanLine.interpolate({
                          inputRange: [0, 1],
                          outputRange: [8, FRAME - 8],
                        }),
                      },
                    ],
                  },
                ]}
              />
            ) : null}
            {busy ? (
              <View style={styles.frameBusy}>
                <ActivityIndicator color={theme.accent} size="large" />
              </View>
            ) : null}
          </View>
          <Text style={styles.hint}>
            {busy ? 'Lecture...' : 'Aligne le QR de la carte dans le cadre'}
          </Text>
          {!online ? (
            <View style={styles.offlinePill}>
              <View style={styles.offlineDot} />
              <Text style={styles.offlineTxt}>Hors ligne - lecture depuis le cache</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.bottomBar}>
          <Pressable style={styles.bottomBtn} onPress={scanFromPhoto}>
            <Icon name="image" size={22} color="#fff" style={styles.bottomIcon} />
            <Text style={styles.bottomTxt}>Depuis une photo</Text>
          </Pressable>
          <Pressable style={styles.bottomBtn} onPress={() => setManualOpen(true)}>
            <Icon name="edit-3" size={22} color="#fff" style={styles.bottomIcon} />
            <Text style={styles.bottomTxt}>Saisie manuelle</Text>
          </Pressable>
        </View>
      </View>

      {/* Flash de retour : vert = validee, rouge = refusee */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: flashKind === 'no' ? '#ef4444' : theme.accent, opacity: flashAnim },
        ]}
      />

      <Modal visible={manualOpen} transparent animationType="slide" onRequestClose={() => setManualOpen(false)}>
        <KeyboardAvoidingView
          style={styles.manualWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.manualCard}>
            <Text style={styles.manualTitle}>Saisie manuelle du code</Text>
            <Field
              value={manualCode}
              onChangeText={setManualCode}
              placeholder="LC-XXXXXX ou GC-XXXXXX"
              autoCapitalize="characters"
              autoFocus
              onSubmitEditing={submitManual}
            />
            <Button label="Valider" onPress={submitManual} style={{ marginTop: 12 }} />
            <Pressable onPress={() => setManualOpen(false)} style={styles.manualCancel}>
              <Text style={styles.manualCancelTxt}>Annuler</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const FRAME = 250;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, justifyContent: 'space-between', paddingTop: 54, paddingBottom: 40 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  closeBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeTxt: { color: '#fff', fontSize: 18, fontFamily: fonts.bodyBold },
  topTitle: { color: '#fff', fontFamily: fonts.headingBold, fontSize: 17 },
  frameWrap: { alignItems: 'center', gap: 20 },
  frame: { width: FRAME, height: FRAME, position: 'relative' },
  corner: { position: 'absolute', width: 42, height: 42 },
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 16 },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 16 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 16 },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 16 },
  frameBusy: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 16 },
  scanLine: {
    position: 'absolute',
    left: 6,
    right: 6,
    height: 2,
    borderRadius: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 4,
  },
  hint: { color: '#fff', fontFamily: fonts.bodySemi, fontSize: 14.5, textAlign: 'center', paddingHorizontal: 40 },
  offlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderColor: 'rgba(239,68,68,0.5)',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  offlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.red },
  offlineTxt: { color: '#fff', fontFamily: fonts.bodySemi, fontSize: 12 },
  bottomBar: { flexDirection: 'row', gap: 12, paddingHorizontal: 20 },
  bottomBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', paddingVertical: 14 },
  bottomIcon: { fontSize: 18 },
  bottomTxt: { color: '#fff', fontFamily: fonts.bodySemi, fontSize: 13 },
  manualWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  manualCard: { backgroundColor: colors.s1, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, paddingBottom: 40, borderTopWidth: 1, borderColor: colors.b2 },
  manualTitle: { fontFamily: fonts.heading, fontSize: 19, color: colors.tx, marginBottom: 14 },
  manualCancel: { alignItems: 'center', paddingVertical: 12 },
  manualCancelTxt: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.tx3 },
  permission: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 12 },
  permIcon: { fontSize: 48 },
  permTitle: { fontFamily: fonts.heading, fontSize: 21, color: colors.tx },
  permMsg: { fontFamily: fonts.body, fontSize: 14.5, color: colors.tx2, textAlign: 'center', lineHeight: 21, marginBottom: 8 },
  cancel: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.tx3 },
});
