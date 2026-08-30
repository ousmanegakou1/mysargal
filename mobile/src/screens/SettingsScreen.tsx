// ============================================================
// MySargal Caisse - Reglages
// Boutique, logo, conversion montant/points, expiration, marque, automations
// WhatsApp, securite (PIN), boutiques/branches, equipe, abonnement, hook API,
// theme et deconnexion. Parite avec l'onglet "Mon compte" du web.
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Switch, Modal, Image, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Screen } from '../components/Screen';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { Button } from '../components/Button';
import { Icon, IconName } from '../components/Icon';
import { PinPad } from '../components/PinPad';
import { Segmented } from '../components/Segmented';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import { colors, fonts, radius, spacing } from '../theme';
import { useTheme } from '../theme/ThemeProvider';
import { BACKGROUND_PALETTES, BackgroundPref } from '../theme/backgrounds';

import { useAuth } from '../auth/AuthContext';
import { useNetwork } from '../offline/NetworkProvider';
import { isPinEnabled, setPin, disablePin } from '../auth/pin';
import {
  updateMerchant,
  fetchBranches,
  createBranch,
  fetchCashiers,
  addCashier,
  removeCashier,
  getOrCreatePartnerKey,
  regeneratePartnerKey,
  getLandingSettings,
} from '../api/endpoints';
import { storageUpload } from '../api/client';
import { FUNCTIONS_BASE } from '../config';
import { Merchant, Cashier } from '../api/types';
import { fmtMoney, fmtPts, maskLabel, jwtDaysLeft } from '../utils/format';
import { fmtAmount, deviseInfo } from '../utils/currency';
import { COUNTRIES } from '../utils/phone';
import { BRAND_PRESETS } from '../utils/brand';
import { pickImage, readAsBytes } from '../utils/image';
import { openUrl, openWhatsApp, copyText } from '../utils/wa';
import { notifyError } from '../utils/haptics';

const CURRENCIES = ['XOF', 'XAF', 'EUR', 'USD', 'MAD', 'GNF', 'NGN', 'GHS'];
const LANGS = [
  { key: 'fr', label: 'Français' },
  { key: 'en', label: 'English' },
  { key: 'es', label: 'Español' },
];

// Onglets (chips) du web mobile "Mon compte".
type SetTab = 'shop' | 'loy' | 'pos' | 'mkt' | 'brand' | 'appr' | 'int' | 'acc';
const SET_TABS: { key: SetTab; label: string; icon: IconName }[] = [
  { key: 'shop', label: 'Boutique', icon: 'shopping-bag' },
  { key: 'loy', label: 'Fidélité', icon: 'star' },
  { key: 'pos', label: 'Caisse', icon: 'lock' },
  { key: 'mkt', label: 'Marketing', icon: 'send' },
  { key: 'brand', label: 'Carte client', icon: 'credit-card' },
  { key: 'appr', label: 'Apparence', icon: 'droplet' },
  { key: 'int', label: 'Intégrations', icon: 'key' },
  { key: 'acc', label: 'Compte', icon: 'user' },
];

