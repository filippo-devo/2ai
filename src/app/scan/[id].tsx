import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EditableItem } from '../../components/EditableItem';
import { Button, Icon, colors, fonts, type IconName } from '../../components/ui';
import { fmtG, fmtKcal, fmtNum } from '../../lib/nutrition';
import { retryScan, switchToManual } from '../../lib/scan';
import { emptyItem, entryTotals, session, useEntry, type QuickEntry } from '../../lib/session';

const ERROR_TITLES: Record<string, string> = {
  NO_FOOD: 'Nie widzę tu jedzenia',
  UNREADABLE: 'Nie mogę tego odczytać',
  NO_LABEL: 'Nie widzę etykiety',
  PRODUCT_NOT_FOUND: 'Nie znam tego produktu',
  NO_NUTRITION: 'Brak wartości odżywczych',
  BACKEND_UNREACHABLE: 'Brak połączenia',
  TIMEOUT: 'Trwa to zbyt długo',
  RATE_LIMITED: 'Chwila przerwy',
};

const HERO_ICON: Record<QuickEntry['source'], IconName> = {
  photo: 'restaurant-outline',
  label: 'document-text-outline',
  barcode: 'barcode-outline',
  text: 'chatbubble-ellipses-outline',
  manual: 'create-outline',
};

