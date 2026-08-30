// ============================================================
// MySargal Caisse - Theme
// Theme BLANC premium par defaut (façon Uber) : blanc pur en surface,
// beaucoup d'air, contraste net, un accent vert de marque.
// Les noms de tokens sont conserves a l'identique de l'ancien theme sombre :
// tous les ecrans/composants consomment ces tokens, donc basculer les valeurs
// ci-dessous bascule toute l'application sans toucher aux ecrans.
// Un theme sombre optionnel propre est expose via `darkColors` (voir plus bas).
// ============================================================

// -------------------------------------------------------------
// Palette claire premium (DEFAUT)
// -------------------------------------------------------------
export const colors = {
  // Fonds
  bg: '#f6f8f7', // fond d'app tres legerement gris/vert
  bg2: '#eef2f0', // teinte intermediaire (degrade de fond tres subtil)
  s1: '#ffffff', // surface principale (barre d'onglets, entetes)
  s2: '#ffffff', // cartes blanches
  s3: '#f0f3f1', // surface secondaire (boutons secondaires, puces, champs)
  s4: '#e7ece9', // surface plus marquee (etats actifs discrets)
  // Bordures tres discretes / separateurs
  b1: '#eef1ee', // hairline sur cartes
  b2: '#e3e8e4', // bordure standard, separateurs
  b3: 'rgba(22,163,74,0.28)', // bordure d'accent (elements actifs vert)
  // Textes
  tx: '#0b140d', // titres / texte principal (quasi noir)
  tx2: '#5b6b60', // texte secondaire
  tx3: '#9aa8a0', // texte tertiaire / icones inactives
  // Accents de marque
  green: '#16a34a', // vert principal (boutons primaires)
  green2: '#22c55e', // vert clair (degrade)
  green3: '#15803d', // vert profond (bon contraste sur fond clair : icones, textes accent)
  accent: '#16a34a',
  // Or premium (touches rares : statut Sommet, badges)
  gold: '#c9a24a',
  gold2: '#e6c877',
  goldDeep: '#a8842f',
  // Etats
  red: '#ef4444',
  redSoft: 'rgba(239,68,68,0.10)',
  greenSoft: 'rgba(22,163,74,0.10)',
  goldSoft: 'rgba(201,162,74,0.14)',
  // Paiement Wave
  wave: '#0a8f78',
  // Divers (badges tiers Sommet)
  violet: '#7c3aed',
  violet2: '#a78bfa',
  white: '#ffffff',
  // Texte pose sur une surface de couleur pleine (boutons verts, degrades)
  onColor: '#ffffff',
} as const;

// -------------------------------------------------------------
// Palette sombre optionnelle (propre) - non utilisee par defaut.
// Fournie pour un futur bascule de theme ; mêmes cles que `colors`.
// -------------------------------------------------------------
export const darkColors = {
  bg: '#061206',
  bg2: '#04140a',
  s1: '#0a1a0a',
  s2: '#0f240f',
  s3: '#152e15',
  s4: '#1a3a1a',
  b1: 'rgba(34,197,94,0.08)',
  b2: 'rgba(34,197,94,0.16)',
  b3: 'rgba(34,197,94,0.3)',
  tx: '#ecf5ec',
  tx2: '#7aaa7a',
  tx3: '#3a5e3a',
  green: '#16a34a',
  green2: '#22c55e',
  green3: '#4ade80',
  accent: '#26d07c',
  gold: '#f5c842',
  gold2: '#fde68a',
  goldDeep: '#c9a24a',
  red: '#ef4444',
  redSoft: 'rgba(239,68,68,0.14)',
  greenSoft: 'rgba(34,197,94,0.12)',
  goldSoft: 'rgba(245,200,66,0.14)',
  wave: '#00c4a3',
  violet: '#c4b5fd',
  violet2: '#a78bfa',
  white: '#ffffff',
  onColor: '#04170a',
} as const;

export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

// Familles de polices. On charge Montserrat, Plus Jakarta Sans et DM Mono
// dans App.tsx via expo-font. Repli systeme si le chargement echoue.
export const fonts = {
  heading: 'Montserrat_800ExtraBold',
  headingBold: 'Montserrat_700Bold',
  body: 'PlusJakartaSans_500Medium',
  bodyBold: 'PlusJakartaSans_700Bold',
  bodySemi: 'PlusJakartaSans_600SemiBold',
  mono: 'DMMono_500Medium',
} as const;

export const typography = {
  h1: { fontFamily: fonts.heading, fontSize: 30, color: colors.tx, letterSpacing: -0.6 },
  h2: { fontFamily: fonts.heading, fontSize: 22, color: colors.tx, letterSpacing: -0.4 },
  h3: { fontFamily: fonts.headingBold, fontSize: 18, color: colors.tx },
  body: { fontFamily: fonts.body, fontSize: 15, color: colors.tx },
  bodyBold: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.tx },
  label: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.tx3, letterSpacing: 0.6, textTransform: 'uppercase' as const },
  mono: { fontFamily: fonts.mono, fontSize: 12, color: colors.tx2 },
  caption: { fontFamily: fonts.body, fontSize: 12, color: colors.tx2 },
} as const;

// Ombres douces et diffuses (elevation subtile), adaptees a un fond clair.
export const shadow = {
  card: {
    shadowColor: '#0b1f14',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  soft: {
    shadowColor: '#0b1f14',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  green: {
    shadowColor: colors.green,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 6,
  },
  gold: {
    shadowColor: colors.goldDeep,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 6,
  },
} as const;

// -------------------------------------------------------------
// Tokens de mouvement (API Animated integree de React Native). Ressorts et
// durees standard pour garder un mouvement coherent, fluide et performant.
// stiffness/damping/mass sont directement compatibles avec Animated.spring ;
// duration s'utilise avec Animated.timing (transform/opacity, useNativeDriver).
// -------------------------------------------------------------
export const motion = {
  spring: { damping: 18, stiffness: 220, mass: 0.9 }, // ressort general
  springSoft: { damping: 20, stiffness: 140, mass: 1 }, // ressort doux (feuilles)
  springBouncy: { damping: 11, stiffness: 200, mass: 0.8 }, // ressort rebondi (succes)
  press: { damping: 15, stiffness: 400, mass: 0.6 }, // enfoncement bouton
  duration: { fast: 160, base: 240, slow: 360 },
  stagger: 55, // decalage entre items de liste (ms)
  pressScale: 0.96,
} as const;
