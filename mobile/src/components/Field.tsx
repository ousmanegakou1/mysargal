// ============================================================
// MySargal Caisse - Champ de saisie avec label
// ============================================================

import React from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { colors, radius, fonts, typography } from '../theme';
import { useTheme } from '../theme/ThemeProvider';

interface Props extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
  prefix?: string;
}

export function Field({
  label,
  hint,
  error,
  containerStyle,
  prefix,
  style,
  ...rest
}: Props) {
  const [focused, setFocused] = React.useState(false);
  const t = useTheme();
  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.inputRow,
          focused && { borderColor: t.accent },
          !!error && styles.errored,
        ]}
      >
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          placeholderTextColor={colors.tx3}
          selectionColor={t.accent}
          style={[styles.input, style]}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          {...rest}
        />
      </View>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { ...typography.label },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.s3,
    borderWidth: 1.5,
    borderColor: colors.b1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
  },
  errored: { borderColor: colors.red },
  prefix: { fontFamily: fonts.mono, fontSize: 14, color: colors.tx2, marginRight: 8 },
  input: {
    flex: 1,
    // On n'applique PAS de police personnalisee sur le TextInput : avec la New
    // Architecture (Android surtout) ca rend le texte tape invisible. Police
    // systeme = texte toujours visible. Couleur forcee pour plus de surete.
    fontSize: 16,
    color: colors.tx,
    paddingVertical: 15,
  },
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.tx3 },
  error: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.red },
});
