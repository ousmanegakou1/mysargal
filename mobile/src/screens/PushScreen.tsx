// ============================================================
// MySargal Caisse - Notifications / Campagnes
// Push (segments + image + modeles), relance WhatsApp "on vous revoit ?"
// (winback) par WhatsApp ou SMS, et preparation de l'email de lancement.
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, ActivityIndicator, Alert } from 'react-native';
import { Icon, IconName } from '../components/Icon';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/types';
import { Screen } from '../components/Screen';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { Button } from '../components/Button';
import { Segmented } from '../components/Segmented';
import { OfflineBanner } from '../components/OfflineBanner';
import { useToast } from '../components/Toast';
import { colors, fonts, radius, spacing } from '../theme';
import { useTheme } from '../theme/ThemeProvider';

import { useAuth } from '../auth/AuthContext';
import { useNetwork } from '../offline/NetworkProvider';
import {
  pushCount,
  pushAudience,
  pushHistory,
  pushSegmentCounts,
  sendPush,
  pushImage,
  fetchCards,
  fetchJournal,
  revealPhone,
  waSend,
  sendLaunchEmail,
} from '../api/endpoints';
import { PushAudience, PushHistoryRow, LoyaltyCardRow, JournalRow } from '../api/types';
import { PUSH_TEMPLATES, PUSH_SEGMENTS } from '../utils/push';
import { WA_MESSAGES, openWhatsApp, openSMS, firstName } from '../utils/wa';
import { fmtDate } from '../utils/format';
import { pickImage } from '../utils/image';
import { tapLight } from '../utils/haptics';
import { useAppStore } from '../store/appStore';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function PushScreen() {
  const navigation = useNavigation<Nav>();
  const { merchant } = useAuth();
  const { online } = useNetwork();
  const { toast } = useToast();
  const theme = useTheme();

  const inbox = useAppStore((s) => s.inbox);
  const markInboxRead = useAppStore((s) => s.markInboxRead);
  const clearInbox = useAppStore((s) => s.clearInbox);

  const [tab, setTab] = useState<'recues' | 'envoyer'>('recues');
  const [journal, setJournal] = useState<JournalRow[]>([]);
  const [journalLoading, setJournalLoading] = useState(false);

  const [count, setCount] = useState(0);
  const [audience, setAudience] = useState<PushAudience>({});
  const [history, setHistory] = useState<PushHistoryRow[]>([]);
  const [segCounts, setSegCounts] = useState<Record<string, number>>({});
  const [cards, setCards] = useState<LoyaltyCardRow[]>([]);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [image, setImage] = useState('');
  const [segment, setSegment] = useState('tous');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [waChannel, setWaChannel] = useState('wa');
  const [winbackBusy, setWinbackBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);

  const load = useCallback(async () => {
    if (!merchant || !online) return;
    pushCount(merchant.id).then(setCount).catch(() => {});
    pushAudience(merchant.id).then(setAudience).catch(() => {});
    pushHistory(merchant.id).then(setHistory).catch(() => {});
    fetchCards(merchant.id).then(setCards).catch(() => {});
    try {
      const r = await pushSegmentCounts(merchant.id);
      if (r.comptes) setSegCounts(r.comptes);
    } catch {
      /* comptes indisponibles */
    }
  }, [merchant, online]);

  useEffect(() => {
    load();
  }, [load]);

  // Journal d'activite de la boutique (ce qui se passe : cartes, points, recompenses).
  const loadJournal = useCallback(async () => {
    if (!merchant || !online) return;
    setJournalLoading(true);
    try {
      const rows = await fetchJournal(merchant.id, 30, 60);
      setJournal(rows);
    } catch {
      /* journal indisponible */
    } finally {
      setJournalLoading(false);
    }
  }, [merchant, online]);

  useEffect(() => {
    loadJournal();
  }, [loadJournal]);

  // Marque les notifications recues comme lues des qu'on ouvre l'onglet Reçues.
  useEffect(() => {
    if (tab === 'recues') markInboxRead();
  }, [tab, inbox.length, markInboxRead]);

  const applyTemplate = (key: string) => {
    const t = PUSH_TEMPLATES.find((x) => x.key === key);
    if (!t) return;
    tapLight();
    setTitle(t.title);
    setBody(t.body);
  };

  const chooseImage = async () => {
    if (!merchant) return;
    setUploading(true);
    try {
      const img = await pickImage(1080);
      if (!img) return;
      const uploadedUrl = await pushImage(merchant.id, img.base64DataUrl);
      setImage(uploadedUrl);
      toast('Image ajoutee.', 'success');
    } catch (e: any) {
      toast(e?.message || 'Image impossible', 'error');
    } finally {
      setUploading(false);
    }
  };

  const send = async () => {
    if (!merchant) return;
    if (!title.trim()) {
      toast('Entre un titre.', 'warn');
      return;
    }
    const n = segCounts[segment] ?? count;
    Alert.alert('Envoyer la notification', `Envoyer « ${title} » a : ${segLabel(segment)} (${n}) ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Envoyer',
        onPress: async () => {
          setSending(true);
          try {
            const r = await sendPush({
              merchant_id: merchant.id,
              title: title.trim(),
              body: body.trim(),
              url: url.trim() || 'https://mysargal.com/client-app/',
              image: image.trim(),
              segment,
            });
            const sent = r.sent ?? 0;
            if (sent > 0) {
              toast(`Envoyee a ${sent} client(s).`, 'success');
              setTitle('');
              setBody('');
              setImage('');
              load();
            } else {
              toast('Aucun destinataire joignable pour ce segment.', 'warn');
            }
          } catch (e: any) {
            toast(e?.message || 'Envoi impossible', 'error');
          } finally {
            setSending(false);
          }
        },
      },
    ]);
  };

  // Relance WhatsApp / SMS "on vous revoit ?" vers les clients presque prets.
  const runWinback = async () => {
    if (!merchant) return;
    const threshold = merchant.threshold || 10;
    const targets = cards.filter((c) => {
      const rem = threshold - (c.pts || 0);
      return rem >= 1 && rem <= 3;
    });
    if (!targets.length) {
      toast('Aucun client presque recompense.', 'warn');
      return;
    }
    Alert.alert(
      'Relance clients',
      `Envoyer une relance a ${Math.min(targets.length, 50)} client(s) presque recompense(s) par ${waChannel === 'wa' ? 'WhatsApp' : 'SMS'} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Envoyer',
          onPress: async () => {
            setWinbackBusy(true);
            let sent = 0;
            const smsPhones: string[] = [];
            try {
              for (const c of targets.slice(0, 50)) {
                let phone: string | null = null;
                try {
                  phone = await revealPhone(c.id, 'Relance client (campagne)', null);
                } catch {
                  phone = null;
                }
                if (!phone) continue;
                if (waChannel === 'wa') {
                  try {
                    await waSend({ to: phone, template: 'relance_client', body_params: [firstName(c.client_name), merchant.name] });
                    sent++;
                  } catch {
                    /* on continue */
                  }
                  await new Promise((r) => setTimeout(r, 900));
                } else {
                  smsPhones.push(phone);
                  sent++;
                }
              }
              if (waChannel === 'sms' && smsPhones.length) {
                // SMS groupe : un seul composeur adresse a tous les destinataires.
                openSMS(smsPhones.join(','), WA_MESSAGES.relance('cher client', merchant.name));
              }
              toast(
                sent > 0 ? `${sent} relance(s) preparee(s).` : 'Aucune relance envoyee.',
                sent > 0 ? 'success' : 'warn'
              );
            } finally {
              setWinbackBusy(false);
            }
          },
        },
      ]
    );
  };

  const composeBroadcast = () => {
    if (!merchant) return;
    openWhatsApp(null, WA_MESSAGES.relance('cher client', merchant.name));
  };

  // Email de lancement (Summit / send-launch-email).
  const prepareEmail = async (dry: boolean) => {
    const slug = (merchant as any)?.slug;
    if (!slug) {
      toast("Aucun identifiant boutique (slug) pour l'email.", 'warn');
      return;
    }
    setEmailBusy(true);
    try {
      const r = await sendLaunchEmail({ merchant_slug: slug, dry_run: dry, segment: 'all' });
      if (r.error) {
        toast(r.error, 'error');
        return;
      }
      toast(dry ? `Test : ${r.sent} destinataire(s) prets.` : `Email envoye a ${r.sent} client(s).`, 'success');
    } catch (e: any) {
      toast(e?.message || 'Email impossible', 'error');
    } finally {
      setEmailBusy(false);
    }
  };

  const unreadCount = inbox.reduce((n, x) => (x.read ? n : n + 1), 0);

  const segItems = PUSH_SEGMENTS.map((s) => ({
    key: s.key,
    label: segCounts[s.key] != null ? `${s.label} (${segCounts[s.key]})` : s.label,
  }));

  return (
    <Screen scroll padded keyboardAvoiding contentStyle={styles.content}>
      <PageHeader
        title="Notifications"
        subtitle={tab === 'recues' ? 'Ce qui se passe dans votre boutique.' : 'Touchez vos clients au bon moment.'}
      />

      <OfflineBanner />

      <Segmented
        items={[
          { key: 'recues', label: unreadCount > 0 ? `Reçues (${unreadCount})` : 'Reçues' },
          { key: 'envoyer', label: 'Envoyer' },
        ]}
        value={tab}
        onChange={(k) => setTab(k as 'recues' | 'envoyer')}
      />

      {tab === 'recues' && (
        <>
          {/* Notifications recues par le marchand */}
          <Card style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>Mes notifications</Text>
              {inbox.length > 0 ? (
                <Pressable onPress={clearInbox} hitSlop={8}>
                  <Text style={styles.clearTxt}>Effacer</Text>
                </Pressable>
              ) : null}
            </View>
            {inbox.length ? (
              inbox.map((n) => (
                <View key={n.id} style={styles.notifRow}>
                  <View style={[styles.notifDot, { backgroundColor: theme.accent }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.notifTitle} numberOfLines={1}>{n.title}</Text>
                    {n.body ? <Text style={styles.notifBody} numberOfLines={2}>{n.body}</Text> : null}
                    <Text style={styles.notifMeta}>{fmtDate(new Date(n.at).toISOString())}</Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.help}>Aucune notification reçue pour l'instant. Elles apparaîtront ici automatiquement.</Text>
            )}
          </Card>

          {/* Activite de la boutique */}
          <Card style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>Activité récente</Text>
              {journalLoading ? <ActivityIndicator color={theme.accent} /> : null}
            </View>
            {journal.length ? (
              journal.map((j, i) => (
                <View key={i} style={styles.actRow}>
                  <View style={[styles.actIcon, { backgroundColor: colors.s3 }]}>
                    <Icon name={journalIcon(j.categorie)} size={16} color={theme.accentDark} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actDetail} numberOfLines={2}>
                      {j.detail || j.categorie || 'Activité'}
                    </Text>
                    <Text style={styles.actMeta}>
                      {[j.qui, j.quand ? fmtDate(j.quand) : null].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </View>
              ))
            ) : !journalLoading ? (
              <Text style={styles.help}>Aucune activité récente.</Text>
            ) : null}
          </Card>
        </>
      )}

      {tab === 'envoyer' && (
      <>
      {/* Audience */}
      <View style={styles.audRow}>
        <Aud value={String(count)} label="Abonnes push" accent />
        <Aud value={String(audience.apple ?? 0)} label="iPhone" />
        <Aud value={String(audience.android ?? 0)} label="Android" />
      </View>

      {/* Modeles */}
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Modeles</Text>
        <View style={styles.tplRow}>
          {PUSH_TEMPLATES.map((t) => (
            <Pressable key={t.key} style={styles.tpl} onPress={() => applyTemplate(t.key)}>
              <Text style={styles.tplTxt}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      {/* Composer */}
      <Card style={styles.card}>
        <Field label={`Titre (${title.length}/60)`} value={title} onChangeText={(t) => setTitle(t.slice(0, 60))} placeholder="Titre de la notification" />
        <Field label={`Message (${body.length}/140)`} value={body} onChangeText={(t) => setBody(t.slice(0, 140))} placeholder="Votre message" multiline containerStyle={{ marginTop: 12 }} style={{ minHeight: 70 }} />
        <Field label="Lien (optionnel)" value={url} onChangeText={setUrl} placeholder="https://..." autoCapitalize="none" containerStyle={{ marginTop: 12 }} />

        {image ? (
          <View style={styles.imgPreview}>
            <Image source={{ uri: image }} style={styles.img} />
            <Pressable style={styles.imgRemove} onPress={() => setImage('')}>
              <Text style={styles.imgRemoveTxt}>Retirer l'image</Text>
            </Pressable>
          </View>
        ) : (
          <Button label="Ajouter une image" icon="image" variant="secondary" onPress={chooseImage} loading={uploading} style={{ marginTop: 12 }} />
        )}

        <View style={{ marginTop: 14 }}>
          <Text style={styles.label}>Cible</Text>
          <Segmented items={segItems} value={segment} onChange={setSegment} scroll />
        </View>

        <Button label="Envoyer la notification" icon="send" onPress={send} loading={sending} style={{ marginTop: 16 }} large />
      </Card>

      {/* Relance WhatsApp / SMS */}
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>On vous revoit ? (relance)</Text>
        <Text style={styles.help}>Relance des clients presque recompenses (reste 1 a 3 points).</Text>
        <Segmented items={[{ key: 'wa', label: 'WhatsApp' }, { key: 'sms', label: 'SMS' }]} value={waChannel} onChange={setWaChannel} />
        <Button label="Lancer la relance" icon="message-circle" onPress={runWinback} loading={winbackBusy} />
        <Button label="Composer une diffusion WhatsApp" icon="volume-2" variant="ghost" onPress={composeBroadcast} />
      </Card>

      {/* Email de lancement */}
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Email de lancement</Text>
        <Text style={styles.help}>Prevenez vos clients par email que votre programme est en ligne.</Text>
        <View style={styles.emailRow}>
          <Button label="Test (dry run)" variant="secondary" full={false} style={styles.emailBtn} onPress={() => prepareEmail(true)} loading={emailBusy} />
          <Button label="Envoyer" full={false} style={styles.emailBtn} onPress={() => prepareEmail(false)} loading={emailBusy} />
        </View>
      </Card>

      {/* Historique */}
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Campagnes recentes</Text>
        {history.length ? (
          history.map((h, i) => (
            <View key={i} style={styles.histRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.histTitle} numberOfLines={1}>{h.title || 'Notification'}</Text>
                <Text style={styles.histMeta}>{fmtDate(h.created_at)} · {h.sent_count ?? 0} envoyees</Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.help}>Aucune campagne pour le moment.</Text>
        )}
      </Card>
      </>
      )}
    </Screen>
  );
}

// Icone selon la categorie du journal (points, recompense, numero, carte...).
function journalIcon(cat?: string | null): IconName {
  const c = (cat || '').toLowerCase();
  if (c.includes('recomp') || c.includes('récomp')) return 'gift';
  if (c.includes('point')) return 'plus-circle';
  if (c.includes('num')) return 'phone';
  if (c.includes('carte')) return 'credit-card';
  return 'activity';
}

function segLabel(key: string): string {
  return PUSH_SEGMENTS.find((s) => s.key === key)?.label || key;
}

function Aud({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.aud}>
      <Text style={[styles.audVal, accent && { color: theme.accentDark }]}>{value}</Text>
      <Text style={styles.audLbl}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: spacing.xxxl },
  head: { marginTop: 2 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  backTxt: { fontFamily: fonts.bodyBold, fontSize: 16 },
  title: { fontFamily: fonts.heading, fontSize: 26, color: colors.tx, letterSpacing: -0.5 },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.tx2, marginTop: 2 },
  audRow: { flexDirection: 'row', gap: 10 },
  aud: { flex: 1, backgroundColor: colors.s2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.b1, padding: 14, alignItems: 'center', gap: 3 },
  audVal: { fontFamily: fonts.heading, fontSize: 22, color: colors.tx },
  audLbl: { fontFamily: fonts.body, fontSize: 11, color: colors.tx3 },
  card: { gap: 12 },
  cardTitle: { fontFamily: fonts.headingBold, fontSize: 16, color: colors.tx },
  help: { fontFamily: fonts.body, fontSize: 12.5, color: colors.tx3, lineHeight: 18 },
  tplRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tpl: { backgroundColor: colors.s3, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.b2, paddingHorizontal: 14, paddingVertical: 9 },
  tplTxt: { fontFamily: fonts.bodySemi, fontSize: 12.5, color: colors.tx2 },
  label: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.tx3, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 },
  imgPreview: { marginTop: 12, gap: 8 },
  img: { width: '100%', height: 160, borderRadius: radius.md, backgroundColor: colors.s3 },
  imgRemove: { alignSelf: 'center', paddingVertical: 6 },
  imgRemoveTxt: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.red },
  emailRow: { flexDirection: 'row', gap: 10 },
  emailBtn: { flex: 1 },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.b1 },
  histTitle: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.tx },
  histMeta: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.tx3, marginTop: 2 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clearTxt: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.tx3 },
  notifRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.b1 },
  notifDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  notifTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.tx },
  notifBody: { fontFamily: fonts.body, fontSize: 12.5, color: colors.tx2, marginTop: 2, lineHeight: 17 },
  notifMeta: { fontFamily: fonts.mono, fontSize: 10, color: colors.tx3, marginTop: 3 },
  actRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.b1 },
  actIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actDetail: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.tx, lineHeight: 17 },
  actMeta: { fontFamily: fonts.mono, fontSize: 10, color: colors.tx3, marginTop: 2 },
});
