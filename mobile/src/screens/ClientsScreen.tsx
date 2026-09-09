// ============================================================
// MySargal Caisse - Clients
// Liste complete, recherche (nom/code/telephone), fiche detail avec actions :
// reveler le telephone (audite), appeler, WhatsApp, SMS, encaisser, historique,
// desactiver la carte. Export CSV et import VIP (CSV).
// ============================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { Button } from '../components/Button';
import { Icon, IconName } from '../components/Icon';
import { Avatar } from '../components/Avatar';
import { StatusBadge, TierBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { OfflineBanner } from '../components/OfflineBanner';
import { useToast } from '../components/Toast';
import { PressableScale } from '../components/PressableScale';
import { AnimatedListItem } from '../components/AnimatedListItem';
import { SkeletonList } from '../components/Skeleton';
import { colors, fonts, radius, spacing } from '../theme';
import { useTheme } from '../theme/ThemeProvider';

import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../auth/AuthContext';
import { useNetwork } from '../offline/NetworkProvider';
import {
  fetchCards,
  fetchTiers,
  clientByPhone,
  revealPhone,
  deactivateCard,
  updateCardClient,
  fetchCardTransactions,
  insertCardsBatch,
} from '../api/endpoints';
import { LoyaltyCardRow, Transaction, SargalTier } from '../api/types';
import { fmtPts, fmtDate, fmtTime, onlyDigits, maskLabel } from '../utils/format';
import { WA_MESSAGES, openWhatsApp, openSMS, callPhone, cardUrl, firstName } from '../utils/wa';
import { genCardCode, tierFromLifetime, maskLast4 } from '../utils/member';
import { buildCSV, exportCSV, pickCSVText, parseCSV, normHeader } from '../utils/csv';
import { tapLight } from '../utils/haptics';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface ImportPreview {
  toCreate: { name: string; phone: string; email: string; pts: number; life: number }[];
  dupes: number;
  ignored: number;
}

export function ClientsScreen() {
  const navigation = useNavigation<Nav>();
  const { merchant } = useAuth();
  const { online } = useNetwork();
  const { toast } = useToast();
  const theme = useTheme();

  const [cards, setCards] = useState<LoyaltyCardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<LoyaltyCardRow[]>([]);
  const [selected, setSelected] = useState<LoyaltyCardRow | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  // Modification de la fiche client (nom + numero)
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  // Le numero reel a-t-il ete recupere ? Sinon, un champ vide ne doit PAS
  // etre interprete comme « efface le numero » (sinon perte de donnee).
  const [editRevealOk, setEditRevealOk] = useState(false);
  // Confirmation de suppression, affichee dans le meme modal (pas d'alerte native).
  const [confirmDel, setConfirmDel] = useState(false);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [tiers, setTiers] = useState<SargalTier[]>([]);

  // Paliers Club Privileges de la boutique (statut Silver/Gold/Sommet...).
  useEffect(() => {
    if (!merchant || !online) return;
    fetchTiers(merchant.id).then(setTiers).catch(() => {});
  }, [merchant, online]);

  // Statut du client selectionne selon son cumul de points.
  const selTier = useMemo(() => {
    const life = selected?.lifetime_pts ?? 0;
    return (tiers || [])
      .filter((t) => (t.min_points || 0) <= life)
      .sort((a, b) => (b.min_points || 0) - (a.min_points || 0))[0] || null;
  }, [tiers, selected?.lifetime_pts]);

  const load = useCallback(async () => {
    if (!merchant || !online) return;
    try {
      setCards(await fetchCards(merchant.id));
    } catch {
      /* garde l'existant */
    }
  }, [merchant, online]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Recherche serveur par telephone si >= 6 chiffres.
  const doRemoteSearch = useCallback(
    async (q: string) => {
      if (!merchant || onlyDigits(q).length < 6) {
        setRemote([]);
        return;
      }
      try {
        setRemote(await clientByPhone(merchant.id, q));
      } catch {
        setRemote([]);
      }
    },
    [merchant]
  );

  const onQuery = (t: string) => {
    setQuery(t);
    doRemoteSearch(t);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = [...cards];
    const merged = remote.length
      ? [...remote, ...base.filter((c) => !remote.some((r) => r.id === c.id))]
      : base;
    if (!q) return merged.sort((a, b) => (b.pts || 0) - (a.pts || 0));
    return merged
      .filter(
        (c) =>
          (c.client_name || '').toLowerCase().includes(q) ||
          (c.code || '').toLowerCase().includes(q) ||
          (!!onlyDigits(q) && onlyDigits(c.client_phone || '').includes(onlyDigits(q))) ||
          onlyDigits(c.client_phone_mask).includes(onlyDigits(q))
      )
      .sort((a, b) => (b.pts || 0) - (a.pts || 0));
  }, [cards, remote, query]);

  const threshold = merchant?.threshold || 10;

  const openDetail = async (c: LoyaltyCardRow) => {
    tapLight();
    setSelected(c);
    setRevealed(null);
    setHistory([]);
    if (online && c.id) {
      fetchCardTransactions(c.id).then(setHistory).catch(() => {});
    }
  };

  const doReveal = async () => {
    if (!selected || !merchant) return;
    setDetailBusy(true);
    try {
      const phone = await revealPhone(selected.id, 'Consultation depuis la liste clients', null);
      setRevealed(phone);
    } catch (e: any) {
      toast(e?.message || 'Numero indisponible', 'error');
    } finally {
      setDetailBusy(false);
    }
  };

  const contactPhone = revealed || selected?.client_phone || selected?.client_phone_mask || '';

  const sendWA = async () => {
    if (!selected || !merchant) return;
    let phone = revealed;
    if (!phone) {
      try {
        phone = await revealPhone(selected.id, 'Envoi de la carte par WhatsApp', null);
        setRevealed(phone);
      } catch {
        phone = null;
      }
    }
    openWhatsApp(
      phone,
      WA_MESSAGES.carte(firstName(selected.client_name), merchant.name, cardUrl(selected.code))
    );
  };

  const sendSMS = async () => {
    if (!selected || !merchant) return;
    let phone = revealed;
    if (!phone) {
      try {
        phone = await revealPhone(selected.id, 'Envoi de la carte par SMS', null);
        setRevealed(phone);
      } catch {
        phone = null;
      }
    }
    if (!phone) {
      toast('Numero indisponible pour ce client.', 'warn');
      return;
    }
    openSMS(phone, WA_MESSAGES.carte(firstName(selected.client_name), merchant.name, cardUrl(selected.code)));
  };

  // La confirmation s'affiche DANS le modal : une alerte native par-dessus un
  // Modal RN deja presente ne s'affiche pas de facon fiable sur iOS (le
  // commercant a l'impression que le bouton ne fait rien).
  const doDeactivate = () => {
    if (!selected) return;
    setEditOpen(false);
    setConfirmDel(true);
  };

  const confirmDeactivate = async () => {
    if (!selected) return;
    const carte = selected;
    setDetailBusy(true);
    try {
      await deactivateCard(carte.id);
      // La liste affichee fusionne `cards` et `remote` (resultats de recherche
      // par telephone), et `remote` est prioritaire : il faut retirer la carte
      // des DEUX, sinon elle reste visible apres suppression.
      setCards((prev) => prev.filter((c) => c.id !== carte.id));
      setRemote((prev) => prev.filter((c) => c.id !== carte.id));
      toast('Carte supprimee, points remis a 0.', 'success');
      setConfirmDel(false);
      setEditOpen(false);
      setSelected(null);
    } catch (e: any) {
      toast(e?.message || 'Suppression impossible', 'error');
    } finally {
      setDetailBusy(false);
    }
  };

  // ----- Modifier la fiche client (nom + numero WhatsApp) -----
  const openEdit = async () => {
    if (!selected) return;
    setEditName(selected.client_name || '');
    let p: string | null = revealed;
    if (!p) {
      setDetailBusy(true);
      try {
        p = await revealPhone(selected.id, 'Modification de la fiche client', null);
        setRevealed(p);
      } catch {
        p = null;
      }
      setDetailBusy(false);
    }
    setEditPhone(p || '');
    setEditRevealOk(!!p);
    setEditOpen(true);
  };

  const doSaveEdit = async () => {
    if (!selected) return;
    const nom = editName.trim();
    if (!nom) { toast('Le nom est obligatoire.', 'warn'); return; }
    const tel = editPhone.trim();
    if (tel) {
      const n = onlyDigits(tel).length;
      if (n < 8 || n > 15) { toast('Numero de telephone invalide.', 'warn'); return; }
    }
    setSavingEdit(true);
    try {
      // On ne touche au numero que si on sait ce qu'on ecrase.
      const champs: { client_name: string; client_phone?: string | null } = { client_name: nom };
      if (tel) champs.client_phone = tel;
      else if (editRevealOk) champs.client_phone = null;
      await updateCardClient(selected.id, champs);
      const majTel = 'client_phone' in champs;
      if (majTel) setRevealed(tel || null);
      // Mettre a jour les DEUX sources : la liste fusionne `cards` et `remote`
      // (recherche par telephone), et `remote` est prioritaire a l'affichage.
      const majLigne = (c: LoyaltyCardRow) =>
        c.id === selected.id
          ? { ...c, client_name: nom, ...(majTel ? { client_phone: tel || null } : {}) }
          : c;
      setCards((prev) => prev.map(majLigne));
      setRemote((prev) => prev.map(majLigne));
      setSelected((s) =>
        s ? { ...s, client_name: nom, ...(majTel ? { client_phone: tel || null } : {}) } : s
      );
      setEditOpen(false);
      toast('Fiche client mise a jour.', 'success');
    } catch (e: any) {
      toast(e?.message || 'Modification impossible', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const doExport = async () => {
    if (!filtered.length) {
      toast('Aucun client a exporter.', 'warn');
      return;
    }
    try {
      const rows = filtered.map((c) => [
        c.client_name || '',
        maskLabel(c.client_phone_mask),
        c.code,
        c.pts ?? 0,
        c.lifetime_pts ?? 0,
        c.created_at ? fmtDate(c.created_at) : '',
      ]);
      const csv = buildCSV(
        ['Nom', 'Telephone (masque)', 'Code carte', 'Points', 'Points cumules', 'Date creation'],
        rows
      );
      const name = `${(merchant?.name || 'boutique').replace(/\s+/g, '_')}_clients.csv`;
      await exportCSV(name, csv);
    } catch (e: any) {
      toast(e?.message || 'Export impossible', 'error');
    }
  };

  const doImportPick = async () => {
    if (!merchant) return;
    try {
      const text = await pickCSVText();
      if (!text) return;
      const rows = parseCSV(text);
      if (rows.length < 2) {
        toast('Fichier vide ou invalide.', 'warn');
        return;
      }
      const header = rows[0].map(normHeader);
      const idx = (keys: string[]) => header.findIndex((h) => keys.some((k) => h.includes(k)));
      const iName = idx(['nom', 'name', 'prenom', 'client']);
      const iPhone = idx(['telephone', 'tel', 'phone', 'numero', 'whatsapp', 'mobile', 'contact', 'gsm']);
      const iEmail = idx(['email', 'mail', 'courriel']);
      const iPts = idx(['points', 'solde', 'pts']);
      const iLife = idx(['cumule', 'lifetime', 'totalpoint']);
      const existingPhones = new Set(cards.map((c) => onlyDigits(c.client_phone_mask)).filter(Boolean));
      const seen = new Set<string>();
      const toCreate: ImportPreview['toCreate'] = [];
      let dupes = 0;
      let ignored = 0;
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        // Une ligne CSV peut avoir MOINS de colonnes que l'en-tete (export
        // Excel qui coupe les cellules vides) : row[i] vaut alors undefined.
        const name = String((iName >= 0 ? row[iName] : '') ?? '').trim();
        const phoneRaw = iPhone >= 0 ? onlyDigits(row[iPhone] ?? '') : '';
        const email = String((iEmail >= 0 ? row[iEmail] : '') ?? '').trim();
        if (!name || (!phoneRaw && !email)) {
          ignored++;
          continue;
        }
        const key = phoneRaw || email.toLowerCase();
        if (seen.has(key) || (phoneRaw && existingPhones.has(phoneRaw))) {
          dupes++;
          continue;
        }
        seen.add(key);
        const pts = iPts >= 0 ? parseInt(onlyDigits(row[iPts]) || '0', 10) : 0;
        const life = Math.max(pts, iLife >= 0 ? parseInt(onlyDigits(row[iLife]) || '0', 10) : 0);
        toCreate.push({ name, phone: phoneRaw, email, pts, life });
      }
      setImportPreview({ toCreate, dupes, ignored });
    } catch (e: any) {
      toast(e?.message || 'Lecture du fichier impossible', 'error');
    }
  };

  const doImportConfirm = async () => {
    if (!merchant || !importPreview) return;
    setImportBusy(true);
    try {
      const batchRows = importPreview.toCreate.map((c) => ({
        merchant_id: merchant.id,
        code: genCardCode(),
        client_name: c.name,
        client_phone: c.phone ? '+' + c.phone : null,
        client_phone_raw: c.phone || null,
        client_email: c.email || null,
        design_name: 'green',
        pts: c.pts,
        lifetime_pts: c.life,
        tier: tierFromLifetime(c.life),
      }));
      for (let i = 0; i < batchRows.length; i += 100) {
        await insertCardsBatch(batchRows.slice(i, i + 100));
      }
      toast(`${batchRows.length} client(s) importe(s).`, 'success');
      setImportPreview(null);
      await load();
    } catch (e: any) {
      toast(e?.message || 'Import impossible', 'error');
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <Screen scroll padded refreshing={refreshing} onRefresh={onRefresh} contentStyle={styles.content}>
      <View>
        <Text style={styles.title}>Clients</Text>
        <Text style={styles.subtitle}>{cards.length} carte{cards.length > 1 ? 's' : ''} de fidelite.</Text>
      </View>

      <OfflineBanner />

      <Field
        value={query}
        onChangeText={onQuery}
        placeholder="Nom, code ou telephone"
        autoCapitalize="none"
      />

      <Button label="Nouveau client" icon="user-plus" onPress={() => navigation.navigate('NewClient')} />

      <View style={styles.toolRow}>
        <Button label="Exporter CSV" icon="download" variant="secondary" full={false} style={styles.tool} onPress={doExport} />
        <Button label="Importer VIP" icon="upload" variant="secondary" full={false} style={styles.tool} onPress={doImportPick} />
      </View>

      {loading && !cards.length ? (
        <SkeletonList count={7} />
      ) : filtered.length ? (
        <View style={styles.list}>
          {filtered.map((c, i) => {
            const ready = (c.pts || 0) >= threshold;
            const life = c.lifetime_pts || 0;
            const rowTier = (tiers || [])
              .filter((t) => (t.min_points || 0) <= life)
              .sort((a, b) => (b.min_points || 0) - (a.min_points || 0))[0];
            return (
              <AnimatedListItem key={c.id} index={i}>
                <PressableScale style={styles.row} onPress={() => openDetail(c)} accessibilityLabel={c.client_name || 'Client'}>
                  <Avatar name={c.client_name} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {c.client_name || 'Client'}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {c.code} · {c.client_phone || maskLabel(c.client_phone_mask) || 'numero masque'}
                    </Text>
                    {rowTier ? (
                      <View style={styles.rowTier}>
                        <View style={[styles.rowTierDot, { backgroundColor: rowTier.color_hex || theme.accent }]} />
                        <Text style={[styles.rowTierTxt, { color: rowTier.color_hex || theme.accentDark }]} numberOfLines={1}>
                          {rowTier.name}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {ready ? <StatusBadge label="Pret" tone="gold" small /> : null}
                  <View style={styles.rowPts}>
                    <Text style={[styles.rowPtsVal, { color: theme.accent }]}>{fmtPts(c.pts || 0)}</Text>
                    <Text style={styles.rowPtsLbl}>pts</Text>
                  </View>
                </PressableScale>
              </AnimatedListItem>
            );
          })}
        </View>
      ) : (
        <EmptyState icon="users" title="Aucun client" message="Cree une carte ou importe ta liste VIP." />
      )}

      {/* Detail client */}
      {/* Fiche client. L'edition s'affiche DANS ce meme modal : deux <Modal>
          visibles en meme temps ne s'ouvrent pas de facon fiable sur iOS. */}
      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (confirmDel) setConfirmDel(false);
          else if (editOpen) setEditOpen(false);
          else { setSelected(null); setEditOpen(false); setConfirmDel(false); }
        }}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            {confirmDel ? (
              <View style={{ gap: 12 }}>
                <Text style={styles.detailName}>Supprimer la carte</Text>
                <Text style={styles.editHelp}>
                  La carte de {selected?.client_name || 'ce client'} sera desactivee et ses points remis a 0.
                  Le cumul a vie et l'historique sont conserves. Cette action est definitive.
                </Text>
                <Button label="Oui, supprimer" variant="danger" onPress={confirmDeactivate} loading={detailBusy} />
                <Button label="Annuler" variant="ghost" onPress={() => setConfirmDel(false)} />
              </View>
            ) : editOpen ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
                <Text style={styles.detailName}>Modifier le client</Text>
                <Text style={styles.editHelp}>
                  Corrigez le nom ou le numero WhatsApp. Le numero sert a envoyer la carte et les messages.
                </Text>
                <Field label="Nom du client" value={editName} onChangeText={setEditName} placeholder="Ex : Awa Diop" autoCapitalize="words" />
                <Field
                  label="Numero WhatsApp (avec indicatif)"
                  value={editPhone}
                  onChangeText={(t) => setEditPhone(t.replace(/[^\d+ ]/g, ''))}
                  placeholder="+221 77 123 45 67"
                  keyboardType="phone-pad"
                />
                {!editRevealOk ? (
                  <Text style={styles.editWarn}>
                    Numero actuel non recupere. Laissez vide pour le conserver tel quel, ou saisissez un nouveau numero pour le remplacer.
                  </Text>
                ) : null}
                <Button label="Enregistrer" onPress={doSaveEdit} loading={savingEdit} />
                <Button label="Annuler" variant="ghost" onPress={() => setEditOpen(false)} />
              </ScrollView>
            ) : (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14 }}>
              <View style={styles.detailHead}>
                <Avatar name={selected?.client_name} size={54} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailName}>{selected?.client_name || 'Client'}</Text>
                  <Text style={styles.detailCode}>{selected?.code}</Text>
                  <View style={styles.detailTierRow}>
                    {selTier ? (
                      <View
                        style={[
                          styles.tierChip,
                          { backgroundColor: (selTier.color_hex || theme.accent) + '22', borderColor: selTier.color_hex || theme.accent },
                        ]}
                      >
                        <Icon name="award" size={12} color={selTier.color_hex || theme.accentDark} />
                        <Text style={[styles.tierChipTxt, { color: selTier.color_hex || theme.accentDark }]} numberOfLines={1}>
                          {selTier.name}
                        </Text>
                      </View>
                    ) : (
                      <TierBadge tier={tierFromLifetime(selected?.lifetime_pts || 0)} />
                    )}
                  </View>
                </View>
                <Pressable onPress={() => { setSelected(null); setEditOpen(false); setConfirmDel(false); }} style={styles.close} hitSlop={8}>
                  <Icon name="x" size={22} color={colors.tx2} />
                </Pressable>
              </View>

              <View style={styles.detailStats}>
                <View style={styles.detailStat}>
                  <Text style={styles.detailStatVal}>{fmtPts(selected?.pts || 0)}</Text>
                  <Text style={styles.detailStatLbl}>points</Text>
                </View>
                <View style={styles.detailStat}>
                  <Text style={styles.detailStatVal}>{fmtPts(selected?.lifetime_pts || 0)}</Text>
                  <Text style={styles.detailStatLbl}>cumul</Text>
                </View>
                <View style={styles.detailStat}>
                  <Text style={styles.detailStatVal}>
                    {revealed || selected?.client_phone || maskLabel(selected?.client_phone_mask) || 'Non renseigne'}
                  </Text>
                  <Text style={styles.detailStatLbl}>telephone</Text>
                </View>
              </View>

              {!revealed ? (
                <Button label="Reveler le telephone" icon="eye" variant="secondary" onPress={doReveal} loading={detailBusy} />
              ) : (
                <Text style={[styles.revealed, { color: theme.accent }]}>{revealed}</Text>
              )}

              <View style={styles.actionsGrid}>
                <MiniBtn icon="message-circle" label="WhatsApp" onPress={sendWA} />
                <MiniBtn icon="mail" label="SMS" onPress={sendSMS} />
                <MiniBtn
                  icon="phone"
                  label="Appeler"
                  onPress={async () => {
                    if (!selected) return;
                    // Numero reel : celui revele, sinon le complet charge, sinon on revele.
                    let phone: string | null =
                      revealed ||
                      (selected.client_phone && onlyDigits(selected.client_phone).length >= 8 ? selected.client_phone : null);
                    if (!phone) {
                      try {
                        phone = await revealPhone(selected.id, 'Appel depuis la liste clients', null);
                        setRevealed(phone);
                      } catch {
                        phone = null;
                      }
                    }
                    if (phone && onlyDigits(phone).length >= 8) callPhone(phone);
                    else toast('Numero indisponible.', 'warn');
                  }}
                />
                <MiniBtn
                  icon="plus"
                  label="Encaisser"
                  onPress={() => {
                    const c = selected;
                    setEditOpen(false);
                    setConfirmDel(false);
                    setSelected(null);
                    if (c) navigation.navigate('Client', { code: c.code });
                  }}
                />
              </View>

              <View style={styles.divider} />
              <Text style={styles.histTitle}>Historique</Text>
              {history.length ? (
                history.slice(0, 15).map((t, i) => (
                  <View key={t.id || i} style={styles.histRow}>
                    <Text style={styles.histNote} numberOfLines={1}>
                      {t.note || (t.type === 'earn' ? 'Achat' : 'Recompense')}
                    </Text>
                    <Text style={[styles.histPts, { color: t.type === 'reward' ? colors.gold : theme.accent }]}>
                      {t.type === 'reward' ? '' : '+'}
                      {fmtPts(Math.abs(t.pts || 0))} pts
                    </Text>
                    <Text style={styles.histTime}>{fmtDate(t.created_at)} {fmtTime(t.created_at)}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.histEmpty}>Aucune operation.</Text>
              )}

              <Button
                label="Modifier les infos du client"
                icon="edit"
                variant="secondary"
                onPress={openEdit}
                loading={detailBusy}
                style={{ marginTop: 4 }}
              />
              <Button label="Supprimer la carte" variant="danger" onPress={doDeactivate} loading={detailBusy} />
            </ScrollView>
            )}
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Apercu import */}
      <Modal visible={!!importPreview} transparent animationType="slide" onRequestClose={() => setImportPreview(null)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.detailName}>Import VIP</Text>
            <View style={styles.importStats}>
              <ImportStat value={importPreview?.toCreate.length || 0} label="a creer" accent />
              <ImportStat value={importPreview?.dupes || 0} label="doublons" />
              <ImportStat value={importPreview?.ignored || 0} label="ignores" />
            </View>
            <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {(importPreview?.toCreate || []).slice(0, 20).map((c, i) => (
                <View key={i} style={styles.importRow}>
                  <Text style={styles.importName} numberOfLines={1}>{c.name}</Text>
                  <Text style={styles.importPhone}>{c.phone ? maskLast4(c.phone) : c.email}</Text>
                </View>
              ))}
            </ScrollView>
            <Button
              label={`Importer ${importPreview?.toCreate.length || 0} client(s)`}
              onPress={doImportConfirm}
              loading={importBusy}
              disabled={!importPreview?.toCreate.length}
              style={{ marginTop: 12 }}
            />
            <Pressable onPress={() => setImportPreview(null)} style={styles.cancel}>
              <Text style={styles.cancelTxt}>Annuler</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function MiniBtn({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <PressableScale style={styles.mini} onPress={onPress} accessibilityLabel={label}>
      <Icon name={icon} size={20} color={theme.accentDark} />
      <Text style={styles.miniLbl}>{label}</Text>
    </PressableScale>
  );
}

function ImportStat({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.importStat}>
      <Text style={[styles.importStatVal, accent && { color: theme.accent }]}>{value}</Text>
      <Text style={styles.importStatLbl}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xxxl },
  title: { fontFamily: fonts.heading, fontSize: 26, color: colors.tx, letterSpacing: -0.5, marginTop: 4 },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.tx2, marginTop: 2 },
  toolRow: { flexDirection: 'row', gap: 10 },
  tool: { flex: 1 },
  list: { gap: 8, marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.s2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.b1,
    padding: 12,
  },
  rowName: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.tx },
  rowMeta: { fontFamily: fonts.mono, fontSize: 11, color: colors.tx3, marginTop: 2 },
  rowPts: { alignItems: 'center', minWidth: 42 },
  rowPtsVal: { fontFamily: fonts.heading, fontSize: 17, color: colors.tx },
  rowPtsLbl: { fontFamily: fonts.mono, fontSize: 9, color: colors.tx3 },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.s1,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderColor: colors.b2,
    maxHeight: '88%',
  },
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailName: { fontFamily: fonts.heading, fontSize: 20, color: colors.tx },
  detailCode: { fontFamily: fonts.mono, fontSize: 12, color: colors.tx3, marginTop: 2 },
  detailTierRow: { flexDirection: 'row', marginTop: 7 },
  rowTier: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  rowTierDot: { width: 7, height: 7, borderRadius: 4 },
  rowTierTxt: { fontFamily: fonts.bodyBold, fontSize: 11.5 },
  tierChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1.5,
    maxWidth: 150,
  },
  tierChipTxt: { fontFamily: fonts.bodyBold, fontSize: 12 },
  close: { padding: 4 },
  detailStats: { flexDirection: 'row', backgroundColor: colors.s2, borderRadius: radius.md, padding: 14 },
  detailStat: { flex: 1, alignItems: 'center', gap: 3 },
  detailStatVal: { fontFamily: fonts.headingBold, fontSize: 16, color: colors.tx },
  detailStatLbl: { fontFamily: fonts.mono, fontSize: 9.5, color: colors.tx3 },
  revealed: { fontFamily: fonts.mono, fontSize: 16, color: colors.tx, textAlign: 'center' },
  actionsGrid: { flexDirection: 'row', gap: 8 },
  mini: {
    flex: 1,
    backgroundColor: colors.s3,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.b2,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
  },
  miniIcon: { fontSize: 18 },
  miniLbl: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.tx2 },
  divider: { height: 1, backgroundColor: colors.b1 },
  histTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.tx },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  histNote: { flex: 1, fontFamily: fonts.body, fontSize: 12.5, color: colors.tx2 },
  histPts: { fontFamily: fonts.bodyBold, fontSize: 12.5 },
  histTime: { fontFamily: fonts.mono, fontSize: 9.5, color: colors.tx3, minWidth: 70, textAlign: 'right' },
  histEmpty: { fontFamily: fonts.body, fontSize: 12.5, color: colors.tx3 },
  editHelp: { fontFamily: fonts.body, fontSize: 12.5, color: colors.tx3, lineHeight: 18, marginBottom: 4 },
  editWarn: { fontFamily: fonts.body, fontSize: 12, color: colors.gold2, lineHeight: 17 },
  importStats: { flexDirection: 'row', marginVertical: 12 },
  importStat: { flex: 1, alignItems: 'center', gap: 2 },
  importStatVal: { fontFamily: fonts.heading, fontSize: 22, color: colors.tx },
  importStatLbl: { fontFamily: fonts.body, fontSize: 11, color: colors.tx3 },
  importRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.b1 },
  importName: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 13, color: colors.tx },
  importPhone: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.tx3 },
  cancel: { alignItems: 'center', paddingVertical: 12 },
  cancelTxt: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.tx3 },
});
