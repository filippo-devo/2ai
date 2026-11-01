import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { fmtNum, parseNum } from '../lib/nutrition';

export const colors = {
  bg: '#F6F6F4',
  card: '#FFFFFF',
  text: '#111111',
  muted: '#6B6B6B',
  border: '#E3E3E0',
  primary: '#111111',
  danger: '#C62828',
  warn: '#B26A00',
  kcal: '#111111',
  protein: '#D9534F',
  carbs: '#E0A030',
  fat: '#3A7BD5',
};

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        variant === 'primary' && styles.btnPrimary,
        variant === 'secondary' && styles.btnSecondary,
        variant === 'danger' && styles.btnDanger,
        (pressed || disabled) && { opacity: 0.6 },
        style,
      ]}
    >
      <Text style={[styles.btnText, variant === 'primary' && { color: '#fff' }, variant === 'danger' && { color: colors.danger }]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const over = max > 0 && value > max;
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: over ? colors.danger : color }]} />
    </View>
  );
}

/**
 * Pole liczbowe: podczas edycji pokazuje dokładnie to, co wpisuje użytkownik,
 * a po wyjściu z pola – sformatowaną wartość (która mogła zostać przeliczona).
 */
export function NumField({
  value,
  onChange,
  decimals = 0,
  style,
  ...rest
}: { value: number; onChange: (n: number) => void; decimals?: number } & Omit<TextInputProps, 'value' | 'onChange'>) {
  const [text, setText] = useState(fmtNum(value, decimals));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmtNum(value, decimals));
  }, [value, decimals]);
  return (
    <TextInput
      {...rest}
      style={[styles.input, style]}
      value={text}
      keyboardType="decimal-pad"
      selectTextOnFocus
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        setText(fmtNum(value, decimals));
      }}
      onChangeText={(t) => {
        setText(t);
        const n = parseNum(t);
        if (n !== null) onChange(n);
      }}
    />
  );
}

export function Badge({ text, color = colors.warn }: { text: string; color?: string }) {
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{text}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 8 },
  h1: { fontSize: 22, fontWeight: '700', color: colors.text },
  h2: { fontSize: 17, fontWeight: '700', color: colors.text },
  text: { fontSize: 15, color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: colors.primary },
  btnSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border },
  btnDanger: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.danger },
  btnText: { fontSize: 15, fontWeight: '600', color: colors.text },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: '#ECECEA', overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    backgroundColor: '#fff',
    color: colors.text,
  },
  label: { fontSize: 12, color: colors.muted, marginBottom: 2 },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 14 },
});