export function SettingsScreen() {
  const navigation = useNavigation<any>();
  const evTheme = useTheme();
  const { merchant, phone, logout, lock, refreshMerchant, switchMerchant } = useAuth();
  const { toast } = useToast();
  const { online, pendingCount, syncing, syncNow } = useNetwork();
  const m = merchant as Merchant | null;

  // Onglet actif (chips)
  const [tab, setTab] = useState<SetTab>('shop');

  // Boutique
  const [name, setName] = useState(m?.name || '');
  const [country, setCountry] = useState((m as any)?.country_code || '');
  const [threshold, setThreshold] = useState(String(m?.threshold ?? 10));
  const [rewardDesc, setRewardDesc] = useState(m?.reward_desc || '');
  const [whatsapp, setWhatsapp] = useState(m?.whatsapp || '');
  const [website, setWebsite] = useState(m?.website || '');
  const [emailOn, setEmailOn] = useState<boolean>(!!(m as any)?.email_enabled);
  const [currency, setCurrency] = useState(m?.currency || 'XOF');
  const [lang, setLang] = useState(m?.language || 'fr');
  const [savingShop, setSavingShop] = useState(false);

  // Conversion
  const [amountMode, setAmountMode] = useState<boolean>(!!m?.pts_amount_mode);
  const [ratio, setRatio] = useState(String(m?.pts_fcfa_per_point || deviseInfo(m?.currency).ratio));
  const [savingConv, setSavingConv] = useState(false);

  // Expiration
  const [expiryOn, setExpiryOn] = useState<boolean>(!!(m as any)?.pts_expiry_enabled);
  const [expiryMonths, setExpiryMonths] = useState(String((m as any)?.pts_expiry_months || 12));
  const [savingExp, setSavingExp] = useState(false);

  // Marque
  const [bg1, setBg1] = useState((m?.brand as any)?.bg1 || BRAND_PRESETS[0].bg1);
  const [bg2, setBg2] = useState((m?.brand as any)?.bg2 || BRAND_PRESETS[0].bg2);
  const [accent, setAccent] = useState((m?.brand as any)?.accent || BRAND_PRESETS[0].accent);
  const [savingBrand, setSavingBrand] = useState(false);

  // Automations
  const rc = (m?.reward_config as any) || {};
  const [winback, setWinback] = useState<boolean>(!!rc.winback_enabled);
  const [winbackDays, setWinbackDays] = useState(String(rc.winback_days || 30));
  const [birthday, setBirthday] = useState<boolean>(!!rc.birthday_greet);
  const [notifyPoints, setNotifyPoints] = useState<boolean>(rc.notify_points !== false);
  const [referralBonus, setReferralBonus] = useState(String(rc.referral_bonus || 0));
  const [savingAuto, setSavingAuto] = useState(false);

  // Logo
  const [logoUrl, setLogoUrl] = useState(m?.logo_url || '');
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Securite (PIN app)
  const [pinOn, setPinOn] = useState(false);
  const [pinModal, setPinModal] = useState(false);
  const [pinStep, setPinStep] = useState<'set' | 'confirm'>('set');
  const [pinFirst, setPinFirst] = useState('');
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState(false);

  // Branches / equipe
  const [branches, setBranches] = useState<Merchant[]>([]);
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [branchModal, setBranchModal] = useState(false);
  const [cashierModal, setCashierModal] = useState(false);
  const [bName, setBName] = useState('');
  const [cName, setCName] = useState('');
  const [cPin, setCPin] = useState('');
  const [branchBusy, setBranchBusy] = useState(false);

  // API hook
  const [apiKey, setApiKey] = useState('');
  const [apiBusy, setApiBusy] = useState(false);

  // Facturation
  const [billing, setBilling] = useState<{ wave_link: string; pro_price: number }>({ wave_link: 'https://pay.wave.com/m/M_sn_1n3_7fYSI-Io/c/sn/', pro_price: 25000 });

  // Theme (preference)
  const [theme, setTheme] = useState('light');

  // Fond de l'app (apparence)
  const [bgBusy, setBgBusy] = useState(false);

  useEffect(() => {
    isPinEnabled().then(setPinOn);
    AsyncStorage.getItem('ms_theme').then((v) => v && setTheme(v));
  }, []);

  const loadExtras = useCallback(async () => {
    if (!m || !online) return;
    fetchBranches(m.parent_id || m.id).then(setBranches).catch(() => {});
    fetchCashiers(m.id).then(setCashiers).catch(() => {});
    getLandingSettings().then((rows) => {
      const row = rows.find((r: any) => r.key === 'landing_billing');
      if (row && row.value) setBilling({ wave_link: row.value.wave_link || billing.wave_link, pro_price: row.value.pro_price || billing.pro_price });
    }).catch(() => {});
  }, [m, online]);

  useEffect(() => {
    loadExtras();
  }, [loadExtras]);

  // Resynchronise le formulaire quand la boutique active change (bascule de
  // branche) : sinon les champs gardent l'ancienne boutique et un enregistrement
  // ecraserait la nouvelle avec des valeurs perimees.
  useEffect(() => {
    if (!m) return;
    setName(m.name || '');
    setCountry((m as any)?.country_code || '');
    setThreshold(String(m.threshold ?? 10));
    setRewardDesc(m.reward_desc || '');
    setWhatsapp(m.whatsapp || '');
    setWebsite(m.website || '');
    setEmailOn(!!(m as any)?.email_enabled);
    setCurrency(m.currency || 'XOF');
    setLang(m.language || 'fr');
    setAmountMode(!!m.pts_amount_mode);
    setRatio(String(m.pts_fcfa_per_point || deviseInfo(m.currency).ratio));
    setExpiryOn(!!(m as any)?.pts_expiry_enabled);
    setExpiryMonths(String((m as any)?.pts_expiry_months || 12));
    setLogoUrl(m.logo_url || '');
    const cfg = (m.reward_config as any) || {};
    setWinback(!!cfg.winback_enabled);
    setWinbackDays(String(cfg.winback_days || 30));
    setBirthday(!!cfg.birthday_greet);
    setNotifyPoints(cfg.notify_points !== false);
    setReferralBonus(String(cfg.referral_bonus || 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.id]);

  const version = (Constants as any)?.expoConfig?.version || '1.0.0';
  const planDays = m?.plan_expires ? Math.ceil((new Date(m.plan_expires).getTime() - Date.now()) / 86400000) : null;

  // ---- Sauvegardes ----
  const saveShop = async () => {
    if (!m) return;
    setSavingShop(true);
    try {
      let site = website.trim();
      if (site && !/^https?:\/\//i.test(site)) site = 'https://' + site;
      await updateMerchant(m.id, {
        name: name.trim(),
        whatsapp: whatsapp.trim(),
        website: site,
        email_enabled: emailOn,
        country_code: country || null,
        currency,
        language: lang,
      });
      await refreshMerchant();
      toast('Boutique enregistree.', 'success');
    } catch (e: any) {
      toast(e?.message || 'Enregistrement impossible', 'error');
    } finally {
      setSavingShop(false);
    }
  };

  // Recompense fidelite (seuil de points + description). Meme endpoint que la
  // boutique (updateMerchant), sur un sous-ensemble, comme saveConv/saveExpiry :
  // ce reglage vit desormais dans l'onglet Fidelite ou il est plus coherent.
  const [savingReward, setSavingReward] = useState(false);
  const saveReward = async () => {
    if (!m) return;
    setSavingReward(true);
    try {
      await updateMerchant(m.id, {
        threshold: parseInt(threshold || '10', 10),
        reward_desc: rewardDesc.trim(),
      });
      await refreshMerchant();
      toast('Recompense enregistree.', 'success');
    } catch (e: any) {
      toast(e?.message || 'Enregistrement impossible', 'error');
    } finally {
      setSavingReward(false);
    }
  };

  const saveConv = async () => {
    if (!m) return;
    const r = parseInt(ratio || '0', 10);
    if (amountMode && r < deviseInfo(currency).ratioMin) {
      toast(`Ratio minimum : ${deviseInfo(currency).ratioMin}`, 'warn');
      return;
    }
    setSavingConv(true);
    try {
      await updateMerchant(m.id, { pts_amount_mode: amountMode, pts_fcfa_per_point: r });
      await refreshMerchant();
      toast('Conversion enregistree.', 'success');
    } catch (e: any) {
      toast(e?.message || 'Enregistrement impossible', 'error');
    } finally {
      setSavingConv(false);
    }
  };

  const saveExpiry = async () => {
    if (!m) return;
    setSavingExp(true);
    try {
      await updateMerchant(m.id, { pts_expiry_enabled: expiryOn, pts_expiry_months: parseInt(expiryMonths || '12', 10) });
      await refreshMerchant();
      toast('Expiration enregistree.', 'success');
    } catch (e: any) {
      toast(e?.message || 'Enregistrement impossible', 'error');
    } finally {
      setSavingExp(false);
    }
  };

  const saveBrand = async () => {
    if (!m) return;
    setSavingBrand(true);
    try {
      await updateMerchant(m.id, { brand: { bg1, bg2, accent, text: '#ffffff' } });
      await refreshMerchant();
      toast('Couleurs enregistrees.', 'success');
    } catch (e: any) {
      toast(e?.message || 'Couleurs non enregistrees.', 'error');
    } finally {
      setSavingBrand(false);
    }
  };

  const saveAuto = async () => {
    if (!m) return;
    setSavingAuto(true);
    try {
      const cfg = {
        ...((m.reward_config as any) || {}),
        winback_enabled: winback,
        winback_days: parseInt(winbackDays || '30', 10),
        birthday_greet: birthday,
        notify_points: notifyPoints,
        referral_bonus: parseInt(referralBonus || '0', 10),
      };
      await updateMerchant(m.id, { reward_config: cfg });
      await refreshMerchant();
      toast('Automations enregistrees.', 'success');
    } catch (e: any) {
      toast(e?.message || 'Enregistrement impossible', 'error');
    } finally {
      setSavingAuto(false);
    }
  };

  const uploadLogo = async () => {
    if (!m) return;
    setUploadingLogo(true);
    try {
      const img = await pickImage(600);
      if (!img) return;
      const { bytes, contentType } = await readAsBytes(img.uri);
      const url = await storageUpload(`merchants/logos/${m.id}.jpg`, bytes, contentType || 'image/jpeg');
      const bust = `${url}?v=${Date.now()}`;
      await updateMerchant(m.id, { logo_url: url });
      setLogoUrl(bust);
      await refreshMerchant();
      toast('Logo mis a jour.', 'success');
    } catch (e: any) {
      toast(e?.message || 'Logo impossible', 'error');
    } finally {
      setUploadingLogo(false);
    }
  };

  // ---- PIN ----
  const onTogglePin = async (val: boolean) => {
    if (val) {
      setPinStep('set');
      setPinFirst('');
      setPinValue('');
      setPinError(false);
      setPinModal(true);
    } else {
      await disablePin();
      setPinOn(false);
      toast('Code PIN desactive.', 'info');
    }
  };
  useEffect(() => {
    if (!pinModal || pinValue.length !== 4) return;
    (async () => {
      if (pinStep === 'set') {
        setPinFirst(pinValue);
        setPinValue('');
        setPinStep('confirm');
      } else {
        if (pinValue === pinFirst) {
          await setPin(pinValue);
          setPinOn(true);
          setPinModal(false);
          toast('Code PIN active.', 'success');
        } else {
          setPinError(true);
          notifyError();
          setTimeout(() => { setPinError(false); setPinValue(''); setPinFirst(''); setPinStep('set'); }, 700);
        }
      }
    })();
  }, [pinValue, pinModal, pinStep, pinFirst]);

  // ---- Branches ----
  const doCreateBranch = async () => {
    if (!m || !bName.trim()) return;
    setBranchBusy(true);
    try {
      await createBranch({
        name: bName.trim(),
        parent_id: m.parent_id || m.id,
        phone: m.phone + '_branch_' + Date.now(),
        threshold: parseInt(threshold || '10', 10),
        reward_desc: rewardDesc.trim(),
        country_code: (m as any).country_code || null,
        currency,
        language: lang,
        plan: 'free',
        created_at: new Date().toISOString(),
      });
      toast('Boutique creee.', 'success');
      setBranchModal(false);
      setBName('');
      await loadExtras();
    } catch (e: any) {
      toast(e?.message || 'Creation impossible', 'error');
    } finally {
      setBranchBusy(false);
    }
  };

  const doSwitchBranch = async (id: string) => {
    try {
      await switchMerchant(id);
      toast('Boutique active changee.', 'success');
    } catch (e: any) {
      toast(e?.message || 'Changement de boutique impossible', 'error');
    }
  };

  // ---- Cashiers ----
  const doAddCashier = async () => {
    if (!m || !cName.trim()) return;
    if (cPin.trim().length !== 4) {
      toast('Un code PIN a 4 chiffres est requis.', 'warn');
      return;
    }
    setBranchBusy(true);
    try {
      const c = await addCashier(m.id, cName.trim(), cPin.trim());
      setCashiers((prev) => [...prev, c]);
      toast('Caissier ajoute.', 'success');
      setCashierModal(false);
      setCName('');
      setCPin('');
    } catch (e: any) {
      toast(e?.message || 'Ajout impossible', 'error');
    } finally {
      setBranchBusy(false);
    }
  };
  const doRemoveCashier = async (id: string) => {
    try {
      await removeCashier(id);
      setCashiers((prev) => prev.filter((c) => c.id !== id));
    } catch (e: any) {
      toast(e?.message || 'Suppression impossible', 'error');
    }
  };

  // ---- API key ----
  const loadApiKey = async () => {
    setApiBusy(true);
    try {
      setApiKey(await getOrCreatePartnerKey());
    } catch (e: any) {
      toast(e?.message || 'Cle indisponible', 'error');
    } finally {
      setApiBusy(false);
    }
  };
  const regenApiKey = async () => {
    setApiBusy(true);
    try {
      setApiKey(await regeneratePartnerKey());
      toast('Nouvelle cle generee.', 'success');
    } catch (e: any) {
      toast(e?.message || 'Regeneration impossible', 'error');
    } finally {
      setApiBusy(false);
    }
  };

  const setThemePref = async (t: string) => {
    setTheme(t);
    await AsyncStorage.setItem('ms_theme', t);
  };

  // Theme evenementiel : applique immediatement (contexte + local) puis persiste
  // cote marchand via reward_config.app_theme (reglable admin).
  const [savingEvent, setSavingEvent] = useState(false);
  const applyEventTheme = async (key: string) => {
    evTheme.setTheme(key); // rendu instantane + cache local
    if (!m) return;
    setSavingEvent(true);
    try {
      const cfg = { ...((m.reward_config as any) || {}), app_theme: key };
      await updateMerchant(m.id, { reward_config: cfg });
      await refreshMerchant();
      toast('Theme de l\'app applique.', 'success');
    } catch (e: any) {
      toast('Theme applique localement (synchro a reessayer).', 'warn');
    } finally {
      setSavingEvent(false);
    }
  };

  // Fond de l'app : applique immediatement (contexte + local) puis persiste
  // cote marchand via reward_config.app_background.
  const applyBackground = async (pref: BackgroundPref) => {
    evTheme.setBackground(pref); // rendu instantane + cache local
    if (!m) return;
    setBgBusy(true);
    try {
      const cfg = { ...((m.reward_config as any) || {}), app_background: pref };
      await updateMerchant(m.id, { reward_config: cfg });
      await refreshMerchant();
      toast('Fond applique.', 'success');
    } catch (e: any) {
      toast('Fond applique localement (synchro a reessayer).', 'warn');
    } finally {
      setBgBusy(false);
    }
  };

  const importBackgroundImage = async () => {
    setBgBusy(true);
    try {
      const img = await pickImage(1080);
      if (!img) return;
      await applyBackground({ type: 'image', uri: img.base64DataUrl });
    } catch (e: any) {
      toast(e?.message || 'Image impossible', 'error');
    } finally {
      setBgBusy(false);
    }
  };

  return (
    <Screen scroll padded keyboardAvoiding contentStyle={styles.content}>
      <PageHeader
        title="Mon compte"
        subtitle="Reglages de la boutique et du compte"
        onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))}
      />

      {/* Chips onglets (scroll horizontal, compacts, pilule) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsRow}
      >
        {SET_TABS.map((t) => {
          const on = t.key === tab;
          return (
            <Pressable
              key={t.key}
              style={[
                styles.chip,
                on && { backgroundColor: evTheme.accentSoftBg, borderColor: evTheme.accentBorder },
              ]}
              onPress={() => setTab(t.key)}
              accessibilityRole="button"
              accessibilityLabel={t.label}
            >
              <Icon name={t.icon} size={15} color={on ? evTheme.accentDark : colors.tx2} />
              <Text style={[styles.chipTxt, on && { color: evTheme.accentDark }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ===== Onglet Compte : Abonnement ===== */}
      {tab === 'acc' ? (
      <Card style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>ABONNEMENT</Text>
          <StatusBadge label={String(m?.plan || 'free').toUpperCase()} tone={planDays != null && planDays < 0 ? 'red' : 'green'} small />
        </View>
        <Text style={styles.help}>
          {planDays == null
            ? 'Acces illimite a toutes les fonctions.'
            : planDays < 0
            ? 'Abonnement expire. Renouvelez pour continuer a encaisser.'
            : `Il vous reste ${planDays} jour(s) avant le renouvellement.`}
        </Text>
        <View style={styles.actions}>
          <Button label={`Payer ou renouveler (${fmtMoney(billing.pro_price, deviseInfo(currency).symbol)})`} icon="credit-card" onPress={() => openUrl(billing.wave_link)} />
          <Button label="Contacter le support" icon="message-circle" variant="ghost" onPress={() => openWhatsApp('221777608983', 'Bonjour, je souhaite renouveler mon abonnement MySargal.')} />
        </View>
      </Card>
      ) : null}

      {/* ===== Onglet Boutique ===== */}
      {tab === 'shop' ? (
      <>
      {/* Identite : logo + nom */}
      <Card style={styles.card}>
        <SectionHeader title="IDENTITE" help="Le logo et le nom affiches sur la carte de vos clients." />
        <View style={styles.logoRow}>
          {logoUrl ? <Image source={{ uri: logoUrl }} style={styles.logo} /> : <View style={[styles.logo, styles.logoEmpty]}><Icon name="shopping-bag" size={26} color={evTheme.accentDark} /></View>}
          <Button label="Choisir un logo" icon="camera" variant="secondary" full={false} onPress={uploadLogo} loading={uploadingLogo} style={{ flex: 1 }} />
        </View>
        <Field label="Nom de la boutique" value={name} onChangeText={setName} />
      </Card>

      {/* Zone et langue */}
      <Card style={styles.card}>
        <SectionHeader title="ZONE ET LANGUE" help="Choisissez le pays, la monnaie et la langue de la boutique." />
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Pays</Text>
          <Segmented scroll items={COUNTRIES.map((c) => ({ key: c.iso, label: c.name }))} value={country} onChange={setCountry} />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Monnaie</Text>
          <Segmented scroll items={CURRENCIES.map((c) => ({ key: c, label: `${c} · ${deviseInfo(c).symbol}` }))} value={currency} onChange={setCurrency} />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Langue de la boutique</Text>
          <Segmented items={LANGS} value={lang} onChange={setLang} />
        </View>
        <Text style={styles.help}>
          Le pays complete les numeros saisis sans indicatif. La monnaie s'applique a vos cartes cadeaux, sans aucune conversion : en changer ne recalcule pas les soldes existants. Vos clients recoivent leurs messages dans la langue de leur propre numero : un client americain sera servi en anglais meme si votre boutique est en francais.
        </Text>
      </Card>

      {/* Contact client + enregistrement du profil */}
      <Card style={styles.card}>
        <SectionHeader title="CONTACT CLIENT" help="Les coordonnees visibles par vos clients sur leur carte." />
        <Field label="WhatsApp de la boutique" value={whatsapp} onChangeText={setWhatsapp} keyboardType="phone-pad" placeholder="+221 77 123 45 67" />
        <Text style={styles.help}>Affiche sur la carte client (« Contacter sur WhatsApp »). Ne change pas votre numero de connexion.</Text>
        <Field label="Site web" value={website} onChangeText={setWebsite} autoCapitalize="none" placeholder="https://maboutique.com" />
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>Envoyer aussi les cartes par email</Text>
            <Text style={styles.help}>En plus de WhatsApp, quand l'adresse du client est connue.</Text>
          </View>
          <Switch value={emailOn} onValueChange={setEmailOn} trackColor={{ false: colors.s4, true: evTheme.accent }} thumbColor={emailOn ? evTheme.accentDark : '#888'} />
        </View>
        <Button label="Enregistrer la boutique" onPress={saveShop} loading={savingShop} />
      </Card>
      </>
      ) : null}

      {/* ===== Onglet Fidelite ===== */}
      {tab === 'loy' ? (
      <>
      {/* Recompense : combien de points donnent droit a quoi */}
      <Card style={styles.card}>
        <SectionHeader title="RECOMPENSE" help="A partir de combien de points le client gagne sa recompense." />
        <Text style={styles.label}>Seuil de points</Text>
        <View style={styles.thresholdRow}>
          <Field value={threshold} onChangeText={(t) => setThreshold(t.replace(/\D/g, ''))} keyboardType="number-pad" containerStyle={styles.thresholdInput} style={styles.thresholdTxt} />
          <Text style={styles.thresholdEq}>points =</Text>
          <Field value={rewardDesc} onChangeText={setRewardDesc} placeholder="Ex : 1 cafe offert" containerStyle={{ flex: 1 }} />
        </View>
        <Button label="Enregistrer la recompense" onPress={saveReward} loading={savingReward} />
      </Card>

      {/* Gain de points */}
      <Card style={styles.card}>
        <SectionHeader title="GAIN DE POINTS" help="Comment vos clients accumulent des points a chaque achat." />
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>Convertir le montant en points</Text>
            <Text style={styles.help}>Un montant d'achat devient automatiquement des points.</Text>
          </View>
          <Switch value={amountMode} onValueChange={setAmountMode} trackColor={{ false: colors.s4, true: evTheme.accent }} thumbColor={amountMode ? evTheme.accentDark : '#888'} />
        </View>
        {amountMode ? (
          <>
            <Field label={`Montant pour 1 point (${deviseInfo(currency).symbol})`} value={ratio} onChangeText={(t) => setRatio(t.replace(/\D/g, ''))} keyboardType="number-pad" />
            <Text style={styles.help}>1 point pour {fmtAmount(parseInt(ratio || '0', 10) || deviseInfo(currency).ratio, currency)} depenses.</Text>
          </>
        ) : (
          <Text style={styles.help}>La caisse saisit directement le nombre de points a crediter.</Text>
        )}
        <Button label="Enregistrer le gain de points" onPress={saveConv} loading={savingConv} />
      </Card>

      {/* Expiration des points */}
      <Card style={styles.card}>
        <SectionHeader title="EXPIRATION DES POINTS" help="Rendez les points valables une duree limitee, ou sans limite." />
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>Points valables une duree limitee</Text>
            <Text style={styles.help}>Desactive : les points ne perdent jamais leur valeur.</Text>
          </View>
          <Switch value={expiryOn} onValueChange={setExpiryOn} trackColor={{ false: colors.s4, true: evTheme.accent }} thumbColor={expiryOn ? evTheme.accentDark : '#888'} />
        </View>
        {expiryOn ? (
          <Field label="Duree de validite (mois)" value={expiryMonths} onChangeText={(t) => setExpiryMonths(t.replace(/\D/g, ''))} keyboardType="number-pad" />
        ) : null}
        <Button label="Enregistrer l'expiration" onPress={saveExpiry} loading={savingExp} />
      </Card>
      </>
      ) : null}

      {/* ===== Onglet Carte client ===== */}
      {tab === 'brand' ? (
      <Card style={styles.card}>
        <SectionHeader title="COULEURS DE LA CARTE" help="Choisissez un theme de couleurs pour la carte de fidelite de vos clients." />
        <Text style={styles.label}>Themes proposes</Text>
        <View style={styles.presetRow}>
          {BRAND_PRESETS.map((p) => (
            <Pressable key={p.name} style={styles.preset} onPress={() => { setBg1(p.bg1); setBg2(p.bg2); setAccent(p.accent); }}>
              <View style={[styles.presetSwatch, { backgroundColor: p.bg2 }]} />
              <Text style={styles.presetName}>{p.name}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>Apercu</Text>
        <View style={styles.brandPreviewRow}>
          <View style={[styles.brandDot, { backgroundColor: bg1 }]} />
          <View style={[styles.brandDot, { backgroundColor: bg2 }]} />
          <View style={[styles.brandDot, { backgroundColor: accent }]} />
          <Text style={styles.help}>Fond, degrade et accent de la carte.</Text>
        </View>
        <Button label="Enregistrer les couleurs" onPress={saveBrand} loading={savingBrand} />
      </Card>
      ) : null}

      {/* ===== Onglet Marketing ===== */}
      {tab === 'mkt' ? (
      <>
      {/* Messages automatiques WhatsApp */}
      <Card style={styles.card}>
        <SectionHeader title="MESSAGES AUTOMATIQUES" help="Messages WhatsApp envoyes automatiquement a vos clients." />
        <ToggleRow label="Prevenir le client quand il gagne des points" value={notifyPoints} onChange={setNotifyPoints} />
        <ToggleRow label="Relancer les clients inactifs" value={winback} onChange={setWinback} />
        {winback ? <Field label="Apres combien de jours sans achat" value={winbackDays} onChangeText={(t) => setWinbackDays(t.replace(/\D/g, ''))} keyboardType="number-pad" /> : null}
        <ToggleRow label="Souhaiter l'anniversaire du client" value={birthday} onChange={setBirthday} />
        <Field label="Bonus de parrainage (points)" value={referralBonus} onChangeText={(t) => setReferralBonus(t.replace(/\D/g, ''))} keyboardType="number-pad" />
        <Button label="Enregistrer les messages" onPress={saveAuto} loading={savingAuto} />
      </Card>

      {/* Campagnes manuelles */}
      <Card style={styles.card}>
        <SectionHeader title="CAMPAGNES" help="Envoyez une notification ou une offre a l'ensemble de vos clients." />
        <Button label="Ouvrir les campagnes et notifications" icon="send" variant="secondary" onPress={() => navigation.navigate('Push')} />
      </Card>
      </>
      ) : null}

      {/* ===== Onglet Compte : Boutiques ===== */}
      {tab === 'acc' ? (
      <Card style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>BOUTIQUES</Text>
          <Pressable onPress={() => setBranchModal(true)} style={styles.addLinkRow}><Icon name="plus" size={15} color={evTheme.accent} /><Text style={[styles.addLink, { color: evTheme.accent }]}>Ajouter</Text></Pressable>
        </View>
        <Text style={styles.help}>Gerez plusieurs points de vente et basculez de l'un a l'autre.</Text>
        {branches.map((b) => (
          <View key={b.id} style={styles.branchRow}>
            <Text style={[styles.branchName, b.id === m?.id && { color: evTheme.accent }]}>{b.name}{b.id === m?.id ? ' · active' : ''}</Text>
            {b.id !== m?.id ? (
              <Pressable onPress={() => doSwitchBranch(b.id)}><Text style={[styles.branchSwitch, { color: evTheme.accent }]}>Activer</Text></Pressable>
            ) : null}
          </View>
        ))}
        {!branches.length ? <Text style={styles.help}>Vous avez une seule boutique pour l'instant.</Text> : null}
      </Card>
      ) : null}

      {/* ===== Onglet Caisse : Equipe ===== */}
      {tab === 'pos' ? (
      <Card style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>EQUIPE</Text>
          <Pressable onPress={() => setCashierModal(true)} style={styles.addLinkRow}><Icon name="plus" size={15} color={evTheme.accent} /><Text style={[styles.addLink, { color: evTheme.accent }]}>Ajouter</Text></Pressable>
        </View>
        <Text style={styles.help}>Chaque caissier encaisse avec son propre code PIN a 4 chiffres.</Text>
        {cashiers.map((c) => (
          <View key={c.id} style={styles.branchRow}>
            <Text style={styles.branchName}>{c.name}</Text>
            <Pressable onPress={() => doRemoveCashier(c.id)}><Text style={[styles.branchSwitch, { color: colors.red }]}>Retirer</Text></Pressable>
          </View>
        ))}
        {!cashiers.length ? <Text style={styles.help}>Aucun caissier enregistre pour le moment.</Text> : null}
      </Card>
      ) : null}

      {/* ===== Onglet Integrations ===== */}
      {tab === 'int' ? (
      <Card style={styles.card}>
        <SectionHeader title="CLE API" help="Connectez WooCommerce ou une caisse externe pour crediter les points automatiquement." />
        {apiKey ? (
          <>
            <Text style={styles.label}>Votre cle (appuyez pour copier)</Text>
            <Pressable onPress={() => { copyText(apiKey); toast('Cle copiee.', 'success'); }} style={styles.keyBox}>
              <Text style={[styles.keyTxt, { color: evTheme.accentDark }]} numberOfLines={1}>{apiKey}</Text>
            </Pressable>
            <Text style={styles.label}>Adresse du webhook (appuyez pour copier)</Text>
            <Pressable onPress={() => { copyText(`${FUNCTIONS_BASE}/api-order?key=${apiKey}`); toast('URL copiee.', 'success'); }} style={styles.keyBox}>
              <Text style={styles.webhook} numberOfLines={1}>{FUNCTIONS_BASE}/api-order?key=...</Text>
            </Pressable>
            <Button label="Regenerer la cle" icon="refresh-cw" variant="ghost" onPress={regenApiKey} loading={apiBusy} />
          </>
        ) : (
          <Button label="Generer la cle API" icon="key" onPress={loadApiKey} loading={apiBusy} />
        )}
      </Card>
      ) : null}

      {/* ===== Onglet Caisse : Securite ===== */}
      {tab === 'pos' ? (
      <>
      <Card style={styles.card}>
        <SectionHeader title="SECURITE" help="Protegez la caisse quand plusieurs vendeurs se relaient." />
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>Verrouiller l'app par un code PIN</Text>
            <Text style={styles.help}>Un code a 4 chiffres est demande a l'ouverture.</Text>
          </View>
          <Switch value={pinOn} onValueChange={onTogglePin} trackColor={{ false: colors.s4, true: evTheme.accent }} thumbColor={pinOn ? evTheme.accentDark : '#888'} />
        </View>
        {pinOn ? <Button label="Verrouiller maintenant" icon="lock" variant="secondary" onPress={() => lock()} /> : null}
      </Card>

      {/* Synchronisation */}
      <Card style={styles.card}>
        <SectionHeader title="SYNCHRONISATION" help="Vos operations sont enregistrees meme hors ligne, puis envoyees des le retour du reseau." />
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>
              {pendingCount > 0 ? `${pendingCount} operation(s) en attente` : 'Tout est synchronise'}
            </Text>
            <Text style={styles.help}>{online ? 'Reseau disponible' : 'Hors ligne'}</Text>
          </View>
          <View style={[styles.dot, { backgroundColor: online ? colors.green2 : colors.red }]} />
        </View>
        {pendingCount > 0 ? <Button label="Synchroniser maintenant" icon="refresh-cw" variant="secondary" loading={syncing} disabled={!online} onPress={syncNow} /> : null}
      </Card>
      </>
      ) : null}

      {/* ===== Onglet Apparence ===== */}
      {tab === 'appr' ? (
      <>
      {/* Theme evenementiel (accent + fond de toute l'app) */}
      <Card style={styles.card}>
        <SectionHeader
          title="THEME DE L'APP"
          help="Change la couleur d'accent et le fond de toute l'application selon un evenement (Octobre Rose, Novembre Bleu...). Applique aussitot et memorise."
        />
        <View style={styles.eventGrid}>
          {evTheme.presets.map((p) => {
            const on = p.key === evTheme.key;
            return (
              <Pressable
                key={p.key}
                style={[styles.eventItem, on && { borderColor: p.accent, backgroundColor: p.accentSoftBg }]}
                onPress={() => applyEventTheme(p.key)}
                disabled={savingEvent}
                accessibilityLabel={p.label}
              >
                <View style={[styles.eventSwatch, { backgroundColor: p.preview }]}>
                  {on ? <Icon name="check" size={16} color={colors.onColor} /> : null}
                </View>
                <Text style={[styles.eventName, on && { color: colors.tx }]} numberOfLines={1}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* Fond de l'application (uni doux, palette sobre ou image discrete) */}
      <Card style={styles.card}>
        <SectionHeader
          title="FOND DE L'APP"
          help="Un fond sobre derriere les ecrans. Les cartes restent blanches et lisibles. Par defaut, le fond suit le theme choisi."
        />
        <View style={styles.bgGrid}>
          {/* Fond par defaut (suit le theme evenementiel) */}
          <Pressable
            style={[styles.bgItem, evTheme.backgroundPref.type === 'default' && { borderColor: evTheme.accent }]}
            onPress={() => applyBackground({ type: 'default' })}
            disabled={bgBusy}
            accessibilityLabel="Fond par defaut du theme"
          >
            <View style={[styles.bgSwatch, { backgroundColor: evTheme.bg }]}>
              <Icon name="star" size={14} color={evTheme.accentDark} />
            </View>
            <Text style={styles.bgName} numberOfLines={1}>Theme</Text>
          </Pressable>

          {/* Palette de fonds unis sobres */}
          {BACKGROUND_PALETTES.map((p) => {
            const on = evTheme.backgroundPref.type === 'palette' && evTheme.backgroundPref.key === p.key;
            return (
              <Pressable
                key={p.key}
                style={[styles.bgItem, on && { borderColor: evTheme.accent }]}
                onPress={() => applyBackground({ type: 'palette', key: p.key })}
                disabled={bgBusy}
                accessibilityLabel={p.label}
              >
                <View style={[styles.bgSwatch, { backgroundColor: p.color }]}>
                  {on ? <Icon name="check" size={14} color={evTheme.accentDark} /> : null}
                </View>
                <Text style={styles.bgName} numberOfLines={1}>{p.label}</Text>
              </Pressable>
            );
          })}

          {/* Image importee (apercu si active) */}
          <Pressable
            style={[styles.bgItem, evTheme.backgroundPref.type === 'image' && { borderColor: evTheme.accent }]}
            onPress={importBackgroundImage}
            disabled={bgBusy}
            accessibilityLabel="Importer une image de fond"
          >
            <View style={[styles.bgSwatch, styles.bgSwatchImage]}>
              {evTheme.backgroundPref.type === 'image' ? (
                <Image source={{ uri: evTheme.backgroundPref.uri }} style={styles.bgSwatchImg} />
              ) : (
                <Icon name="image" size={16} color={colors.tx3} />
              )}
            </View>
            <Text style={styles.bgName} numberOfLines={1}>Image</Text>
          </Pressable>
        </View>

        {evTheme.backgroundPref.type === 'image' ? (
          <Button label="Retirer l'image de fond" icon="x" variant="ghost" onPress={() => applyBackground({ type: 'default' })} />
        ) : null}
      </Card>

      {/* Preference de theme clair/sombre (memorisee) */}
      <Card style={styles.card}>
        <SectionHeader title="CLAIR OU SOMBRE" help="La caisse utilise le theme clair premium. Votre preference est enregistree." />
        <Segmented items={[{ key: 'light', label: 'Clair' }, { key: 'dark', label: 'Sombre' }]} value={theme} onChange={setThemePref} />
      </Card>
      </>
      ) : null}

      {/* ===== Onglet Compte : Session ===== */}
      {tab === 'acc' ? (
      <Card style={styles.card}>
        <SectionHeader title="SESSION" help={m?.phone ? `Connecte avec le numero ${maskLabel(m.phone)}.` : undefined} />
        <View style={styles.actions}>
          <Button label="Plus d'outils" icon="grid" variant="secondary" onPress={() => navigation.navigate('More')} />
          <Button label="Se deconnecter" icon="log-out" variant="danger" onPress={logout} />
        </View>
        <Text style={styles.version}>MySargal v{version}</Text>
      </Card>
      ) : null}

      {/* Modal PIN */}
      <Modal visible={pinModal} animationType="slide" transparent onRequestClose={() => setPinModal(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCardCenter}>
            <Text style={styles.modalTitle}>{pinStep === 'set' ? 'Choisis un code PIN' : 'Confirme le code'}</Text>
            <Text style={styles.modalSub}>{pinStep === 'set' ? 'Un code a 4 chiffres.' : 'Saisis a nouveau le meme code.'}</Text>
            <PinPad value={pinValue} onChange={setPinValue} error={pinError} />
            <Pressable onPress={() => setPinModal(false)} style={styles.cancel}><Text style={styles.cancelTxt}>Annuler</Text></Pressable>
          </View>
        </View>
      </Modal>

      {/* Modal branche */}
      <Modal visible={branchModal} animationType="slide" transparent onRequestClose={() => setBranchModal(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Nouvelle boutique</Text>
            <Field label="Nom de la boutique" value={bName} onChangeText={setBName} containerStyle={{ marginTop: 12 }} />
            <Button label="Creer" onPress={doCreateBranch} loading={branchBusy} style={{ marginTop: 12 }} />
            <Pressable onPress={() => setBranchModal(false)} style={styles.cancel}><Text style={styles.cancelTxt}>Annuler</Text></Pressable>
          </View>
        </View>
      </Modal>

      {/* Modal caissier */}
      <Modal visible={cashierModal} animationType="slide" transparent onRequestClose={() => setCashierModal(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Nouveau caissier</Text>
            <Field label="Nom" value={cName} onChangeText={setCName} containerStyle={{ marginTop: 12 }} />
            <Field label="Code PIN (4 chiffres)" value={cPin} onChangeText={(t) => setCPin(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" containerStyle={{ marginTop: 12 }} />
            <Button label="Ajouter" onPress={doAddCashier} loading={branchBusy} style={{ marginTop: 12 }} />
            <Pressable onPress={() => setCashierModal(false)} style={styles.cancel}><Text style={styles.cancelTxt}>Annuler</Text></Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

// En-tete de carte uniforme : un micro-label en petites capitales espacees, et
// une courte phrase d'aide optionnelle. Donne le meme rythme a toutes les
// sections de l'ecran.
function SectionHeader({ title, help }: { title: string; help?: string }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.cardTitle}>{title}</Text>
      {help ? <Text style={styles.help}>{help}</Text> : null}
    </View>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme();
  return (
    <View style={styles.rowBetween}>
      <Text style={styles.switchLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: colors.s4, true: t.accent }} thumbColor={value ? t.accentDark : '#888'} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: spacing.xxxl },
  // La rangee de chips ne doit PAS s'etirer verticalement : flexGrow 0 borne la
  // hauteur du ScrollView a celle des chips (evite l'effet "marshmallow").
  chipsScroll: { flexGrow: 0, alignSelf: 'stretch' },
  chipsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    paddingVertical: 0,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.b2,
    backgroundColor: colors.s2,
  },
  chipTxt: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.tx2, lineHeight: 16 },
  thresholdRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thresholdInput: { width: 84 },
  thresholdTxt: { fontFamily: fonts.heading, fontSize: 18, textAlign: 'center' },
  thresholdEq: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.tx3 },
  card: { gap: 14 },
  // En-tete de section : micro-label en petites capitales espacees + aide courte.
  sectionHead: { gap: 4 },
  cardTitle: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.tx2, letterSpacing: 1.4, textTransform: 'uppercase' },
  // Pile de boutons d'action au bas d'une carte, espacement regulier.
  actions: { gap: 10, marginTop: 2 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  help: { fontFamily: fonts.body, fontSize: 12, color: colors.tx3, lineHeight: 18 },
  label: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.tx3, letterSpacing: 0.6, textTransform: 'uppercase' },
  fieldGroup: { gap: 7 },
  switchLabel: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.tx },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logo: { width: 64, height: 64, borderRadius: 16, backgroundColor: colors.s3 },
  logoEmpty: { alignItems: 'center', justifyContent: 'center' },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  preset: { alignItems: 'center', gap: 4, width: '21%' },
  presetSwatch: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.b2 },
  presetName: { fontFamily: fonts.body, fontSize: 10, color: colors.tx3 },
  eventGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  eventItem: {
    flexGrow: 1,
    flexBasis: '30%',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.b2,
    backgroundColor: colors.s2,
  },
  eventSwatch: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  eventName: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.tx2, textAlign: 'center' },
  bgGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  bgItem: {
    width: '22%',
    minWidth: 68,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.b2,
    backgroundColor: colors.s2,
  },
  bgSwatch: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.b2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bgSwatchImage: { backgroundColor: colors.s3 },
  bgSwatchImg: { width: '100%', height: '100%' },
  bgName: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.tx2, textAlign: 'center' },
  brandPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: colors.b2 },
  addLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addLink: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.tx },
  branchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.b1 },
  branchName: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.tx },
  branchSwitch: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.tx },
  keyBox: { backgroundColor: colors.s3, borderRadius: radius.md, borderWidth: 1, borderColor: colors.b2, padding: 12 },
  keyTxt: { fontFamily: fonts.mono, fontSize: 12, color: colors.tx },
  webhook: { fontFamily: fonts.mono, fontSize: 11, color: colors.tx3 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  version: { fontFamily: fonts.mono, fontSize: 11, color: colors.tx3, textAlign: 'center', marginTop: 4 },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.s1, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, paddingBottom: 34, borderTopWidth: 1, borderColor: colors.b2 },
  modalCardCenter: { backgroundColor: colors.s1, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, paddingBottom: 40, alignItems: 'center', gap: 10, borderTopWidth: 1, borderColor: colors.b2 },
  modalTitle: { fontFamily: fonts.heading, fontSize: 20, color: colors.tx },
  modalSub: { fontFamily: fonts.body, fontSize: 13.5, color: colors.tx2, textAlign: 'center', marginBottom: 18 },
  cancel: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  cancelTxt: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.tx3 },
});
