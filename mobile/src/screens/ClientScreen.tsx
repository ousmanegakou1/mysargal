// ============================================================
// MySargal Caisse - Fiche client
// Points, statut/tier, progression vers la recompense.
// Actions : Crediter un achat (montant ou points, apercu live) et Remettre
// une recompense. Chaque action fonctionne hors ligne (file d'attente).
// ============================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppBackground } from '../components/AppBackground';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RootStackParamList } from '../navigation/types';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/Avatar';
import { ProgressBar } from '../components/ProgressBar';
import { TierBadge, StatusBadge } from '../components/StatusBadge';
import { Loading } from '../components/Loading';
import { SuccessOverlay } from '../components/SuccessCheck';
import { PressableScale } from '../components/PressableScale';
import { PageHeader } from '../components/PageHeader';
import { AnimatedCounter } from '../components/AnimatedCounter';
import { AnimatedListItem } from '../components/AnimatedListItem';
import { useToast } from '../components/Toast';
import { colors, fonts, radius, spacing, shadow } from '../theme';
import { useTheme } from '../theme/ThemeProvider';

import { useAuth } from '../auth/AuthContext';
import { useAppStore } from '../store/appStore';
import { useQueue } from '../offline/queue';
import { useNetwork } from '../offline/NetworkProvider';
import { getPoints, addPoints, redeemReward, fetchRewards, findCardByCode, revealPhone, deactivateCard, syncWallet, fetchTiers } from '../api/endpoints';
import { CardLookup, Reward, ApiError, SargalTier } from '../api/types';
import { fmtPts, fmtMoney, maskLabel } from '../utils/format';
import { isAmountMode, fcfaPerPoint, ptsFromAmount, quickValues } from '../utils/points';
import { WA_MESSAGES, openWhatsApp, openSMS, callPhone, cardUrl, firstName } from '../utils/wa';
import { notifySuccess, tapLight } from '../utils/haptics';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Client'>;
type Rt = RouteProp<RootStackParamList, 'Client'>;

