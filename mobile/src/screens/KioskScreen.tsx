// ============================================================
// MySargal Caisse - Mode kiosque (libre service)
// Le client scanne lui-meme sa carte : +1 point automatique, resultat avec
// confetti et retour auto. Ecran maintenu allume (expo-keep-awake). La sortie
// est protegee par un code PIN dedie (comme l'app web).
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';

import { RootStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { PinPad } from '../components/PinPad';
import { Confetti } from '../components/Confetti';
import { useToast } from '../components/Toast';
import { colors, fonts, radius, spacing } from '../theme';
import { useTheme } from '../theme/ThemeProvider';

import { useAuth } from '../auth/AuthContext';
import { addPoints, getPoints, findGiftCardByCode, syncWallet } from '../api/endpoints';
import { hasKioskPin, setKioskPin, verifyKioskPin } from '../auth/pin';
import { extractCode, fmtPts, fmtMoney } from '../utils/format';
import { notifySuccess, notifyError, tapHeavy } from '../utils/haptics';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Kiosk'>;

interface KioskResult {
  name: string;
  total: number;
  added: number;
  reward?: boolean;
  gift?: { name: string; balance: number };
}

export function KioskScreen() {
  const navigation = useNavigation<Nav>();
  const { merchant } = useAuth();
  const { toast } = useToast();
  const theme = useTheme();

  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<KioskResult | null>(null);
  const [countdown, setCountdown] = useState(5);
  const lastScan = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  // PIN de sortie.
  const [pinModal, setPinModal] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const [pinVal, setPinVal] = useState('');
  const [pinFirst, setPinFirst] = useState('');
  const [pinStep, setPinStep] = useState<'set' | 'confirm' | 'check'>('check');
  const [pinError, setPinError] = useState(false);

  useEffect(() => {
    activateKeepAwakeAsync('kiosk').catch(() => {});
    return () => {
      deactivateKeepAwake('kiosk').catch(() => {});
    };
  }, []);

  // Compte a rebours de retour au scan.
  useEffect(() => {
    if (!result) return;
    setCountdown(5);
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(id);
          setResult(null);
          return 5;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [result]);

  const handleScan = useCallback(
    async (res: BarcodeScanningResult) => {
      if (busy || result || pinModal || !merchant) return;
      const code = extractCode(res?.data || '');
      if (!code) return;
      const now = Date.now();
      if (lastScan.current.code === code && now - lastScan.current.at < 3000) return;
      lastScan.current = { code, at: now };

      tapHeavy();
      setBusy(true);
      try {
        if (code.startsWith('GC-')) {
          const gc = await findGiftCardByCode(code, merchant.id);
          if (gc) {
            notifySuccess();
            setResult({ name: gc.recipient_name || 'Carte cadeau', total: 0, added: 0, gift: { name: gc.recipient_name || 'Carte cadeau', balance: gc.balance } });
          } else {
            notifyError();
            toast('Carte cadeau introuvable.', 'warn');
          }
          return;
        }
        const r = await addPoints({
          card_code: code,
          merchant_id: merchant.id,
          pts: 1,
          note: 'Scan caisse',
          source: 'kiosk',
          cashier_id: null,
        });
        notifySuccess();
        let name = 'Client';
        try {
          const card = await getPoints(code, merchant.id);
          name = card.client_name || 'Client';
        } catch {
          /* nom indisponible */
        }
        syncWallet(code);
        setResult({ name, total: r.pts_total, added: r.pts_added, reward: r.just_unlocked });
      } catch (e: any) {
        notifyError();
        toast(e?.message || 'Scan refuse', 'error');
      } finally {
        setTimeout(() => setBusy(false), 600);
      }
    },
    [busy, result, pinModal, merchant, toast]
  );

  // Demande de sortie : ouvre le pave PIN (ou creation si non defini).
  const requestExit = async () => {
    const exists = await hasKioskPin();
    setSetupMode(!exists);
    setPinStep(exists ? 'check' : 'set');
    setPinVal('');
    setPinFirst('');
    setPinError(false);
    setPinModal(true);
  };

  useEffect(() => {
    if (!pinModal || pinVal.length !== 4) return;
    (async () => {
      if (pinStep === 'check') {
        if (await verifyKioskPin(pinVal)) {
          setPinModal(false);
          deactivateKeepAwake('kiosk').catch(() => {});
          navigation.goBack();
        } else {
          setPinError(true);
          notifyError();
          setTimeout(() => { setPinError(false); setPinVal(''); }, 700);
        }
      } else if (pinStep === 'set') {
        setPinFirst(pinVal);
        setPinVal('');
        setPinStep('confirm');
      } else {
        if (pinVal === pinFirst) {
          await setKioskPin(pinVal);
          setPinModal(false);
          toast('Code de sortie enregistre.', 'success');
          deactivateKeepAwake('kiosk').catch(() => {});
          navigation.goBack();
        } else {
          setPinError(true);
          notifyError();
          setTimeout(() => { setPinError(false); setPinVal(''); setPinFirst(''); setPinStep('set'); }, 700);
        }
      }
    })();
  }, [pinVal, pinModal, pinStep, pinFirst, navigation, toast]);

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
        <Text style={styles.permMsg}>Le mode kiosque a besoin de la camera pour le libre service.</Text>
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
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={busy || result ? undefined : handleScan}
      />
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topBar}>
          <View style={styles.brandPill}>
            <Text style={styles.brandTxt}>{merchant?.name || 'MySargal'} · Libre service</Text>
          </View>
          <Pressable onPress={requestExit} style={styles.exitBtn}>
            <Text style={styles.exitTxt}>Quitter</Text>
          </Pressable>
        </View>

        {!result ? (
          <View style={styles.frameWrap}>
            <View style={styles.frame}>
              <View style={[styles.corner, styles.tl, { borderColor: theme.accent }]} />
              <View style={[styles.corner, styles.tr, { borderColor: theme.accent }]} />
              <View style={[styles.corner, styles.bl, { borderColor: theme.accent }]} />
              <View style={[styles.corner, styles.br, { borderColor: theme.accent }]} />
            </View>
            <Text style={styles.bigHint}>Scannez votre carte</Text>
            <Text style={styles.smallHint}>Presentez le QR de votre carte de fidelite</Text>
          </View>
        ) : (
          <View style={styles.resultWrap}>
            <LinearGradient colors={[colors.s2, colors.s1]} style={styles.resultCard}>
              {result.gift ? (
                <>
                  <Icon name="gift" size={52} color={colors.gold} style={styles.resIcon} />
                  <Text style={styles.resName}>{result.gift.name}</Text>
                  <Text style={[styles.resBig, { color: theme.accentDark }]}>{fmtMoney(result.gift.balance, merchant?.currency || 'FCFA')}</Text>
                  <Text style={styles.resLbl}>solde de la carte cadeau</Text>
                </>
              ) : (
                <>
                  <Icon name={result.reward ? 'award' : 'check-circle'} size={52} color={result.reward ? colors.gold : theme.accentDark} style={styles.resIcon} />
                  <Text style={styles.resHi}>Bonjour {result.name}</Text>
                  <Text style={[styles.resBig, { color: theme.accentDark }]}>+{result.added} pt{result.added > 1 ? 's' : ''}</Text>
                  <Text style={styles.resLbl}>{fmtPts(result.total)} points au total</Text>
                  {result.reward ? (
                    <View style={styles.resRewardRow}>
                      <Icon name="award" size={16} color={colors.gold} />
                      <Text style={styles.resReward}>Recompense debloquee !</Text>
                    </View>
                  ) : null}
                </>
              )}
              <Text style={styles.countdown}>Retour dans {countdown}s</Text>
            </LinearGradient>
          </View>
        )}

        <View style={{ height: 40 }} />
      </View>

      <Confetti show={!!result && !result.gift} />

      <Modal visible={pinModal} transparent animationType="fade" onRequestClose={() => setPinModal(false)}>
        <View style={styles.pinWrap}>
          <View style={styles.pinCard}>
            <Text style={styles.pinTitle}>
              {pinStep === 'check' ? 'Code de sortie' : pinStep === 'set' ? 'Definir un code de sortie' : 'Confirmer le code'}
            </Text>
            <Text style={styles.pinSub}>
              {setupMode
                ? 'Choisissez un code a 4 chiffres pour quitter le mode kiosque.'
                : 'Entrez le code pour quitter le mode libre service.'}
            </Text>
            <PinPad value={pinVal} onChange={setPinVal} error={pinError} />
            <Pressable onPress={() => setPinModal(false)} style={styles.pinCancel}>
              <Text style={styles.pinCancelTxt}>Annuler</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const FRAME = 260;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, justifyContent: 'space-between', paddingTop: 54 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  brandPill: { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  brandTxt: { color: '#fff', fontFamily: fonts.bodyBold, fontSize: 13 },
  exitBtn: { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  exitTxt: { color: '#fff', fontFamily: fonts.bodyBold, fontSize: 13 },
  frameWrap: { alignItems: 'center', gap: 18 },
  frame: { width: FRAME, height: FRAME, position: 'relative' },
  corner: { position: 'absolute', width: 46, height: 46 },
  tl: { top: 0, left: 0, borderTopWidth: 5, borderLeftWidth: 5, borderTopLeftRadius: 18 },
  tr: { top: 0, right: 0, borderTopWidth: 5, borderRightWidth: 5, borderTopRightRadius: 18 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 5, borderLeftWidth: 5, borderBottomLeftRadius: 18 },
  br: { bottom: 0, right: 0, borderBottomWidth: 5, borderRightWidth: 5, borderBottomRightRadius: 18 },
  bigHint: { color: '#fff', fontFamily: fonts.heading, fontSize: 26, textAlign: 'center' },
  smallHint: { color: 'rgba(255,255,255,0.75)', fontFamily: fonts.bodySemi, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
  resultWrap: { alignItems: 'center', paddingHorizontal: 24 },
  resultCard: { alignSelf: 'stretch', alignItems: 'center', borderRadius: radius.xl, padding: 30, gap: 6, borderWidth: 1, borderColor: colors.b2 },
  resIcon: { marginBottom: 4 },
  resRewardRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  resHi: { fontFamily: fonts.headingBold, fontSize: 20, color: colors.tx },
  resName: { fontFamily: fonts.headingBold, fontSize: 20, color: colors.tx },
  resBig: { fontFamily: fonts.heading, fontSize: 44, marginTop: 6 },
  resLbl: { fontFamily: fonts.body, fontSize: 14, color: colors.tx2 },
  resReward: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.gold, marginTop: 8 },
  countdown: { fontFamily: fonts.mono, fontSize: 12, color: colors.tx3, marginTop: 14 },
  pinWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  pinCard: { backgroundColor: colors.s1, borderRadius: radius.xl, padding: spacing.xl, alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.b2 },
  pinTitle: { fontFamily: fonts.heading, fontSize: 20, color: colors.tx },
  pinSub: { fontFamily: fonts.body, fontSize: 13, color: colors.tx2, textAlign: 'center', marginBottom: 16, paddingHorizontal: 10 },
  pinCancel: { paddingVertical: 12, marginTop: 6 },
  pinCancelTxt: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.tx3 },
  permission: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 12 },
  permIcon: { fontSize: 48 },
  permTitle: { fontFamily: fonts.heading, fontSize: 21, color: colors.tx },
  permMsg: { fontFamily: fonts.body, fontSize: 14.5, color: colors.tx2, textAlign: 'center', lineHeight: 21, marginBottom: 8 },
  cancel: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.tx3 },
});
