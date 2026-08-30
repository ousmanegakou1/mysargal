// ============================================================
// MySargal Caisse - Onglets principaux (bottom tabs)
// Reproduit fidelement la barre du web mobile :
//   Accueil · Clients · [Scan] · Récompenses · Compte
// avec au centre un gros bouton rond vert (FAB) camera, legerement sureleve,
// qui ouvre l'ecran Scan (modal du stack racine). L'onglet actif est vert.
// ============================================================

import React, { useEffect, useRef } from 'react';
import { Text, StyleSheet, View, Pressable, Animated } from 'react-native';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { TabsParamList, RootStackParamList } from './types';
import { colors, fonts, motion, radius, shadow } from '../theme';
import { useTheme } from '../theme/ThemeProvider';
import { Icon, IconName } from '../components/Icon';
import { PressableScale } from '../components/PressableScale';
import { HomeScreen } from '../screens/HomeScreen';
import { ClientsScreen } from '../screens/ClientsScreen';
import { RewardsScreen } from '../screens/RewardsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { useNetwork } from '../offline/NetworkProvider';

const Tab = createBottomTabNavigator<TabsParamList>();

type RootNav = NativeStackNavigationProp<RootStackParamList>;

const ICONS: Record<keyof TabsParamList, IconName> = {
  Home: 'home',
  Clients: 'users',
  Rewards: 'star',
  Account: 'user',
};

const LABELS: Record<keyof TabsParamList, string> = {
  Home: 'Accueil',
  Clients: 'Clients',
  Rewards: 'Récompenses',
  Account: 'Compte',
};

// Un item d'onglet standard (icone + libelle), vert quand actif.
function TabButton({
  routeName,
  focused,
  onPress,
  badge,
}: {
  routeName: keyof TabsParamList;
  focused: boolean;
  onPress: () => void;
  badge?: number;
}) {
  const theme = useTheme();
  const p = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(p, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      stiffness: motion.spring.stiffness,
      damping: motion.spring.damping,
      mass: motion.spring.mass,
    }).start();
  }, [focused, p]);

  const iconStyle = {
    transform: [
      { scale: p.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) },
      { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [0, -1.5] }) },
    ],
  };

  return (
    <Pressable style={styles.tab} onPress={onPress} accessibilityRole="button" accessibilityLabel={LABELS[routeName]}>
      <View>
        <Animated.View style={iconStyle}>
          <Icon name={ICONS[routeName]} size={22} color={focused ? theme.accent : colors.tx3} />
        </Animated.View>
        {badge && badge > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.label, focused && { color: theme.accent }]}>{LABELS[routeName]}</Text>
    </Pressable>
  );
}

// Barre personnalisee : 2 onglets, FAB Scan central sureleve, 2 onglets.
function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const rootNav = useNavigation<RootNav>();
  const { pendingCount } = useNetwork();
  const theme = useTheme();

  const order: (keyof TabsParamList)[] = ['Home', 'Clients', 'Rewards', 'Account'];
  const activeName = state.routes[state.index]?.name as keyof TabsParamList;

  // Le FAB Scan ouvre l'ecran Scan du STACK RACINE. Depuis le bottom-tab, on
  // remonte au parent (le stack racine) pour eviter un navigate vers une route
  // absente du tab navigator. On garde useNavigation<RootNav> en secours.
  const openScan = () => {
    const parent = navigation.getParent<RootNav>();
    if (parent) parent.navigate('Scan');
    else rootNav.navigate('Scan');
  };

  const go = (name: keyof TabsParamList) => {
    const isFocused = activeName === name;
    // tabPress doit cibler la CLE de route (route.key), pas le NOM de route,
    // sinon l'evenement n'atteint pas l'ecran cible.
    const targetKey = state.routes.find((r) => r.name === name)?.key;
    const event = navigation.emit({ type: 'tabPress', target: targetKey, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) navigation.navigate(name as never);
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <TabButton routeName="Home" focused={activeName === 'Home'} onPress={() => go('Home')} />
      <TabButton routeName="Clients" focused={activeName === 'Clients'} onPress={() => go('Clients')} />

      {/* FAB Scan central */}
      <View style={styles.fabSlot}>
        <PressableScale
          onPress={openScan}
          haptic="medium"
          scaleTo={0.9}
          accessibilityLabel="Scanner une carte"
          style={styles.fabWrap}
        >
          <View style={[styles.fab, { backgroundColor: theme.accent }, theme.accentShadow]}>
            <Icon name="camera" size={24} color={colors.onColor} />
          </View>
        </PressableScale>
        <Text style={styles.fabLabel}>Scan</Text>
      </View>

      <TabButton routeName="Rewards" focused={activeName === 'Rewards'} onPress={() => go('Rewards')} />
      <TabButton
        routeName="Account"
        focused={activeName === 'Account'}
        onPress={() => go('Account')}
        badge={pendingCount}
      />
    </View>
  );
}

export function Tabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Clients" component={ClientsScreen} />
      <Tab.Screen name="Rewards" component={RewardsScreen} />
      <Tab.Screen name="Account" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    // Barre translucide : le contenu defile proprement dessous, sans effet de
    // carte coupee. Blanc ~92% + ombre douce projetee vers le haut.
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderTopColor: 'rgba(18,40,25,0.06)',
    borderTopWidth: 1,
    paddingTop: 10,
    shadowColor: '#0b1f14',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 12,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingBottom: 2 },
  label: { fontFamily: fonts.bodySemi, fontSize: 10.5, color: colors.tx3 },
  labelOn: { color: colors.tx },
  fabSlot: { width: 72, alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingBottom: 2 },
  fabWrap: { marginTop: -28 },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.s3,
    borderWidth: 4,
    borderColor: colors.s1,
  },
  fabLabel: { fontFamily: fonts.bodyBold, fontSize: 10.5, color: colors.tx2 },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: colors.red,
    borderWidth: 2,
    borderColor: colors.s1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeTxt: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.white },
});