export function ClientScreen() {
  const navigation = useNavigation<Nav>();
  const theme = useTheme();
  const route = useRoute<Rt>();
  const { merchant } = useAuth();
  const { toast } = useToast();
  const { online } = useNetwork();
  const cacheClient = useAppStore((s) => s.cacheClient);
  const updateClientPts = useAppStore((s) => s.updateClientPts);
  const addLocalOp = useAppStore((s) => s.addLocalOp);
  const enqueue = useQueue((s) => s.enqueue);

  const initialCard = route.params?.card || null;
  const code = route.params?.code || initialCard?.code || '';

  const [card, setCard] = useState<CardLookup | null>(initialCard);
  const [loading, setLoading] = useState(!initialCard);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [mode, setMode] = useState<'menu' | 'credit' | 'reward'>('menu');
  const [amountInput, setAmountInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [cardId, setCardId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [tiers, setTiers] = useState<SargalTier[]>([]);

  const amountMode = isAmountMode(merchant);
  const ratio = fcfaPerPoint(merchant);

  // Paliers Club Privileges de la boutique (statut Silver, Gold, etc.).
  useEffect(() => {
    if (!merchant || !online) return;
    fetchTiers(merchant.id).then(setTiers).catch(() => {});
  }, [merchant, online]);

  // Statut actuel du client selon ses points cumules.
  const currentTier = useMemo(() => pickTier(tiers, card?.lifetime_pts ?? 0), [tiers, card?.lifetime_pts]);
  const nextTier = useMemo(() => pickNextTier(tiers, card?.lifetime_pts ?? 0), [tiers, card?.lifetime_pts]);

  const load = useCallback(async () => {
    if (!merchant || !code) return;
    if (!online) return; // hors ligne : on garde la carte fournie
    try {
      const fresh = await getPoints(code, merchant.id);
      setCard(fresh);
      cacheClient(fresh);
    } catch (e) {
      const err = e as ApiError;
      if (!initialCard) toast(err.message || 'Carte introuvable', 'error');
    } finally {
      setLoading(false);
    }
  }, [merchant, code, online, cacheClient, initialCard, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (merchant && online) {
      fetchRewards(merchant.id).then(setRewards).catch(() => {});
      if (code) {
        findCardByCode(code, merchant.id).then((row) => row && setCardId(row.id)).catch(() => {});
      }
    }
  }, [merchant, online, code]);

  // --- Actions contact / carte ---
  const ensureRevealed = async (motif: string): Promise<string | null> => {
    if (revealed) return revealed;
    if (!cardId) return null;
    try {
      const p = await revealPhone(cardId, motif, null);
      setRevealed(p);
      return p;
    } catch {
      return null;
    }
  };
  const doWhatsApp = async () => {
    if (!merchant || !card) return;
    setActionBusy(true);
    const p = await ensureRevealed('Envoi de la carte par WhatsApp');
    setActionBusy(false);
    openWhatsApp(p, WA_MESSAGES.carte(firstName(card.client_name), merchant.name, cardUrl(card.code)));
  };
  const doSMS = async () => {
    if (!merchant || !card) return;
    setActionBusy(true);
    const p = await ensureRevealed('Envoi de la carte par SMS');
    setActionBusy(false);
    if (!p) { toast('Numero indisponible.', 'warn'); return; }
    openSMS(p, WA_MESSAGES.carte(firstName(card.client_name), merchant.name, cardUrl(card.code)));
  };
  const doCall = async () => {
    setActionBusy(true);
    const p = await ensureRevealed('Appel client depuis la fiche');
    setActionBusy(false);
    if (!p) { toast('Numero indisponible.', 'warn'); return; }
    callPhone(p);
  };
  const doReveal = async () => {
    setActionBusy(true);
    const p = await ensureRevealed('Consultation depuis la fiche client');
    setActionBusy(false);
    if (!p) toast('Numero indisponible.', 'warn');
  };
  const doDeactivate = async () => {
    if (!cardId) { toast('Carte non identifiee.', 'warn'); return; }
    setActionBusy(true);
    try {
      await deactivateCard(cardId);
      toast('Carte desactivee.', 'success');
      navigation.goBack();
    } catch (e) {
      toast((e as ApiError).message || 'Desactivation impossible', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const previewPts = useMemo(() => {
    const n = parseInt(amountInput.replace(/\D/g, '') || '0', 10);
    if (amountMode) return ptsFromAmount(n, merchant);
    return n;
  }, [amountInput, amountMode, merchant]);

  if (loading && !card) {
    return <Loading label="Chargement de la fiche..." />;
  }

  if (!card) {
    return (
      <SafeAreaView style={styles.notFound}>
        <Icon name="search" size={44} color={colors.tx3} />
        <Text style={styles.nfTitle}>Carte introuvable</Text>
        <Button label="Retour" onPress={() => navigation.goBack()} full={false} variant="secondary" />
      </SafeAreaView>
    );
  }

  const threshold = card.merchant?.threshold || merchant?.threshold || 10;
  const pct = Math.min(100, Math.round((card.pts / threshold) * 100));
  const remaining = Math.max(0, threshold - card.pts);
  const rewardDesc = card.merchant?.reward_desc || merchant?.reward_desc || 'Recompense';

  // --- Crediter un achat ---
  const doCredit = async () => {
    const amountNum = parseInt(amountInput.replace(/\D/g, '') || '0', 10);
    if (!merchant) return;
    if (amountMode) {
      if (!amountNum || amountNum < ratio) {
        toast(`Montant minimum : ${fmtMoney(ratio)}`, 'warn');
        return;
      }
    } else if (!amountNum || amountNum < 1) {
      toast('Entre un nombre de points valide.', 'warn');
      return;
    }
    const pts = amountMode ? ptsFromAmount(amountNum, merchant) : amountNum;
    if (pts < 1) {
      toast('Ce montant ne donne aucun point.', 'warn');
      return;
    }
    const note = amountMode ? `Achat ${fmtMoney(amountNum, merchant.currency || 'FCFA')}` : 'Achat';

    setSubmitting(true);
    try {
      if (!online) {
        // Hors ligne : file d'attente + mise a jour optimiste.
        enqueue({
          type: 'credit',
          cardCode: card.code,
          clientName: card.client_name || undefined,
          merchantId: merchant.id,
          pts,
          note,
          source: 'manual',
          cashierId: null,
          rewardId: null,
        });
        const newPts = card.pts + pts;
        setCard({ ...card, pts: newPts, lifetime_pts: card.lifetime_pts + pts });
        updateClientPts(card.code, newPts, card.lifetime_pts + pts);
        addLocalOp({ cardCode: card.code, clientName: card.client_name || undefined, type: 'credit', pts, note, pending: true });
        notifySuccess();
        toast(`+${fmtPts(pts)} pts mis en attente (hors ligne)`, 'success');
        resetCredit();
        return;
      }

      const res = await addPoints({
        card_code: card.code,
        merchant_id: merchant.id,
        pts,
        note,
        source: 'manual',
        cashier_id: null,
      });
      const newCard: CardLookup = {
        ...card,
        pts: res.pts_total,
        lifetime_pts: res.lifetime_pts,
        tier: res.tier,
        reward_ready: res.reward_ready,
        remaining_pts: Math.max(0, threshold - res.pts_total),
        progress_pct: Math.min(100, Math.round((res.pts_total / threshold) * 100)),
      };
      setCard(newCard);
      cacheClient(newCard);
      addLocalOp({ cardCode: card.code, clientName: card.client_name || undefined, type: 'credit', pts: res.pts_added, note, pending: false });
      setCelebrate(true);
      syncWallet(card.code);
      let msg = `+${fmtPts(res.pts_added)} pts`;
      if (res.boost_x) msg += ` (boost x${res.boost_x})`;
      if (res.just_unlocked) msg += ` - Recompense debloquee !`;
      toast(msg, 'success');
      resetCredit();
    } catch (e) {
      const err = e as ApiError;
      toast(err.message || 'Credit impossible', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const resetCredit = () => {
    setAmountInput('');
    setMode('menu');
  };

  // --- Remettre une recompense ---
  const doRedeem = async (reward?: Reward) => {
    if (!merchant) return;
    const cost = reward?.pts_cost || threshold;
    if (card.pts < cost) {
      toast(`Points insuffisants (${fmtPts(card.pts)}/${fmtPts(cost)}).`, 'warn');
      return;
    }
    setSubmitting(true);
    try {
      if (!online) {
        enqueue({
          type: 'reward',
          cardCode: card.code,
          clientName: card.client_name || undefined,
          merchantId: merchant.id,
          rewardId: reward?.id || null,
          rewardName: reward?.name || rewardDesc,
        });
        const newPts = card.pts - cost;
        setCard({ ...card, pts: newPts });
        updateClientPts(card.code, newPts);
        addLocalOp({ cardCode: card.code, clientName: card.client_name || undefined, type: 'reward', pts: -cost, note: reward?.name || rewardDesc, pending: true });
        notifySuccess();
        toast('Recompense mise en attente (hors ligne)', 'success');
        setMode('menu');
        return;
      }

      const res = await redeemReward(card.code, merchant.id, reward?.id || null);
      const newCard: CardLookup = {
        ...card,
        pts: res.pts_remaining,
        reward_ready: res.pts_remaining >= threshold,
        remaining_pts: Math.max(0, threshold - res.pts_remaining),
        progress_pct: Math.min(100, Math.round((res.pts_remaining / threshold) * 100)),
      };
      setCard(newCard);
      cacheClient(newCard);
      addLocalOp({ cardCode: card.code, clientName: card.client_name || undefined, type: 'reward', pts: -res.pts_used, note: res.reward || rewardDesc, pending: false });
      setCelebrate(true);
      toast(`Recompense remise : ${res.reward || rewardDesc}`, 'success');
      setMode('menu');
    } catch (e) {
      const err = e as ApiError;
      toast(err.message || 'Remise impossible', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppBackground />
      <SafeAreaView style={styles.flex} edges={['top']}>
        {/* Barre haut */}
        <PageHeader
          style={styles.navBar}
          right={card.reward_ready ? <StatusBadge label="Recompense prete" tone="gold" icon="gift" small /> : undefined}
        />

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* En-tete client */}
          <View style={styles.clientHead}>
            <Avatar name={card.client_name} size={64} />
            <View style={{ flex: 1 }}>
              <Text style={styles.clientName} numberOfLines={1}>
                {card.client_name || 'Client'}
              </Text>
              <Text style={styles.clientCode}>{card.code}</Text>
              {card.client_phone ? (
                <Text style={styles.clientPhone}>{maskLabel(card.client_phone)}</Text>
              ) : null}
            </View>
            {currentTier ? (
              <View
                style={[
                  styles.tierChip,
                  { backgroundColor: (currentTier.color_hex || theme.accent) + '22', borderColor: currentTier.color_hex || theme.accent },
                ]}
              >
                <Icon name="award" size={13} color={currentTier.color_hex || theme.accentDark} />
                <Text style={[styles.tierChipTxt, { color: currentTier.color_hex || theme.accentDark }]} numberOfLines={1}>
                  {currentTier.name}
                </Text>
              </View>
            ) : (
              <TierBadge tier={card.tier} />
            )}
          </View>

          {currentTier ? (
            <Text style={styles.tierHint}>
              {nextTier
                ? `Statut ${currentTier.name} · encore ${fmtPts(Math.max(0, (nextTier.min_points || 0) - (card.lifetime_pts || 0)))} pts pour ${nextTier.name}`
                : `Statut ${currentTier.name} · niveau maximum atteint`}
            </Text>
          ) : null}

          {/* Bloc points */}
          <Card elevated style={styles.pointsCard}>
            <View style={styles.ptsRow}>
              <View>
                <AnimatedCounter value={card.pts} style={[styles.ptsValue, { color: theme.accentDark }]} group />
                <Text style={styles.ptsLabel}>points disponibles</Text>
              </View>
              <View style={styles.lifetimeBox}>
                <Text style={styles.lifetimeVal}>{fmtPts(card.lifetime_pts)}</Text>
                <Text style={styles.lifetimeLbl}>cumul total</Text>
              </View>
            </View>

            <View style={styles.progressBlock}>
              <ProgressBar pct={pct} ready={card.reward_ready} height={14} />
              <View style={styles.progressLabels}>
                {card.reward_ready ? (
                  <View style={styles.readyRow}>
                    <Icon name="gift" size={14} color={colors.gold} />
                    <Text style={styles.readyTxt}>{rewardDesc} - prete a remettre</Text>
                  </View>
                ) : (
                  <Text style={styles.remainTxt}>
                    Encore {fmtPts(remaining)} pts pour : {rewardDesc}
                  </Text>
                )}
                <Text style={styles.pctTxt}>{pct}%</Text>
              </View>
            </View>
          </Card>

          {/* Actions */}
          {mode === 'menu' ? (
            <View style={styles.actions}>
              <Button label="Crediter un achat" icon="plus" onPress={() => setMode('credit')} large />
              <Button
                label="Remettre une recompense"
                icon="gift"
                variant={card.reward_ready ? 'gold' : 'secondary'}
                onPress={() => setMode('reward')}
                disabled={card.pts < (rewards[0]?.pts_cost || threshold)}
              />

              {/* Contact / carte */}
              <Card style={styles.contactCard}>
                <View style={styles.contactHead}>
                  <Text style={styles.contactTitle}>Contact</Text>
                  {revealed ? (
                    <Text style={[styles.contactPhone, { color: theme.accentDark }]}>{revealed}</Text>
                  ) : (
                    <Pressable onPress={doReveal} disabled={actionBusy} style={styles.revealRow}>
                      <Icon name="eye" size={13} color={colors.tx2} />
                      <Text style={styles.reveal}>Reveler le telephone</Text>
                    </Pressable>
                  )}
                </View>
                <View style={styles.contactRow}>
                  <Pressable style={styles.contactBtn} onPress={doWhatsApp} disabled={actionBusy}><Icon name="message-circle" size={16} color={theme.accentDark} /><Text style={styles.contactBtnTxt}>WhatsApp</Text></Pressable>
                  <Pressable style={styles.contactBtn} onPress={doSMS} disabled={actionBusy}><Icon name="mail" size={16} color={theme.accentDark} /><Text style={styles.contactBtnTxt}>SMS</Text></Pressable>
                  <Pressable style={styles.contactBtn} onPress={doCall} disabled={actionBusy}><Icon name="phone" size={16} color={theme.accentDark} /><Text style={styles.contactBtnTxt}>Appeler</Text></Pressable>
                </View>
                <Pressable onPress={doDeactivate} disabled={actionBusy} style={styles.deactivate}>
                  <Text style={styles.deactivateTxt}>Desactiver la carte</Text>
                </Pressable>
              </Card>
            </View>
          ) : null}

          {/* Formulaire credit */}
          {mode === 'credit' ? (
            <Card style={styles.formCard}>
              <View style={styles.formHead}>
                <Text style={styles.formTitle}>
                  {amountMode ? 'Montant de l\'achat' : 'Points a crediter'}
                </Text>
                <Pressable onPress={resetCredit}>
                  <Text style={styles.cancelTxt}>Annuler</Text>
                </Pressable>
              </View>

              <Field
                value={amountInput}
                onChangeText={(t) => setAmountInput(t.replace(/\D/g, ''))}
                placeholder={amountMode ? 'ex : 5000' : 'ex : 1'}
                keyboardType="number-pad"
                prefix={amountMode ? (merchant?.currency || 'FCFA') : 'pts'}
                autoFocus
              />

              {amountMode && previewPts > 0 ? (
                <View style={[styles.previewBox, { backgroundColor: theme.accentSoftBg, borderColor: theme.accentBorder }]}>
                  <Text style={[styles.previewTxt, { color: theme.accentDark }]}>
                    = {fmtPts(previewPts)} point{previewPts > 1 ? 's' : ''}
                  </Text>
                  <Text style={styles.previewSub}>1 point pour {fmtMoney(ratio)}</Text>
                </View>
              ) : null}

              <View style={styles.quickRow}>
                {quickValues(merchant).map((v) => (
                  <PressableScale
                    key={v}
                    style={styles.quick}
                    onPress={() => setAmountInput(String(v))}
                    accessibilityLabel={`Montant ${v}`}
                  >
                    <Text style={styles.quickTxt}>
                      {amountMode ? (v >= 1000 ? `${v / 1000}k` : v) : `+${v}`}
                    </Text>
                  </PressableScale>
                ))}
              </View>

              <Button
                label={
                  amountMode && previewPts > 0
                    ? `Crediter ${fmtPts(previewPts)} pts`
                    : 'Crediter'
                }
                onPress={doCredit}
                loading={submitting}
                disabled={previewPts < 1}
                large
                style={{ marginTop: 6 }}
              />
              {!online ? (
                <Text style={styles.offlineNote}>
                  Hors ligne : l'operation sera envoyee au retour du reseau.
                </Text>
              ) : null}
            </Card>
          ) : null}

          {/* Choix de recompense */}
          {mode === 'reward' ? (
            <Card style={styles.formCard}>
              <View style={styles.formHead}>
                <Text style={styles.formTitle}>Remettre une recompense</Text>
                <Pressable onPress={() => setMode('menu')}>
                  <Text style={styles.cancelTxt}>Annuler</Text>
                </Pressable>
              </View>

              {rewards.length ? (
                <View style={styles.rewardList}>
                  {rewards.map((r, i) => {
                    const ok = card.pts >= r.pts_cost;
                    return (
                      <AnimatedListItem key={r.id} index={i}>
                        <PressableScale
                          disabled={!ok || submitting}
                          style={[styles.rewardItem, !ok && styles.rewardItemOff]}
                          onPress={() => doRedeem(r)}
                          accessibilityLabel={r.name}
                        >
                          <View style={[styles.rewardIcon, { backgroundColor: theme.accentSoftBg }]}><Icon name="gift" size={18} color={theme.accentDark} /></View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.rewardName}>{r.name}</Text>
                            <Text style={styles.rewardCost}>{fmtPts(r.pts_cost)} pts</Text>
                          </View>
                          {ok ? (
                            <Text style={[styles.rewardGo, { color: theme.accentDark }]}>Remettre ›</Text>
                          ) : (
                            <Text style={styles.rewardLock}>
                              {fmtPts(r.pts_cost - card.pts)} pts manquants
                            </Text>
                          )}
                        </PressableScale>
                      </AnimatedListItem>
                    );
                  })}
                </View>
              ) : (
                <View style={{ gap: 12 }}>
                  <Text style={styles.defaultReward}>
                    Recompense par defaut : {rewardDesc} ({fmtPts(threshold)} pts)
                  </Text>
                  <Button
                    label={`Remettre (${fmtPts(threshold)} pts)`}
                    variant="gold"
                    onPress={() => doRedeem()}
                    loading={submitting}
                    disabled={card.pts < threshold}
                  />
                </View>
              )}
              {!online ? (
                <Text style={styles.offlineNote}>
                  Hors ligne : la remise sera synchronisee au retour du reseau.
                </Text>
              ) : null}
            </Card>
          ) : null}
        </ScrollView>
      </SafeAreaView>
      <SuccessOverlay
        show={celebrate}
        title="Operation reussie"
        onDone={() => setCelebrate(false)}
      />
    </View>
  );
}

// Palier actuel = celui de plus haut seuil que le cumul du client atteint.
function pickTier(tiers: SargalTier[], lifetimePts: number): SargalTier | null {
  const eligibles = (tiers || [])
    .filter((t) => (t.min_points || 0) <= lifetimePts)
    .sort((a, b) => (b.min_points || 0) - (a.min_points || 0));
  return eligibles[0] || null;
}

// Palier suivant = celui de plus bas seuil encore au-dessus du cumul.
function pickNextTier(tiers: SargalTier[], lifetimePts: number): SargalTier | null {
  const suivants = (tiers || [])
    .filter((t) => (t.min_points || 0) > lifetimePts)
    .sort((a, b) => (a.min_points || 0) - (b.min_points || 0));
  return suivants[0] || null;
}

const styles = StyleSheet.create({
  tierChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1.5,
    maxWidth: 120,
  },
  tierChipTxt: { fontFamily: fonts.bodyBold, fontSize: 12.5 },
  tierHint: { fontFamily: fonts.bodySemi, fontSize: 12.5, color: colors.tx2, marginTop: 10, marginBottom: 2 },
  root: { flex: 1 },
  flex: { flex: 1 },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: 10 },
  backBtn: { paddingVertical: 6, paddingRight: 12 },
  backTxt: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.tx },
  scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  clientHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  clientName: { fontFamily: fonts.heading, fontSize: 22, color: colors.tx, letterSpacing: -0.4 },
  clientCode: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.tx2, marginTop: 3 },
  clientPhone: { fontFamily: fonts.body, fontSize: 12.5, color: colors.tx3, marginTop: 2 },
  pointsCard: { gap: 18 },
  ptsRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  ptsValue: { fontFamily: fonts.heading, fontSize: 46, color: colors.tx, letterSpacing: -1, lineHeight: 48 },
  ptsLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.tx3, marginTop: 2 },
  lifetimeBox: { alignItems: 'flex-end' },
  lifetimeVal: { fontFamily: fonts.headingBold, fontSize: 18, color: colors.tx2 },
  lifetimeLbl: { fontFamily: fonts.mono, fontSize: 10, color: colors.tx3, marginTop: 2 },
  progressBlock: { gap: 10 },
  progressLabels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  readyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  readyTxt: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.gold, flex: 1 },
  remainTxt: { fontFamily: fonts.bodySemi, fontSize: 12.5, color: colors.tx2, flex: 1 },
  pctTxt: { fontFamily: fonts.mono, fontSize: 12, color: colors.tx2, marginLeft: 8 },
  actions: { gap: 12 },
  contactCard: { gap: 12, marginTop: 4 },
  contactHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  contactTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.tx },
  contactPhone: { fontFamily: fonts.mono, fontSize: 13, color: colors.tx },
  revealRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  reveal: { fontFamily: fonts.bodySemi, fontSize: 12.5, color: colors.tx2 },
  contactRow: { flexDirection: 'row', gap: 8 },
  contactBtn: { flex: 1, flexDirection: 'row', gap: 5, backgroundColor: colors.s3, borderRadius: radius.md, borderWidth: 1, borderColor: colors.b2, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  contactBtnTxt: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.tx2 },
  deactivate: { alignItems: 'center', paddingVertical: 6 },
  deactivateTxt: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.red },
  formCard: { gap: 14 },
  formHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  formTitle: { fontFamily: fonts.headingBold, fontSize: 17, color: colors.tx },
  cancelTxt: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.tx3 },
  previewBox: { backgroundColor: colors.s4, borderRadius: radius.md, borderWidth: 1, borderColor: colors.b3, paddingVertical: 12, paddingHorizontal: 14 },
  previewTxt: { fontFamily: fonts.heading, fontSize: 20, color: colors.tx },
  previewSub: { fontFamily: fonts.body, fontSize: 12, color: colors.tx2, marginTop: 2 },
  quickRow: { flexDirection: 'row', gap: 8 },
  quick: {
    flex: 1,
    backgroundColor: colors.s3,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.b2,
    paddingVertical: 14,
    alignItems: 'center',
  },
  quickTxt: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.tx },
  offlineNote: { fontFamily: fonts.body, fontSize: 12, color: colors.gold, textAlign: 'center' },
  rewardList: { gap: 10 },
  rewardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.s3,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.b2,
    padding: 14,
  },
  rewardItemOff: { opacity: 0.5 },
  rewardIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.s4, borderWidth: 1, borderColor: colors.b2 },
  rewardName: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.tx },
  rewardCost: { fontFamily: fonts.mono, fontSize: 12, color: colors.tx2, marginTop: 2 },
  rewardGo: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.tx },
  rewardLock: { fontFamily: fonts.body, fontSize: 11.5, color: colors.tx3, maxWidth: 90, textAlign: 'right' },
  defaultReward: { fontFamily: fonts.body, fontSize: 14, color: colors.tx2, lineHeight: 20 },
  notFound: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 14 },
  nfIcon: { fontSize: 44 },
  nfTitle: { fontFamily: fonts.heading, fontSize: 20, color: colors.tx },
});
