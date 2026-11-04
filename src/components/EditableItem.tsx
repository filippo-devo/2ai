import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { fmtKcal, itemTotals, per100FromPortion } from '../lib/nutrition';
import type { ItemDraft, Macros } from '../lib/types';
import { Icon, NumField, colors, fonts } from './ui';

/**
 * Składnik na liście. Stuknięcie rozwija edycję: nazwa, gramatura (z przyciskami -/+) i wartości porcji.
 * Zmiana gramatury przelicza kcal i makro (stałe wartości na 100 g); zmiana kcal/makro przelicza wartości na 100 g.
 */
export function EditableItem({
  item,
  open,
  onToggle,
  onChange,
  onRemove,
}: {
  item: ItemDraft;
  open: boolean;
  onToggle: () => void;
  onChange: (next: ItemDraft) => void;
  onRemove: () => void;
}) {
  const t = itemTotals(item);
  const setPortion = (key: keyof Macros, value: number) => {
    const v100 = per100FromPortion(value, item.grams);
    if (v100 !== null) onChange({ ...item, per100: { ...item.per100, [key]: v100 } });
  };
  const step = (d: number) => onChange({ ...item, grams: Math.max(0, Math.round(item.grams + d)) });

  return (
    <View style={[s.wrap, open && s.wrapOpen]}>
      <Pressable onPress={onToggle} style={s.head} accessibilityRole="button" accessibilityLabel={`Edytuj ${item.name || 'składnik'}`}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.name} numberOfLines={1}>
            {item.name || 'Nowy składnik'}
          </Text>
          <Text style={s.sub}>{Math.round(item.grams)} g</Text>
        </View>
        <Text style={s.kcal}>{fmtKcal(t.kcal)}</Text>
        <Text style={s.kcalUnit}>kcal</Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
      </Pressable>

      {open && (
        <View style={s.body}>
          <TextInput
            style={s.nameInput}
            value={item.name}
            placeholder="Nazwa, np. ryż biały"
            placeholderTextColor={colors.muted}
            onChangeText={(name) => onChange({ ...item, name })}
          />

          <Text style={s.label}>Gramatura</Text>
          <View style={s.stepper}>
            <Pressable onPress={() => step(-10)} style={s.stepBtn} accessibilityLabel="Mniej o 10 gramów">
              <Icon name="remove" size={20} />
            </Pressable>
            <NumField value={item.grams} onChange={(grams) => onChange({ ...item, grams })} style={s.gramsInput} />
            <Text style={s.gramsUnit}>g</Text>
            <Pressable onPress={() => step(10)} style={s.stepBtn} accessibilityLabel="Więcej o 10 gramów">
              <Icon name="add" size={20} />
            </Pressable>
          </View>

          <View style={s.grid}>
            <Field label="Kalorie" unit="kcal" value={t.kcal} decimals={0} onChange={(v) => setPortion('kcal', v)} disabled={!(item.grams > 0)} />
            <Field label="Białko" unit="g" value={t.protein} decimals={1} onChange={(v) => setPortion('protein', v)} disabled={!(item.grams > 0)} color={colors.protein} />
            <Field label="Węgle" unit="g" value={t.carbs} decimals={1} onChange={(v) => setPortion('carbs', v)} disabled={!(item.grams > 0)} color={colors.carbs} />
            <Field label="Tłuszcze" unit="g" value={t.fat} decimals={1} onChange={(v) => setPortion('fat', v)} disabled={!(item.grams > 0)} color={colors.fat} />
          </View>

          <Pressable onPress={onRemove} style={s.remove} accessibilityRole="button">
            <Icon name="trash-outline" size={16} color={colors.danger} />
            <Text style={s.removeText}>Usuń składnik</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function Field({
  label,
  unit,
  value,
  decimals,
  onChange,
  disabled,
  color = colors.text,
}: {
  label: string;
  unit: string;
  value: number;
  decimals: number;
  onChange: (n: number) => void;
  disabled: boolean;
  color?: string;
}) {
  return (
    <View style={s.field}>
      <View style={[s.dot, { backgroundColor: color }]} />
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0 }}>
        <NumField value={value} decimals={decimals} onChange={onChange} editable={!disabled} style={s.fieldInput} />
        <Text style={s.fieldUnit}>{unit}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border },
  wrapOpen: { borderColor: colors.text },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
  name: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  sub: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted },
  kcal: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  kcalUnit: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted, marginRight: 4 },
  body: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  nameInput: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text, borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 8 },
  label: { fontFamily: fonts.semibold, fontSize: 12, color: colors.muted, marginTop: 4 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  stepBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  gramsInput: { flex: 1, minWidth: 0, textAlign: 'center', fontFamily: fonts.bold, fontSize: 28, borderWidth: 0, backgroundColor: 'transparent', paddingVertical: 2 },
  gramsUnit: { fontFamily: fonts.medium, fontSize: 15, color: colors.muted, marginLeft: -8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  field: { width: '48.5%', backgroundColor: colors.chip, borderRadius: 14, padding: 10, gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  fieldLabel: { fontFamily: fonts.semibold, fontSize: 12, color: colors.muted },
  fieldInput: { flex: 1, minWidth: 0, borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 0, paddingVertical: 2, fontFamily: fonts.bold, fontSize: 18 },
  fieldUnit: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted },
  remove: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6 },
  removeText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.danger },
});
