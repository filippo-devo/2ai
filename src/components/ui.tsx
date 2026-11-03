import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { fmtNum, parseNum } from '../lib/nutrition';

/** Czcionki ładowane w _layout.tsx (Instrument Serif do nagłówków i liczb, Manrope do tekstu). */
export const fonts = {
  display: 'InstrumentSerif_400Regular',
  displayItalic: 'InstrumentSerif_400Regular_Italic',
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
};

export const colors = {
  bg: '#F4F1EC',
  card: '#FFFFFF',
  text: '#16130F',
  muted: '#8A837A',
  border: '#E7E1D8',
  primary: '#16130F',
  danger: '#C2410C',
  warn: '#B26A00',
  kcal: '#16130F',
  accent: '#E8643B',
  protein: '#E5484D',
  carbs: '#E9A23B',
  fat: '#3E7BFA',
  chip: '#EFEAE2',
};

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 22, color = colors.text }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: IconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const fg = variant === 'primary' ? '#fff' : variant === 'danger' ? colors.danger : colors.text;
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
        (pressed || disabled) && { opacity: 0.55 },
        style,
      ]}
    >
      <View style={styles.row}>
        {icon && <Icon name={icon} size={18} color={fg} />}
        <Text style={[styles.btnText, { color: fg }]}>{title}</Text>
      </View>
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
}: { value: number; onChange: (n: number) => void; decimals?: number; style?: StyleProp<TextStyle> } & Omit<
  TextInputProps,
  'value' | 'onChange' | 'style'
>) {
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
      placeholderTextColor={colors.muted}
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
  content: { padding: 20, gap: 14, paddingBottom: 48 },
  card: { backgroundColor: colors.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 8 },
  h1: { fontSize: 34, fontFamily: fonts.display, color: colors.text, letterSpacing: -0.3 },
  h2: { fontSize: 17, fontFamily: fonts.bold, color: colors.text },
  text: { fontSize: 15, fontFamily: fonts.medium, color: colors.text },
  muted: { fontSize: 13, fontFamily: fonts.medium, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: { paddingVertical: 15, paddingHorizontal: 18, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: colors.primary },
  btnSecondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  btnDanger: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger },
  btnText: { fontSize: 15, fontFamily: fonts.bold, color: colors.text },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: colors.chip, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: fonts.medium,
    backgroundColor: colors.card,
    color: colors.text,
  },
  label: { fontSize: 12, fontFamily: fonts.semibold, color: colors.muted, marginBottom: 4 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontFamily: fonts.bold },
  error: { color: colors.danger, fontSize: 14, fontFamily: fonts.medium },
});
