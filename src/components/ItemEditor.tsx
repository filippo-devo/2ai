import { Pressable, Text, TextInput, View } from 'react-native';
import { fmtKcal, itemTotals, per100FromPortion } from '../lib/nutrition';
import type { ItemDraft, Macros } from '../lib/types';
import { Badge, Card, NumField, colors, styles } from './ui';

/**
 * Edycja jednego składnika. Pola kcal/B/W/T dotyczą PORCJI o podanej gramaturze.
 * - zmiana gramatury -> wartości przeliczają się automatycznie (stałe wartości na 100 g),
 * - zmiana wartości porcji -> przeliczamy wartość na 100 g.
 */
export function ItemEditor({
  item,
  onChange,
  onRemove,
}: {
  item: ItemDraft;
  onChange: (next: ItemDraft) => void;
  onRemove: () => void;
}) {
  const totals = itemTotals(item);

  const setPortion = (key: keyof Macros, value: number) => {
    const v100 = per100FromPortion(value, item.grams);
    if (v100 === null) return; // bez gramatury nie da się przeliczyć
    onChange({ ...item, per100: { ...item.per100, [key]: v100 } });
  };

  return (
    <Card style={{ gap: 10 }}>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 1, fontWeight: '600' }]}
          value={item.name}
          placeholder="Nazwa składnika"
          onChangeText={(name) => onChange({ ...item, name })}
        />
        <Pressable onPress={onRemove} hitSlop={10} accessibilityLabel="Usuń składnik">
          <Text style={{ color: colors.danger, fontSize: 22, paddingHorizontal: 6 }}>✕</Text>
        </Pressable>
      </View>

      <View style={styles.row}>
        <Field label="Gramatura (g)" flex={1.2}>
          <NumField value={item.grams} decimals={0} onChange={(grams) => onChange({ ...item, grams })} />
        </Field>
        <Field label="kcal" flex={1}>
          <NumField value={totals.kcal} decimals={0} onChange={(v) => setPortion('kcal', v)} editable={item.grams > 0} />
        </Field>
      </View>
      <View style={styles.row}>
        <Field label="Białko (g)">
          <NumField value={totals.protein} decimals={1} onChange={(v) => setPortion('protein', v)} editable={item.grams > 0} />
        </Field>
        <Field label="Węgle (g)">
          <NumField value={totals.carbs} decimals={1} onChange={(v) => setPortion('carbs', v)} editable={item.grams > 0} />
        </Field>
        <Field label="Tłuszcz (g)">
          <NumField value={totals.fat} decimals={1} onChange={(v) => setPortion('fat', v)} editable={item.grams > 0} />
        </Field>
      </View>

      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Text style={styles.muted}>
          na 100 g: {fmtKcal(item.per100.kcal)} kcal · B {item.per100.protein.toFixed(1)} · W {item.per100.carbs.toFixed(1)} · T{' '}
          {item.per100.fat.toFixed(1)}
        </Text>
        {item.aiEstimated && <Badge text="≈ AI" />}
      </View>
      {!(item.grams > 0) && <Text style={styles.error}>Podaj gramaturę większą od 0.</Text>}
    </Card>
  );
}

function Field({ label, children, flex = 1 }: { label: string; children: React.ReactNode; flex?: number }) {
  return (
    <View style={{ flex }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}
