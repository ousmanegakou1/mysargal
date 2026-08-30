// ============================================================
// MySargal Caisse - Cartes cadeaux
// Trois onglets : Creer (montant libre / predefini, design, carte universelle,
// partage WhatsApp, lot entreprise), Liste (stats, recharge, annulation,
// partage) et Encaisser (par numero + OTP, ou consultation par code).
// ============================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Switch, ActivityIndicator, Alert, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';

import { Screen } from '../components/Screen';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Segmented } from '../components/Segmented';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { OfflineBanner } from '../components/OfflineBanner';
import { useToast } from '../components/Toast';
import { PressableScale } from '../components/PressableScale';
import { AnimatedListItem } from '../components/AnimatedListItem';
import { SkeletonList } from '../components/Skeleton';
import { colors, fonts, radius, spacing } from '../theme';
import { useTheme } from '../theme/ThemeProvider';

import { useAuth } from '../auth/AuthContext';
import { useNetwork } from '../offline/NetworkProvider';
import {
  giftcardFind,
  giftcardRedeemOtp,
  findGiftCardByCode,
  fetchGiftCards,
  giftStats,
  createGiftCard,
  giftBulkCreate,
  reloadGiftCard,
  voidGiftCard,
  syncWallet,
} from '../api/endpoints';
import { GiftFindResponse, GiftCardRow, GiftStats, ApiError } from '../api/types';
import { fmtMoney, onlyDigits } from '../utils/format';
import { fmtAmount, giftPresets, deviseInfo } from '../utils/currency';
import { COUNTRIES, DEFAULT_COUNTRY, Country, buildFullPhone } from '../utils/phone';
import { giftGradient } from '../utils/brand';
import { WA_MESSAGES, openWhatsApp, copyText, giftUrl } from '../utils/wa';
import { buildCSV, exportCSV } from '../utils/csv';
import { notifySuccess, tapLight } from '../utils/haptics';

type Tab = 'create' | 'list' | 'redeem';

const DESIGNS = ['violet', 'gold', 'teal', 'rose', 'blue', 'noir', 'nuit', 'foret'];

export function GiftCardsScreen() {
  const { merchant } = useAuth();
  const { toast } = useToast();
  const { online } = useNetwork();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const currency = merchant?.currency || 'XOF';
  const [tab, setTab] = useState<Tab>('create');

  return (
    <Screen scroll padded keyboardAvoiding contentStyle={styles.content}>
      <PageHeader title="Cartes cadeaux" subtitle="Creer, encaisser et suivre les cartes." />

      <OfflineBanner />

      <Segmented
        items={[
          { key: 'create', label: 'Creer' },
          { key: 'list', label: 'Liste' },
          { key: 'redeem', label: 'Encaisser' },
        ]}
        value={tab}
        onChange={(k) => setTab(k as Tab)}
      />

      {tab === 'create' ? (
        <CreateTab merchant={merchant} online={online} toast={toast} currency={currency} />
      ) : tab === 'list' ? (
        <ListTab merchant={merchant} online={online} toast={toast} currency={currency} />
      ) : (
        <RedeemTab merchant={merchant} online={online} toast={toast} currency={currency} />
      )}
    </Screen>
  );
}