export default function ScanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = useEntry(id);
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  // Wpis ręczny: od razu rozwijamy pierwszy (pusty) składnik do edycji.
  const [editingName, setEditingName] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(() =>
    entry?.source === 'manual' && entry.items.length === 1 && !entry.items[0].name ? entry.items[0].key : null,
  );

  if (!entry) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <Text style={s.title}>Ten wynik już zniknął</Text>
        <Button title="Wróć do aparatu" onPress={() => router.navigate('/')} style={{ marginTop: 16 }} />
      </View>
    );
  }

  const heroH = entry.image ? Math.round(height * 0.42) : 210;
  const totals = entryTotals(entry);
  const time = new Date(entry.at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  const updateItems = (items: QuickEntry['items']) => session.patch(entry.id, { items });
  const isProduct = entry.source === 'barcode' || entry.source === 'label';
  const canFix = entry.status === 'done' && (entry.source === 'photo' || entry.source === 'text');
  const dark = !!entry.image;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}>
        {/* Zdjęcie / nagłówek */}
        <View style={{ height: heroH, backgroundColor: dark ? '#111' : colors.chip }}>
          {entry.image ? (
            <Image source={{ uri: entry.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={s.plainHero}>
              <Icon name={HERO_ICON[entry.source]} size={34} color={colors.muted} />
              {entry.source === 'barcode' && entry.code && <Text style={s.code}>{entry.code}</Text>}
              {entry.source === 'text' && entry.text && (
                <Text style={s.quote} numberOfLines={3}>
                  „{entry.text}”
                </Text>
              )}
            </View>
          )}
          {entry.status === 'analyzing' && (entry.image ? <ScanOverlay height={heroH} /> : <View style={s.plainLoading}><ActivityIndicator color={colors.text} /></View>)}
        </View>

        <View style={[s.heroBar, { top: insets.top + 8 }]}>
          <HeroButton icon="arrow-back" label="Wróć" dark={dark} onPress={() => router.back()} />
          <HeroButton
            icon="trash-outline"
            label="Usuń"
            dark={dark}
            onPress={() => {
              session.remove(entry.id);
              router.back();
            }}
          />
        </View>

        {/* Arkusz z wynikiem */}
        <View style={s.sheet}>
          {entry.status === 'analyzing' && <Skeleton label={entry.source === 'barcode' ? 'Szukam produktu…' : entry.source === 'label' ? 'Czytam etykietę…' : 'Analizuję posiłek…'} />}

          {entry.status === 'error' && (
            <View style={{ gap: 14 }}>
              <Text style={s.title}>{ERROR_TITLES[entry.error?.code ?? ''] ?? 'Coś poszło nie tak'}</Text>
              <Text style={s.body}>{entry.error?.message}</Text>
              {(entry.error?.code === 'PRODUCT_NOT_FOUND' || entry.error?.code === 'NO_NUTRITION') && (
                <Button
                  title="Zrób zdjęcie etykiety"
                  icon="document-text-outline"
                  onPress={() => {
                    session.remove(entry.id);
                    router.navigate({ pathname: '/', params: { mode: 'label' } });
                  }}
                />
              )}
              <Button title="Spróbuj ponownie" icon="refresh" variant="secondary" onPress={() => retryScan(db, entry.id)} />
              <Button title="Wpisz ręcznie" icon="create-outline" variant="secondary" onPress={() => switchToManual(entry.id)} />
            </View>
          )}

          {entry.status === 'done' && (
            <View style={{ gap: 18 }}>
              <View style={s.timeRow}>
                <View style={s.timePill}>
                  <Text style={s.timeText}>{time}</Text>
                </View>
                {isProduct && (
                  <View style={s.sourcePill}>
                    <Icon name={HERO_ICON[entry.source]} size={13} color={colors.muted} />
                    <Text style={s.timeText}>{entry.source === 'barcode' ? 'Kod kreskowy' : 'Etykieta'}</Text>
                  </View>
                )}
              </View>

              <View style={s.titleRow}>
                {editingName ? (
                  <TextInput
                    style={[s.title, { flex: 1 }]}
                    value={entry.name}
                    placeholder="Nazwa posiłku"
                    placeholderTextColor={colors.muted}
                    onChangeText={(name) => session.patch(entry.id, { name })}
                    onBlur={() => setEditingName(false)}
                    onSubmitEditing={() => setEditingName(false)}
                    returnKeyType="done"
                    autoFocus
                  />
                ) : (
                  <Pressable style={{ flex: 1 }} onPress={() => setEditingName(true)} accessibilityRole="button" accessibilityLabel="Zmień nazwę">
                    <Text style={[s.title, !entry.name && { color: colors.muted }]}>{entry.name || 'Nazwa posiłku'}</Text>
                  </Pressable>
                )}
                <Servings value={entry.servings} onChange={(servings) => session.patch(entry.id, { servings })} />
              </View>

              {isProduct && entry.items.length === 1 && <Measurement entry={entry} />}

              <View style={s.kcalCard}>
                <View style={s.kcalIcon}>
                  <MaterialCommunityIcons name="fire" size={26} color={colors.text} />
                </View>
                <View>
                  <Text style={s.kcalLabel}>Kalorie</Text>
                  <Text style={s.kcalValue}>{fmtKcal(totals.kcal)}</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <MacroTile label="Białko" value={totals.protein} color={colors.protein} icon="food-drumstick" />
                <MacroTile label="Węgle" value={totals.carbs} color={colors.carbs} icon="barley" />
                <MacroTile label="Tłuszcze" value={totals.fat} color={colors.fat} icon="water" />
              </View>

              <View style={s.sectionRow}>
                <Text style={s.section}>Składniki</Text>
                <Pressable
                  onPress={() => {
                    const it = emptyItem();
                    updateItems([...entry.items, it]);
                    setOpenKey(it.key);
                  }}
                  hitSlop={8}
                  style={s.addLink}
                  accessibilityRole="button"
                  accessibilityLabel="Dodaj składnik"
                >
                  <Icon name="add" size={18} color={colors.muted} />
                  <Text style={s.addText}>Dodaj</Text>
                </Pressable>
              </View>
              <View style={{ gap: 10, marginTop: -6 }}>
                {entry.items.map((item) => (
                  <EditableItem
                    key={item.key}
                    item={item}
                    open={openKey === item.key}
                    onToggle={() => setOpenKey(openKey === item.key ? null : item.key)}
                    onChange={(next) => updateItems(entry.items.map((i) => (i.key === item.key ? next : i)))}
                    onRemove={() => updateItems(entry.items.filter((i) => i.key !== item.key))}
                  />
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Dolny pasek jak w Cal AI: Popraw + Gotowe */}
      {entry.status === 'done' && (
        <View style={[s.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          {canFix && (
            <Pressable
              onPress={() => router.push({ pathname: '/fix/[id]', params: { id: entry.id } })}
              style={({ pressed }) => [s.fixBtn, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
            >
              <Icon name="sparkles-outline" size={18} />
              <Text style={s.fixText}>Popraw</Text>
            </Pressable>
          )}
          <Pressable onPress={() => router.back()} style={({ pressed }) => [s.doneBtn, pressed && { opacity: 0.8 }]} accessibilityRole="button">
            <Text style={s.doneText}>Gotowe</Text>
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

/** Liczba porcji: − 1 + (krok 0,5). */
function Servings({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View style={s.servings}>
      <Pressable onPress={() => onChange(Math.max(0.5, value - 0.5))} hitSlop={8} accessibilityLabel="Mniej porcji" style={s.servBtn}>
        <Icon name="remove" size={16} />
      </Pressable>
      <Text style={s.servValue}>{fmtNum(value, 1)}</Text>
      <Pressable onPress={() => onChange(value + 0.5)} hitSlop={8} accessibilityLabel="Więcej porcji" style={s.servBtn}>
        <Icon name="add" size={16} />
      </Pressable>
    </View>
  );
}

/** Miara dla produktu: porcja / opakowanie / 100 g (zmienia gramaturę produktu). */
function Measurement({ entry }: { entry: QuickEntry }) {
  const item = entry.items[0];
  const options: { label: string; grams: number }[] = [];
  if (entry.portions?.serving) options.push({ label: `Porcja · ${entry.portions.serving} g`, grams: entry.portions.serving });
  if (entry.portions?.package) options.push({ label: `Opakowanie · ${entry.portions.package} g`, grams: entry.portions.package });
  options.push({ label: '100 g', grams: 100 });
  return (
    <View style={{ gap: 10 }}>
      <Text style={s.sectionSmall}>Miara</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {options.map((o) => {
          const active = Math.round(item.grams) === o.grams;
          return (
            <Pressable
              key={o.label}
              onPress={() => session.patch(entry.id, { items: [{ ...item, grams: o.grams }] })}
              style={[s.chip, active && s.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[s.chipText, active && { color: '#fff' }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function HeroButton({ icon, label, onPress, dark }: { icon: IconName; label: string; onPress: () => void; dark: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={[s.heroBtn, !dark && s.heroBtnLight]}>
      <Icon name={icon} size={20} color={dark ? '#fff' : colors.text} />
    </Pressable>
  );
}

function MacroTile({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
}) {
  return (
    <View style={s.macro}>
      <View style={s.macroHead}>
        <MaterialCommunityIcons name={icon} size={15} color={color} />
        <Text style={s.macroLabel}>{label}</Text>
      </View>
      <Text style={s.macroValue}>{fmtG(value)} g</Text>
    </View>
  );
}

/** Przyciemnienie zdjęcia z przesuwającą się linią skanowania. */
function ScanOverlay({ height }: { height: number }) {
  const [y] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [y]);
  const translateY = y.interpolate({ inputRange: [0, 1], outputRange: [height * 0.12, height * 0.85] });
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)' }]}>
      <Animated.View style={[s.scanLine, { transform: [{ translateY }] }]} />
    </View>
  );
}

function Skeleton({ label }: { label: string }) {
  const [o] = useState(() => new Animated.Value(0.45));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(o, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [o]);
  return (
    <View style={{ gap: 14 }}>
      <View style={s.analyzingRow}>
        <ActivityIndicator color={colors.text} />
        <Text style={s.analyzingText}>{label}</Text>
      </View>
      <Animated.View style={{ gap: 12, opacity: o }}>
        <View style={[s.skel, { width: '65%', height: 26 }]} />
        <View style={[s.skel, { height: 88, borderRadius: 20, marginTop: 6 }]} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={[s.skel, { flex: 1, height: 72, borderRadius: 18 }]} />
          <View style={[s.skel, { flex: 1, height: 72, borderRadius: 18 }]} />
          <View style={[s.skel, { flex: 1, height: 72, borderRadius: 18 }]} />
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24 },
  plainHero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32, paddingTop: 24 },
  plainLoading: { position: 'absolute', bottom: 46, left: 0, right: 0, alignItems: 'center' },
  code: { fontFamily: fonts.semibold, fontSize: 16, letterSpacing: 2, color: colors.muted },
  quote: { fontFamily: fonts.medium, fontSize: 17, lineHeight: 24, color: colors.text, textAlign: 'center' },
  heroBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  heroBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.38)', alignItems: 'center', justifyContent: 'center' },
  heroBtnLight: { backgroundColor: '#fff' },
  sheet: { marginTop: -26, backgroundColor: colors.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 20 },
  timeRow: { flexDirection: 'row', gap: 8 },
  timePill: { alignSelf: 'flex-start', backgroundColor: colors.chip, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  sourcePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.chip, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  timeText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.muted },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: -6 },
  title: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 32, color: colors.text, padding: 0 },
  body: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22, color: colors.text },
  servings: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 999, padding: 4 },
  servBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  servValue: { minWidth: 26, textAlign: 'center', fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  sectionSmall: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.chip },
  chipActive: { backgroundColor: colors.text },
  chipText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  kcalCard: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.border },
  kcalIcon: { width: 52, height: 52, borderRadius: 14, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  kcalLabel: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted },
  kcalValue: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 38, color: colors.text },
  macro: { flex: 1, borderRadius: 18, padding: 12, gap: 6, borderWidth: 1, borderColor: colors.border },
  macroHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  macroLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  macroValue: { fontFamily: fonts.bold, fontSize: 18, color: colors.text },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  section: { fontFamily: fonts.bold, fontSize: 18, color: colors.text },
  addLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  addText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.muted },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.bg, borderTopWidth: 1, borderColor: colors.border },
  fixBtn: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: colors.text, paddingVertical: 15 },
  fixText: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  doneBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: colors.text, paddingVertical: 15 },
  doneText: { fontFamily: fonts.bold, fontSize: 15, color: '#fff' },
  scanLine: { position: 'absolute', left: 24, right: 24, height: 3, borderRadius: 2, backgroundColor: '#fff', shadowColor: '#fff', shadowOpacity: 0.9, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } },
  analyzingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  analyzingText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  skel: { backgroundColor: colors.chip, borderRadius: 10 },
});
