// ============================================================
// MySargal Caisse - Ecran de connexion OTP WhatsApp
// Etape 1 : numero -> envoi du code. Etape 2 : saisie du code (6 chiffres),
// renvoi avec compte a rebours, gestion des erreurs (code faux, expire, 429).
// ============================================================

import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Keyboard,
  Image,
} from 'react-native';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { colors, fonts, radius, spacing } from '../theme';
import { useTheme } from '../theme/ThemeProvider';
import { COUNTRIES, DEFAULT_COUNTRY, Country, buildFullPhone } from '../utils/phone';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/types';
import { tapLight } from '../utils/haptics';

const RESEND_SECONDS = 45;

export function LoginScreen() {
  const { sendCode, verifyCode } = useAuth();
  const { toast } = useToast();
  const theme = useTheme();

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [showCountries, setShowCountries] = useState(false);
  const [local, setLocal] = useState('');
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [codeError, setCodeError] = useState<string | null>(null);
  const inputs = useRef<(TextInput | null)[]>([]);

  const fullPhone = buildFullPhone(country, local);
  const canSend = local.replace(/\D/g, '').length >= 6;
  const code = digits.join('');

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const doSend = async (isResend = false) => {
    if (!canSend) return;
    if (isResend ? false : sending) return;
    Keyboard.dismiss();
    if (!isResend) setSending(true);
    try {
      await sendCode(fullPhone);
      if (!isResend) {
        setStep('code');
        setTimeout(() => inputs.current[0]?.focus(), 250);
      }
      setCountdown(RESEND_SECONDS);
      setCodeError(null);
      toast('Code envoye par WhatsApp', 'success');
    } catch (e) {
      const err = e as ApiError;
      toast(err.message || "Impossible d'envoyer le code", 'error');
    } finally {
      if (!isResend) setSending(false);
    }
  };

  const onDigit = (val: string, idx: number) => {
    const clean = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[idx] = clean;
    setDigits(next);
    setCodeError(null);
    if (clean && idx < 5) inputs.current[idx + 1]?.focus();
    if (next.join('').length === 6) doVerify(next.join(''));
  };

  const onKey = (e: any, idx: number) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[idx] && idx > 0) {
      const next = [...digits];
      next[idx - 1] = '';
      setDigits(next);
      inputs.current[idx - 1]?.focus();
    }
  };

  const doVerify = async (fullCode?: string) => {
    const c = fullCode || code;
    if (c.length < 6 || verifying) return;
    Keyboard.dismiss();
    setVerifying(true);
    setCodeError(null);
    try {
      const merchant = await verifyCode(fullPhone, c);
      toast(`Bienvenue ${merchant.name || ''}`.trim(), 'success');
    } catch (e) {
      const err = e as ApiError;
      let msg = err.message || 'Code incorrect';
      if (err.status === 429) msg = 'Trop de tentatives. Demande un nouveau code.';
      else if (err.tentatives_restantes != null)
        msg = `Code incorrect. ${err.tentatives_restantes} essai(s) restant(s).`;
      setCodeError(msg);
      toast(msg, 'error');
      setDigits(['', '', '', '', '', '']);
      inputs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  };

  const resetToPhone = () => {
    setStep('phone');
    setDigits(['', '', '', '', '', '']);
    setCodeError(null);
    setCountdown(0);
  };

  return (
    <Screen keyboardAvoiding scroll padded contentStyle={styles.content}>
      {/* Marque */}
      <View style={styles.brandWrap}>
        <Image source={require('../../assets/logo-mark.png')} style={styles.logoImg} resizeMode="contain" />
        <Text style={styles.title}>MySargal</Text>
        <Text style={styles.subtitle}>
          {step === 'phone'
            ? 'Connecte ta boutique avec ton numero WhatsApp.'
            : `Entre le code recu au ${fullPhone}.`}
        </Text>
      </View>

      {step === 'phone' ? (
        <View style={styles.form}>
          <View>
            <Text style={styles.fieldLabel}>Numero de la boutique</Text>
            <View style={styles.phoneRow}>
              <Pressable
                style={styles.country}
                onPress={() => {
                  tapLight();
                  setShowCountries((v) => !v);
                }}
              >
                <Text style={styles.countryIso}>{country.iso}</Text>
                <Text style={styles.countryCode}>{country.code}</Text>
                <Icon name={showCountries ? 'chevron-up' : 'chevron-down'} size={15} color={colors.tx2} />
              </Pressable>
              <View style={styles.phoneInputWrap}>
                <TextInput
                  value={local}
                  onChangeText={(t) => setLocal(t.replace(/[^\d ]/g, ''))}
                  placeholder="77 123 45 67"
                  placeholderTextColor={colors.tx3}
                  keyboardType="phone-pad"
                  selectionColor={theme.accent}
                  style={styles.phoneInput}
                  autoFocus
                />
              </View>
            </View>
          </View>

          {showCountries ? (
            <View style={styles.countryList}>
              {COUNTRIES.map((c) => (
                <Pressable
                  key={c.iso}
                  style={styles.countryItem}
                  onPress={() => {
                    tapLight();
                    setCountry(c);
                    setShowCountries(false);
                  }}
                >
                  <Text style={styles.countryItemName}>{c.name}</Text>
                  <Text style={styles.countryItemCode}>{c.code}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <Button
            label="Recevoir le code"
            icon="arrow-right"
            onPress={() => doSend(false)}
            loading={sending}
            disabled={!canSend}
            large
          />
          <Text style={styles.legal}>
            Un code a 6 chiffres te sera envoye par WhatsApp. Il expire au bout de 5 minutes.
          </Text>
        </View>
      ) : (
        <View style={styles.form}>
          <View style={styles.otpRow}>
            {digits.map((d, i) => (
              <TextInput
                key={i}
                ref={(r) => {
                  inputs.current[i] = r;
                }}
                value={d}
                onChangeText={(t) => onDigit(t, i)}
                onKeyPress={(e) => onKey(e, i)}
                keyboardType="number-pad"
                maxLength={1}
                selectionColor={theme.accent}
                style={[
                  styles.otpBox,
                  d ? [styles.otpBoxFilled, { borderColor: theme.accent, backgroundColor: theme.accentSoftBg }] : null,
                  codeError ? styles.otpBoxError : null,
                ]}
              />
            ))}
          </View>

          {codeError ? <Text style={styles.errorTxt}>{codeError}</Text> : null}

          <Button
            label="Valider le code"
            onPress={() => doVerify()}
            loading={verifying}
            disabled={code.length < 6}
            large
          />

          <View style={styles.resendRow}>
            {countdown > 0 ? (
              <Text style={styles.resendMuted}>Renvoyer le code dans {countdown}s</Text>
            ) : (
              <Pressable onPress={() => doSend(true)}>
                <Text style={[styles.resendLink, { color: theme.accent }]}>Renvoyer le code</Text>
              </Pressable>
            )}
            <Text style={styles.dot}>·</Text>
            <Pressable onPress={resetToPhone}>
              <Text style={[styles.resendLink, { color: theme.accent }]}>Changer de numero</Text>
            </Pressable>
          </View>

          {verifying ? (
            <View style={styles.verifyingRow}>
              <ActivityIndicator size="small" color={theme.accent} />
              <Text style={styles.resendMuted}>Verification...</Text>
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.xxl },
  brandWrap: { alignItems: 'center', gap: 12, marginTop: spacing.xl },
  logoImg: {
    width: 128,
    height: 128,
  },
  orb: { width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center', padding: 3 },
  orbInner: {
    flex: 1,
    alignSelf: 'stretch',
    borderRadius: 36,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  orbTxt: { fontFamily: fonts.heading, fontSize: 26, color: colors.tx },
  title: { fontFamily: fonts.heading, fontSize: 27, color: colors.tx, letterSpacing: -0.5 },
  subtitle: { fontFamily: fonts.body, fontSize: 14.5, color: colors.tx2, textAlign: 'center', lineHeight: 21, paddingHorizontal: 20 },
  form: { gap: spacing.lg },
  fieldLabel: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.tx3, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 7 },
  phoneRow: { flexDirection: 'row', gap: 8 },
  country: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.s3,
    borderWidth: 1.5,
    borderColor: colors.b1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
  },
  countryIso: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.tx2, letterSpacing: 0.5 },
  countryCode: { fontFamily: fonts.mono, fontSize: 14, color: colors.tx },
  phoneInputWrap: { flex: 1, backgroundColor: colors.s3, borderWidth: 1.5, borderColor: colors.b1, borderRadius: radius.md, paddingHorizontal: 14 },
  phoneInput: { fontSize: 17, color: colors.tx, paddingVertical: 15 },
  countryList: {
    backgroundColor: colors.s2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.b2,
    overflow: 'hidden',
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.b1,
  },
  countryItemName: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 14, color: colors.tx },
  countryItemCode: { fontFamily: fonts.mono, fontSize: 13, color: colors.tx2 },
  legal: { fontFamily: fonts.body, fontSize: 12, color: colors.tx3, textAlign: 'center', lineHeight: 18 },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  otpBox: {
    flex: 1,
    height: 62,
    backgroundColor: colors.s3,
    borderWidth: 1.5,
    borderColor: colors.b1,
    borderRadius: radius.md,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '800',
    color: colors.tx,
  },
  otpBoxFilled: { borderColor: colors.b2, backgroundColor: colors.s3 },
  otpBoxError: { borderColor: colors.red },
  errorTxt: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.red, textAlign: 'center' },
  resendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap' },
  resendMuted: { fontFamily: fonts.body, fontSize: 13, color: colors.tx3 },
  resendLink: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.tx },
  dot: { color: colors.tx3 },
  verifyingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