// ---------------- CREER ----------------
function CreateTab({ merchant, online, toast, currency }: any) {
  const theme = useTheme();
  const presets = giftPresets(currency);
  const [amount, setAmount] = useState(String(presets[0] || 5000));
  const [custom, setCustom] = useState('');
  const [qty, setQty] = useState('1');
  const [rname, setRname] = useState('');
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [showCountries, setShowCountries] = useState(false);
  const [rlocal, setRlocal] = useState('');
  const [message, setMessage] = useState('');
  const [design, setDesign] = useState('violet');
  const [universal, setUniversal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ code: string; amount: number; name: string; phone: string } | null>(null);

  const amountNum = parseInt(custom.replace(/\D/g, '') || amount || '0', 10);
  const g = giftGradient(design);

  const create = async () => {
    if (!merchant) return;
    if (!online) {
      toast('Reseau requis.', 'warn');
      return;
    }
    if (!rname.trim()) {
      toast('Entre le nom du destinataire.', 'warn');
      return;
    }
    if (amountNum < 100) {
      toast('Montant minimum : 100.', 'warn');
      return;
    }
    const phone = onlyDigits(rlocal) ? buildFullPhone(country, rlocal) : '';
    setBusy(true);
    try {
      const r = await createGiftCard({
        initial_amount: amountNum,
        recipient_name: rname.trim(),
        recipient_phone: phone || null,
        message: message.trim() || null,
        design,
        merchant_id: universal ? null : merchant.id,
        single_use: false,
      });
      notifySuccess();
      const code = r.card?.code || '';
      setCreated({ code, amount: amountNum, name: rname.trim(), phone });
      if (phone) {
        openWhatsApp(phone, WA_MESSAGES.cadeau(merchant.name, fmtAmount(amountNum, currency), merchant.name, giftUrl(code)));
      }
    } catch (e) {
      toast((e as ApiError).message || 'Creation impossible', 'error');
    } finally {
      setBusy(false);
    }
  };

  // Lot entreprise : la quantite vient du champ `qty` (saisie in-app, coherente
  // iOS/Android). Aucune ecriture silencieuse : on valide montant + quantite.
  const bulk = async () => {
    if (!merchant) return;
    if (!online) {
      toast('Reseau requis.', 'warn');
      return;
    }
    if (amountNum < 100) {
      toast('Montant minimum : 100.', 'warn');
      return;
    }
    const cnt = parseInt((qty || '').replace(/\D/g, '') || '0', 10);
    if (!cnt || cnt < 1 || cnt > 1000) {
      toast('Quantite invalide (1 a 1000).', 'warn');
      return;
    }
    setBusy(true);
    try {
      const res = await giftBulkCreate(merchant.id, cnt, amountNum, design);
      const codes = res.codes || [];
      const rows = codes.map((c) => [c, amountNum, `https://mysargal.com/solde?c=${c}`]);
      const csv = buildCSV(['code', 'montant', 'url_solde'], rows);
      await exportCSV(`lot-cartes-cadeaux-${cnt}.csv`, csv);
      toast(`${res.created || codes.length} cartes creees.`, 'success');
    } catch (e) {
      toast((e as ApiError).message || 'Lot impossible', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    const url = giftUrl(created.code);
    return (
      <Card style={styles.card}>
        <View style={styles.doneIconWrap}>
          <Icon name="gift" size={30} color={colors.gold} />
        </View>
        <Text style={styles.doneTitle}>Carte cadeau creee</Text>
        <Text style={[styles.doneAmount, { color: theme.accentDark }]}>{fmtAmount(created.amount, currency)}</Text>
        <Text style={styles.doneCode}>{created.code}</Text>
        <Button
          label="Partager par WhatsApp"
          icon="message-circle"
          onPress={() => openWhatsApp(created.phone, WA_MESSAGES.cadeau(merchant?.name || '', fmtAmount(created.amount, currency), merchant?.name || '', url))}
        />
        <Button label="Copier le lien" icon="link" variant="secondary" onPress={() => { copyText(url); toast('Lien copie.', 'success'); }} />
        <Button label="Nouvelle carte" variant="ghost" onPress={() => setCreated(null)} />
      </Card>
    );
  }

  return (
    <>
      {/* Apercu */}
      <LinearGradient colors={g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.preview}>
        <Text style={styles.previewShop}>{universal ? 'MySargal · Universel' : merchant?.name || 'Boutique'}</Text>
        <Text style={styles.previewAmount}>{fmtAmount(amountNum, currency)}</Text>
        <Text style={styles.previewName}>{rname || 'Destinataire'}</Text>
      </LinearGradient>

      <Card style={styles.card}>
        <Text style={styles.label}>Montant</Text>
        <View style={styles.chipRow}>
          {presets.map((p) => (
            <Pressable
              key={p}
              style={[styles.chip, !custom && amount === String(p) && [styles.chipOn, { backgroundColor: theme.accentSoftBg, borderColor: theme.accentBorder }]]}
              onPress={() => { tapLight(); setAmount(String(p)); setCustom(''); }}
            >
              <Text style={[styles.chipTxt, !custom && amount === String(p) && [styles.chipTxtOn, { color: theme.accentDark }]]}>{fmtAmount(p, currency)}</Text>
            </Pressable>
          ))}
        </View>
        <Field value={custom} onChangeText={(t) => setCustom(t.replace(/\D/g, ''))} placeholder="Montant libre" keyboardType="number-pad" prefix={deviseInfo(currency).symbol} containerStyle={{ marginTop: 4 }} />

        <Field label="Nom du destinataire" value={rname} onChangeText={setRname} placeholder="Ex : Fatou" autoCapitalize="words" containerStyle={{ marginTop: 6 }} />

        <Text style={[styles.label, { marginTop: 6 }]}>Telephone (optionnel)</Text>
        <View style={styles.phoneRow}>
          <Pressable style={styles.country} onPress={() => setShowCountries((v) => !v)}>
            <Text style={styles.code}>{country.code}</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Field value={rlocal} onChangeText={(t) => setRlocal(t.replace(/[^\d ]/g, ''))} placeholder="77 123 45 67" keyboardType="phone-pad" />
          </View>
        </View>
        {showCountries ? (
          <View style={styles.countryList}>
            {COUNTRIES.map((c) => (
              <Pressable key={c.iso} style={styles.countryItem} onPress={() => { setCountry(c); setShowCountries(false); }}>
                <Text style={styles.countryName}>{c.name}</Text>
                <Text style={styles.code}>{c.code}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Field label="Message (optionnel)" value={message} onChangeText={setMessage} placeholder="Joyeux anniversaire !" containerStyle={{ marginTop: 6 }} />

        <Text style={[styles.label, { marginTop: 6 }]}>Design</Text>
        <View style={styles.designRow}>
          {DESIGNS.map((d) => {
            const gg = giftGradient(d);
            return (
              <Pressable key={d} onPress={() => { tapLight(); setDesign(d); }} style={[styles.designCell, design === d && [styles.designOn, { borderColor: theme.accent }]]}>
                <LinearGradient colors={gg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.designSwatch} />
              </Pressable>
            );
          })}
        </View>

        <View style={styles.uniRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.uniLabel}>Carte universelle</Text>
            <Text style={styles.uniHint}>Utilisable dans toutes les boutiques MySargal.</Text>
          </View>
          <Switch value={universal} onValueChange={setUniversal} trackColor={{ false: colors.s4, true: theme.accent }} thumbColor={universal ? theme.accentDark : '#888'} />
        </View>

        <Button label="Creer la carte cadeau" icon="gift" onPress={create} loading={busy} large style={{ marginTop: 6 }} />

        <View style={styles.bulkRow}>
          <Field
            label="Quantite (lot)"
            value={qty}
            onChangeText={(t) => setQty(t.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad"
            placeholder="10"
            containerStyle={styles.bulkQty}
          />
          <Button label="Lot entreprise" icon="briefcase" variant="secondary" onPress={bulk} loading={busy} style={styles.bulkBtn} />
        </View>
        <Text style={styles.bulkHint}>Cree {qty || '0'} carte(s) du meme montant et exporte un CSV (codes + URL de solde).</Text>
      </Card>
    </>
  );
}

// ---------------- LISTE ----------------
function ListTab({ merchant, online, toast, currency }: any) {
  const theme = useTheme();
  const [cards, setCards] = useState<GiftCardRow[]>([]);
  const [stats, setStats] = useState<GiftStats>({});
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [reloadTarget, setReloadTarget] = useState<GiftCardRow | null>(null);
  const [reloadAmt, setReloadAmt] = useState('');
  const [reloadBusy, setReloadBusy] = useState(false);

  const load = useCallback(async () => {
    if (!merchant || !online) return;
    try {
      const [c, s] = await Promise.all([fetchGiftCards(merchant.id), giftStats(merchant.id)]);
      setCards(c);
      setStats(s);
    } catch {
      /* garde l'existant */
    }
  }, [merchant, online]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) => (c.recipient_name || '').toLowerCase().includes(q) || (c.code || '').toLowerCase().includes(q));
  }, [cards, query]);

  // Recharge : ouvre une modale de saisie (coherente iOS/Android). Aucune
  // recharge silencieuse d'un montant preset.
  const reload = (gc: GiftCardRow) => {
    if (!merchant) return;
    setReloadTarget(gc);
    setReloadAmt('');
  };

  const doReload = async () => {
    if (!merchant || !reloadTarget) return;
    const amt = parseInt((reloadAmt || '').replace(/\D/g, '') || '0', 10);
    if (!amt || amt < deviseInfo(currency).rechargeMin) {
      toast(`Montant minimum : ${fmtAmount(deviseInfo(currency).rechargeMin, currency)}`, 'warn');
      return;
    }
    setReloadBusy(true);
    try {
      const gc = reloadTarget;
      const r = await reloadGiftCard(gc.code, amt, merchant.id);
      setCards((prev) => prev.map((c) => (c.id === gc.id ? { ...c, balance: r.new_balance, status: 'active' } : c)));
      toast(`Rechargee : ${fmtAmount(r.new_balance, currency)}`, 'success');
      setReloadTarget(null);
      setReloadAmt('');
    } catch (e) {
      toast((e as ApiError).message || 'Recharge impossible', 'error');
    } finally {
      setReloadBusy(false);
    }
  };

  const cancel = (gc: GiftCardRow) => {
    Alert.alert('Annuler la carte', `Annuler la carte ${gc.code} ?`, [
      { text: 'Non', style: 'cancel' },
      {
        text: 'Annuler la carte',
        style: 'destructive',
        onPress: async () => {
          try {
            await voidGiftCard(gc.id);
            syncWallet(gc.code);
            setCards((prev) => prev.map((c) => (c.id === gc.id ? { ...c, status: 'cancelled' } : c)));
            toast('Carte annulee.', 'success');
          } catch (e) {
            toast((e as ApiError).message || 'Annulation impossible', 'error');
          }
        },
      },
    ]);
  };

  const share = (gc: GiftCardRow) => {
    openWhatsApp(gc.recipient_phone, WA_MESSAGES.cadeau(merchant?.name || '', fmtAmount(gc.initial_amount, currency), merchant?.name || '', giftUrl(gc.code)));
  };

  return (
    <>
      <View style={styles.statsRow}>
        <GStat value={fmtAmount(stats.issued_value || 0, currency)} label="Emis" />
        <GStat value={fmtAmount(stats.outstanding || 0, currency)} label="En circulation" accent />
        <GStat value={String(stats.expiring_30d || 0)} label="Expire < 30j" />
      </View>

      <Field value={query} onChangeText={setQuery} placeholder="Nom ou code" autoCapitalize="none" />

      {loading && !cards.length ? (
        <SkeletonList count={5} />
      ) : filtered.length ? (
        <View style={styles.list}>
          {filtered.map((gc, i) => {
            const g = giftGradient(gc.design);
            const pct = gc.initial_amount ? Math.round((gc.balance / gc.initial_amount) * 100) : 0;
            const tone = gc.status === 'active' ? 'green' : gc.status === 'used' ? 'neutral' : 'red';
            const label = gc.status === 'active' ? 'Active' : gc.status === 'used' ? 'Utilisee' : 'Annulee';
            return (
              <AnimatedListItem key={gc.id} index={i} style={styles.gcItem}>
                <LinearGradient colors={g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gcThumb} />
                <View style={{ flex: 1 }}>
                  <View style={styles.gcHead}>
                    <Text style={styles.gcName} numberOfLines={1}>{gc.recipient_name || 'Carte cadeau'}</Text>
                    <StatusBadge label={label} tone={tone as any} small />
                  </View>
                  <Text style={styles.gcCode}>{gc.code}{!gc.merchant_id ? ' · UNIVERSELLE' : ''}</Text>
                  <Text style={styles.gcBal}>{fmtAmount(gc.balance, currency)} / {fmtAmount(gc.initial_amount, currency)} ({pct}%)</Text>
                  <View style={styles.gcActions}>
                    <PressableScale onPress={() => share(gc)} style={styles.gcAct} accessibilityLabel="Partager"><Icon name="message-circle" size={14} color={theme.accentDark} /><Text style={[styles.gcActTxt, { color: theme.accentDark }]}>Partager</Text></PressableScale>
                    <PressableScale onPress={() => reload(gc)} style={styles.gcAct} accessibilityLabel="Recharge"><Icon name="plus" size={14} color={theme.accentDark} /><Text style={[styles.gcActTxt, { color: theme.accentDark }]}>Recharge</Text></PressableScale>
                    {gc.status === 'active' ? (
                      <PressableScale onPress={() => cancel(gc)} style={styles.gcAct} accessibilityLabel="Annuler"><Icon name="x" size={14} color={colors.red} /><Text style={[styles.gcActTxt, { color: colors.red }]}>Annuler</Text></PressableScale>
                    ) : null}
                  </View>
                </View>
              </AnimatedListItem>
            );
          })}
        </View>
      ) : (
        <EmptyState icon="gift" title="Aucune carte cadeau" message="Cree la premiere depuis l'onglet Creer." />
      )}

      <Modal visible={!!reloadTarget} animationType="slide" transparent onRequestClose={() => setReloadTarget(null)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Recharger la carte</Text>
            {reloadTarget ? <Text style={styles.modalSub}>{reloadTarget.code} · solde {fmtAmount(reloadTarget.balance, currency)}</Text> : null}
            <Field
              label={`Montant a ajouter (${deviseInfo(currency).symbol})`}
              value={reloadAmt}
              onChangeText={(t) => setReloadAmt(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              placeholder={String(deviseInfo(currency).rechargeMin)}
              containerStyle={{ marginTop: 12 }}
            />
            <Button label="Recharger" icon="plus" onPress={doReload} loading={reloadBusy} style={{ marginTop: 12 }} />
            <Pressable onPress={() => setReloadTarget(null)} style={styles.modalCancel}><Text style={styles.modalCancelTxt}>Annuler</Text></Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ---------------- ENCAISSER ----------------
function RedeemTab({ merchant, online, toast, currency }: any) {
  const theme = useTheme();
  const [mode, setMode] = useState<'phone' | 'code'>('phone');
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [showCountries, setShowCountries] = useState(false);
  const [local, setLocal] = useState('');
  const [step, setStep] = useState<'search' | 'redeem'>('search');
  const [finding, setFinding] = useState(false);
  const [found, setFound] = useState<GiftFindResponse | null>(null);
  const [amount, setAmount] = useState('');
  const [otp, setOtp] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  const [codeInput, setCodeInput] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeResult, setCodeResult] = useState<{ name: string; balance: number; status: string; code: string } | null>(null);

  const fullPhone = buildFullPhone(country, local);

  const doFind = async () => {
    if (!merchant) return;
    if (onlyDigits(local).length < 6) { toast('Numero invalide.', 'warn'); return; }
    if (!online) { toast('Reseau requis.', 'warn'); return; }
    setFinding(true);
    try {
      const res = await giftcardFind(merchant.id, fullPhone);
      if (!res.found) { toast('Aucune carte active pour ce numero.', 'warn'); setFound(null); return; }
      setFound(res); setStep('redeem'); notifySuccess();
      toast('Code envoye au client par WhatsApp.', 'success');
    } catch (e) {
      toast((e as ApiError).message || 'Recherche impossible', 'error');
    } finally { setFinding(false); }
  };

  const doRedeem = async () => {
    if (!merchant) return;
    const amt = parseInt(amount.replace(/\D/g, '') || '0', 10);
    if (!amt || amt < 1) { toast('Montant invalide.', 'warn'); return; }
    if (onlyDigits(otp).length < 4) { toast('Entre le code recu par le client.', 'warn'); return; }
    setRedeeming(true);
    try {
      const res = await giftcardRedeemOtp(merchant.id, fullPhone, otp, amt);
      notifySuccess();
      syncWallet(res.code);
      toast(`Encaisse ${fmtAmount(amt, currency)} · solde ${fmtAmount(res.new_balance, currency)}`, 'success');
      setStep('search'); setFound(null); setAmount(''); setOtp(''); setLocal('');
    } catch (e) {
      toast((e as ApiError).message || 'Encaissement refuse', 'error');
    } finally { setRedeeming(false); }
  };

  const doLookup = async () => {
    if (!merchant) return;
    const c = codeInput.trim().toUpperCase();
    if (!c || !online) { toast('Reseau requis.', 'warn'); return; }
    setCodeLoading(true); setCodeResult(null);
    try {
      const gc = await findGiftCardByCode(c, merchant.id);
      if (!gc) { toast('Carte introuvable.', 'warn'); return; }
      setCodeResult({ name: gc.recipient_name || 'Carte cadeau', balance: gc.balance, status: gc.status, code: gc.code });
    } catch (e) {
      toast((e as ApiError).message || 'Consultation impossible', 'error');
    } finally { setCodeLoading(false); }
  };

  return (
    <>
      <Segmented items={[{ key: 'phone', label: 'Par numero' }, { key: 'code', label: 'Par code' }]} value={mode} onChange={(k) => setMode(k as any)} />

      {mode === 'phone' ? (
        step === 'search' ? (
          <Card style={styles.card}>
            <Text style={styles.label}>Numero du client</Text>
            <View style={styles.phoneRow}>
              <Pressable style={styles.country} onPress={() => setShowCountries((v) => !v)}>
                <Text style={styles.code}>{country.code}</Text>
              </Pressable>
              <View style={{ flex: 1 }}>
                <Field value={local} onChangeText={(t) => setLocal(t.replace(/[^\d ]/g, ''))} placeholder="77 123 45 67" keyboardType="phone-pad" />
              </View>
            </View>
            {showCountries ? (
              <View style={styles.countryList}>
                {COUNTRIES.map((c) => (
                  <Pressable key={c.iso} style={styles.countryItem} onPress={() => { setCountry(c); setShowCountries(false); }}>
                    <Text style={styles.countryName}>{c.name}</Text>
                    <Text style={styles.code}>{c.code}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Button label="Trouver et envoyer le code" icon="search" onPress={doFind} loading={finding} disabled={onlyDigits(local).length < 6} />
            <Text style={styles.note}>Un code de confirmation est envoye au client par WhatsApp.</Text>
          </Card>
        ) : (
          <Card style={styles.card}>
            <View style={styles.foundHead}>
              <View>
                <Text style={styles.foundName}>{found?.name || 'Client'}</Text>
                <Text style={styles.foundSub}>{found?.count} carte{(found?.count || 0) > 1 ? 's' : ''}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.balanceVal, { color: theme.accentDark }]}>{fmtAmount(found?.total_balance || 0, currency)}</Text>
                <Text style={styles.balanceLbl}>solde total</Text>
              </View>
            </View>
            <Field label="Montant a encaisser" value={amount} onChangeText={(t) => setAmount(t.replace(/\D/g, ''))} placeholder="ex : 5000" keyboardType="number-pad" prefix={deviseInfo(currency).symbol} />
            <Field label="Code recu par le client" value={otp} onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 6))} placeholder="6 chiffres" keyboardType="number-pad" containerStyle={{ marginTop: 12 }} />
            <Button label="Encaisser" icon="check" onPress={doRedeem} loading={redeeming} disabled={!amount || onlyDigits(otp).length < 4} large style={{ marginTop: 14 }} />
            <Pressable onPress={() => { setStep('search'); setFound(null); setAmount(''); setOtp(''); }} style={styles.cancelBtn}>
              <Text style={styles.cancelTxt}>Changer de client</Text>
            </Pressable>
          </Card>
        )
      ) : (
        <Card style={styles.card}>
          <Field label="Code de la carte" value={codeInput} onChangeText={setCodeInput} placeholder="GC-XXXXXX" autoCapitalize="characters" />
          <Button label="Consulter le solde" icon="search" onPress={doLookup} loading={codeLoading} disabled={!codeInput.trim()} variant="secondary" style={{ marginTop: 12 }} />
          {codeResult ? (
            <View style={styles.codeResult}>
              <View style={styles.foundHead}>
                <View>
                  <Text style={styles.foundName}>{codeResult.name}</Text>
                  <Text style={styles.gcCode}>{codeResult.code}</Text>
                </View>
                <StatusBadge label={codeResult.status === 'active' ? 'Active' : codeResult.status} tone={codeResult.status === 'active' ? 'green' : 'neutral'} small />
              </View>
              <Text style={[styles.bigBalance, { color: theme.accentDark }]}>{fmtAmount(codeResult.balance, currency)}</Text>
              <Text style={styles.balanceLbl}>solde disponible</Text>
              <Text style={styles.note}>Pour encaisser, passe par "Par numero" (confirmation OTP du client requise).</Text>
            </View>
          ) : null}
        </Card>
      )}
    </>
  );
}

function GStat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.gstat}>
      <Text style={[styles.gstatVal, accent && { color: theme.accentDark }]} numberOfLines={1}>{value}</Text>
      <Text style={styles.gstatLbl}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: spacing.xxxl },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.s2,
    borderWidth: 1,
    borderColor: colors.b2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: fonts.heading, fontSize: 26, color: colors.tx, letterSpacing: -0.5, marginTop: 4 },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.tx2, marginTop: 2 },
  card: { gap: 12 },
  label: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.tx3, letterSpacing: 0.6, textTransform: 'uppercase' },
  preview: { borderRadius: radius.xl, padding: 22, gap: 4, minHeight: 130, justifyContent: 'center' },
  previewShop: { fontFamily: fonts.bodyBold, fontSize: 13, color: 'rgba(255,255,255,0.85)' },
  previewAmount: { fontFamily: fonts.heading, fontSize: 34, color: '#fff', marginTop: 4 },
  previewName: { fontFamily: fonts.bodySemi, fontSize: 14, color: 'rgba(255,255,255,0.9)' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: colors.s3, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.b2, paddingHorizontal: 14, paddingVertical: 9 },
  chipOn: { backgroundColor: colors.s4, borderColor: colors.b3 },
  chipTxt: { fontFamily: fonts.bodySemi, fontSize: 12.5, color: colors.tx2 },
  chipTxtOn: { color: colors.tx },
  phoneRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  country: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.s3, borderWidth: 1.5, borderColor: colors.b1, borderRadius: radius.md, paddingHorizontal: 12, height: 52 },
  flag: { fontSize: 18 },
  code: { fontFamily: fonts.mono, fontSize: 13, color: colors.tx },
  countryList: { backgroundColor: colors.s2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.b2, overflow: 'hidden' },
  countryItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.b1 },
  countryName: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 14, color: colors.tx },
  designRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  designCell: { padding: 3, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  designOn: { borderColor: colors.tx },
  designSwatch: { width: 40, height: 40, borderRadius: 10 },
  uniRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 },
  uniLabel: { fontFamily: fonts.bodyBold, fontSize: 14.5, color: colors.tx },
  uniHint: { fontFamily: fonts.body, fontSize: 12, color: colors.tx3, marginTop: 2 },
  doneIconWrap: { alignSelf: 'center', width: 66, height: 66, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: 'rgba(245,200,66,0.35)' },
  doneTitle: { fontFamily: fonts.heading, fontSize: 20, color: colors.tx, textAlign: 'center' },
  doneAmount: { fontFamily: fonts.heading, fontSize: 32, color: colors.tx, textAlign: 'center' },
  doneCode: { fontFamily: fonts.mono, fontSize: 13, color: colors.tx2, textAlign: 'center', marginBottom: 8 },
  statsRow: { flexDirection: 'row', backgroundColor: colors.s2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.b1, paddingVertical: 16 },
  gstat: { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 4 },
  gstatVal: { fontFamily: fonts.headingBold, fontSize: 15, color: colors.tx },
  gstatLbl: { fontFamily: fonts.body, fontSize: 10.5, color: colors.tx3, textAlign: 'center' },
  list: { gap: 12 },
  gcItem: { flexDirection: 'row', gap: 12, backgroundColor: colors.s2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.b1, padding: 12 },
  gcThumb: { width: 54, height: 54, borderRadius: 12 },
  gcHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  gcName: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, color: colors.tx },
  gcCode: { fontFamily: fonts.mono, fontSize: 11, color: colors.tx3, marginTop: 2 },
  gcBal: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.tx2, marginTop: 3 },
  gcActions: { flexDirection: 'row', gap: 14, marginTop: 8 },
  gcAct: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 },
  gcActTxt: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.tx },
  foundHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  foundName: { fontFamily: fonts.headingBold, fontSize: 18, color: colors.tx },
  foundSub: { fontFamily: fonts.body, fontSize: 12.5, color: colors.tx2, marginTop: 2 },
  balanceVal: { fontFamily: fonts.heading, fontSize: 20, color: colors.tx },
  balanceLbl: { fontFamily: fonts.mono, fontSize: 10, color: colors.tx3, marginTop: 2 },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelTxt: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.tx3 },
  note: { fontFamily: fonts.body, fontSize: 12, color: colors.tx3, lineHeight: 18 },
  codeResult: { marginTop: 14, gap: 4 },
  gcCodeSmall: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.tx2 },
  bigBalance: { fontFamily: fonts.heading, fontSize: 34, color: colors.tx, marginTop: 10 },
  bulkRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 4 },
  bulkQty: { width: 110 },
  bulkBtn: { flex: 1 },
  bulkHint: { fontFamily: fonts.body, fontSize: 12, color: colors.tx3, lineHeight: 18, marginTop: 6 },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.s1, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, paddingBottom: 34, borderTopWidth: 1, borderColor: colors.b2 },
  modalTitle: { fontFamily: fonts.heading, fontSize: 20, color: colors.tx },
  modalSub: { fontFamily: fonts.body, fontSize: 13, color: colors.tx2, marginTop: 4 },
  modalCancel: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  modalCancelTxt: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.tx3 },
});
