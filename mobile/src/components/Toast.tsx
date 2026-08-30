// ============================================================
// MySargal Caisse - Toast (contexte global + animation)
// ============================================================

import React, { createContext, useContext, useCallback, useState, useRef } from 'react';
import { Animated, Text, StyleSheet, View, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, fonts } from '../theme';
import { notifySuccess, notifyError, notifyWarning } from '../utils/haptics';
import { Icon, IconName } from './Icon';

type ToastKind = 'success' | 'error' | 'info' | 'warn';

interface ToastData {
  message: string;
  kind: ToastKind;
}

interface ToastContextValue {
  toast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

const KIND_STYLE: Record<ToastKind, { bg: string; border: string; icon: IconName; fg: string }> = {
  success: { bg: 'rgba(22,163,74,0.16)', border: colors.b3, icon: 'check-circle', fg: colors.green3 },
  error: { bg: 'rgba(239,68,68,0.16)', border: 'rgba(239,68,68,0.4)', icon: 'x-circle', fg: colors.red },
  warn: { bg: 'rgba(245,200,66,0.16)', border: 'rgba(245,200,66,0.4)', icon: 'alert-triangle', fg: colors.gold },
  info: { bg: colors.s3, border: colors.b2, icon: 'info', fg: colors.tx },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<ToastData | null>(null);
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setData({ message, kind });
      if (kind === 'success') notifySuccess();
      else if (kind === 'error') notifyError();
      else if (kind === 'warn') notifyWarning();

      Animated.timing(anim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();

      hideTimer.current = setTimeout(() => {
        Animated.timing(anim, {
          toValue: 0,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }).start(() => setData(null));
      }, 2600);
    },
    [anim]
  );

  const style = data ? KIND_STYLE[data.kind] : KIND_STYLE.info;

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {data ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.wrap,
            { top: insets.top + 10 },
            {
              opacity: anim,
              transform: [
                {
                  translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }),
                },
              ],
            },
          ]}
        >
          <View style={[styles.toast, { backgroundColor: style.bg, borderColor: style.border }]}>
            <Icon name={style.icon} size={16} color={style.fg} />
            <Text style={styles.message}>{data.message}</Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, zIndex: 1000, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 13,
    maxWidth: 460,
    backgroundColor: colors.s2,
  },
  icon: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.tx, width: 16, textAlign: 'center' },
  message: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 14, color: colors.tx },
});
