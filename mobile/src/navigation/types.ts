// ============================================================
// MySargal Caisse - Types de navigation
// Barre d'onglets alignee sur le web mobile : Accueil, Clients, Scan (bouton
// central), Recompenses, Compte. Scan est un ecran modal du stack racine
// declenche par le bouton central (FAB), pas un onglet a part entiere.
// ============================================================

import { CardLookup } from '../api/types';

export type RootStackParamList = {
  Tabs: undefined;
  Scan: { target?: 'loyalty' | 'gift' } | undefined;
  // On peut arriver sur la fiche par code (recherche/scan) ou avec la carte deja chargee.
  Client: { code?: string; card?: CardLookup } | undefined;
  Kiosk: undefined;
  NewClient: { code?: string } | undefined;
  Dashboard: undefined;
  GiftCards: undefined;
  More: undefined;
  Push: undefined;
  Summit: undefined;
  History: undefined;
};

export type TabsParamList = {
  Home: undefined;
  Clients: undefined;
  Rewards: undefined;
  Account: undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
