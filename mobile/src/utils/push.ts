// ============================================================
// MySargal Caisse - Modeles et segments de notifications push
// Constantes reprises de l'app web (PUSH_TEMPLATES, PUSH_LIBELLES) + tarifs
// WhatsApp pour l'estimation de cout.
// ============================================================

export interface PushTemplate {
  key: string;
  label: string;
  title: string;
  body: string;
}

export const PUSH_TEMPLATES: PushTemplate[] = [
  {
    key: 'x2',
    label: 'Points x2',
    title: 'Points x2 ce week-end',
    body: 'Samedi et dimanche, chaque achat vous rapporte le double de points.',
  },
  {
    key: 'collection',
    label: 'Nouveautes',
    title: 'Nouveautes en boutique',
    body: "La nouvelle collection vient d'arriver. Passez la decouvrir en avant-premiere.",
  },
  {
    key: 'promo',
    label: 'Derniere chance',
    title: 'Dernier jour',
    body: "C'est le dernier jour pour profiter de l'offre. On vous attend jusqu'a la fermeture.",
  },
  {
    key: 'reward',
    label: 'Recompense',
    title: 'Votre recompense vous attend',
    body: 'Vous avez assez de points pour votre prochaine recompense. Passez la recuperer.',
  },
  {
    key: 'retour',
    label: 'On vous revoit ?',
    title: 'Ca fait un moment',
    body: "On ne vous a pas vu depuis quelque temps. Vos points sont toujours la.",
  },
];

export interface PushSegment {
  key: string;
  label: string;
}

export const PUSH_SEGMENTS: PushSegment[] = [
  { key: 'tous', label: 'Tous' },
  { key: 'inactifs', label: 'Inactifs' },
  { key: 'presque', label: 'Presque recompenses' },
  { key: 'meilleurs', label: 'Meilleurs clients' },
  { key: 'nouveaux', label: 'Nouveaux' },
];

// Tarifs WhatsApp (USD / message) et conversion FCFA pour l'estimation.
export const WA_TARIF: Record<string, number> = {
  marketing: 0.0225,
  utilitaire: 0.008,
  authentification: 0.0135,
  interne: 0,
  autre: 0.008,
};
export const WA_USD_FCFA = 600;
