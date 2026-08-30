// ============================================================
// MySargal Caisse - Garde-fou d'erreurs (ErrorBoundary racine)
// Capture les erreurs de rendu React et affiche un message lisible et
// scrollable (message + stack) au lieu d'un ecran blanc ou d'une fermeture
// brutale de l'application. Indispensable pour diagnostiquer un crash JS.
// ============================================================

import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  info: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // On garde la trace pour l'afficher a l'ecran.
    this.setState({ error, info });
    // Utile aussi dans les logs Metro / Expo Go.
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary a capture une erreur:', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, info: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error, info } = this.state;
    const message = error?.message || String(error) || 'Erreur inconnue';
    const stack = error?.stack || '';
    const componentStack = info?.componentStack || '';

    return (
      <View style={styles.root}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator
        >
          <Text style={styles.badge}>ERREUR APPLICATION</Text>
          <Text style={styles.title}>L'ecran a rencontre une erreur</Text>
          <Text style={styles.subtitle}>
            Le detail ci-dessous aide a identifier la cause. Fais defiler pour
            tout voir.
          </Text>

          <Text style={styles.sectionLabel}>Message</Text>
          <Text selectable style={styles.message}>
            {message}
          </Text>

          {stack ? (
            <>
              <Text style={styles.sectionLabel}>Pile d'appels (stack)</Text>
              <Text selectable style={styles.stack}>
                {stack}
              </Text>
            </>
          ) : null}

          {componentStack ? (
            <>
              <Text style={styles.sectionLabel}>Arbre de composants</Text>
              <Text selectable style={styles.stack}>
                {componentStack}
              </Text>
            </>
          ) : null}

          <Pressable style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonTxt}>Reessayer</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 48,
    gap: 8,
  },
  badge: {
    alignSelf: 'flex-start',
    color: '#b91c1c',
    backgroundColor: '#fee2e2',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 8,
  },
  subtitle: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 19,
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#64748b',
    marginTop: 16,
    textTransform: 'uppercase',
  },
  message: {
    fontSize: 14,
    color: '#991b1b',
    fontWeight: '600',
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 12,
  },
  stack: {
    fontSize: 12,
    color: '#334155',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 12,
    fontFamily: 'Courier',
    lineHeight: 17,
  },
  button: {
    marginTop: 24,
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonTxt: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
});
