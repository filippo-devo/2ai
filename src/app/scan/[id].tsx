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
import { fmtG, fmtKcal, mealTotals } from '../../lib/nutrition';
import { retryScan, switchToManual } from '../../lib/scan';
import { emptyItem, session, useEntry } from '../../lib/session';

const ERROR_TITLES: Record<string, string> = {
  NO_FOOD: 'Nie widzę tu jedzenia',
  UNREADABLE: 'Zdjęcie jest nieczytelne',
  BACKEND_UNREACHABLE: 'Brak połączenia',
  TIMEOUT: 'Trwa to zbyt długo',
  RATE_LIMITED: 'Chwila przerwy',
};

export default function ScanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = useEntry(id);
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  // Wpis ręczny: od razu rozwijamy pierwszy (pusty) składnik do edycji.
  const [openKey, setOpenKey] = useState<string | null>(() =>
    entry?.source === 'manual' && entry.items.length === 1 && !entry.items[0].name ? entry.items[0].key : null,
  );

  if (!entry) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <Text style={s.title}>Ten wynik już zniknął</Text>
        <Button title="Wróć do aparatu" onPress={() => router.replace('/')} style={{ marginTop: 16 }} />
      </View>
    );
  }

  const heroH = entry.image ? Math.round(height * 0.42) : 230;
  const totals = mealTotals(entry.items);
  const time = new Date(entry.at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  const updateItems = (items: typeof entry.items) => session.patch(entry.id, { items });

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {/* Zdjęcie / opis */}
        <View style={{ height: heroH, backgroundColor: '#1A1612' }}>
          {entry.image ? (
            <Image source={{ uri: entry.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={s.textHero}>
              <Icon name={entry.source === 'manual' ? 'create-outline' : 'chatbubble-ellipses-outline'} size={26} color="rgba(255,255,255,0.6)" />
              <Text style={s.quote} numberOfLines={5}>
                {entry.text ? `„${entry.text}”` : 'Wpis ręczny'}
              </Text>
            </View>
          )}
          {entry.status === 'analyzing' && <ScanOverlay height={heroH} />}
        </View>

        {/* Przyciski na zdjęciu */}
        <View style={[s.heroBar, { top: insets.top + 8 }]}>
          <HeroButton icon="chevron-back" label="Wróć" onPress={() => router.back()} />
          <HeroButton
            icon="trash-outline"
            label="Usuń"
            onPress={() => {
              session.remove(entry.id);
              router.back();
            }}
          />
        </View>

        {/* Arkusz z wynikiem */}
        <View style={s.sheet}>
          {entry.status === 'analyzing' && <Skeleton />}

          {entry.status === 'error' && (
            <View style={{ gap: 14 }}>
              <Text style={s.title}>{ERROR_TITLES[entry.error?.code ?? ''] ?? 'Coś poszło nie tak'}</Text>
              <Text style={s.body}>{entry.error?.message}</Text>
              <Button title="Spróbuj ponownie" icon="refresh" onPress={() => retryScan(db, entry.id)} />
              <Button title="Wpisz ręcznie" icon="create-outline" variant="secondary" onPress={() => switchToManual(entry.id)} />
            </View>
          )}

          {entry.status === 'done' && (
            <View style={{ gap: 16 }}>
              <View>
                <TextInput
                  style={s.title}
                  value={entry.name}
                  placeholder="Nazwa posiłku"
                  placeholderTextColor={colors.muted}
                  onChangeText={(name) => session.patch(entry.id, { name })}
                  multiline
                />
                <Text style={s.time}>Dziś, {time}</Text>
              </View>

              <View style={s.kcalCard}>
                <View style={s.flame}>
                  <Icon name="flame" size={22} color="#fff" />
                </View>
                <View>
                  <Text style={s.kcalLabel}>Kalorie</Text>
                  <Text style={s.kcalValue}>{fmtKcal(totals.kcal)}</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <MacroTile label="Białko" value={totals.protein} color={colors.protein} />
                <MacroTile label="Węgle" value={totals.carbs} color={colors.carbs} />
                <MacroTile label="Tłuszcze" value={totals.fat} color={colors.fat} />
              </View>

              <Text style={s.section}>Składniki</Text>
              <View style={{ gap: 10 }}>
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
                <Pressable
                  style={s.addRow}
                  onPress={() => {
                    const it = emptyItem();
                    updateItems([...entry.items, it]);
                    setOpenKey(it.key);
                  }}
                  accessibilityRole="button"
                >
                  <Icon name="add" size={20} />
                  <Text style={s.addText}>Dodaj składnik</Text>
                </Pressable>
              </View>

              <Button title="Gotowe" onPress={() => router.back()} style={{ marginTop: 6 }} />
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function HeroButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={s.heroBtn}>
      <Icon name={icon} size={20} color="#fff" />
    </Pressable>
  );
}

function MacroTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={s.macro}>
      <View style={[s.macroDot, { backgroundColor: color }]} />
      <Text style={s.macroValue}>
        {fmtG(value)}
        <Text style={s.macroUnit}> g</Text>
      </Text>
      <Text style={s.macroLabel}>{label}</Text>
    </View>
  );
}

/** Przyciemnienie zdjęcia z przesuwającą się linią skanowania i kółkiem ładowania. */
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
    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
      <Animated.View style={[s.scanLine, { transform: [{ translateY }] }]} />
      <View style={s.analyzing}>
        <ActivityIndicator color="#fff" />
        <Text style={s.analyzingText}>Analizuję posiłek</Text>
      </View>
    </View>
  );
}

function Skeleton() {
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
    <Animated.View style={{ gap: 12, opacity: o }}>
      <View style={[s.skel, { width: '70%', height: 30 }]} />
      <View style={[s.skel, { width: '35%', height: 14 }]} />
      <View style={[s.skel, { height: 92, borderRadius: 22, marginTop: 8 }]} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={[s.skel, { flex: 1, height: 84, borderRadius: 20 }]} />
        <View style={[s.skel, { flex: 1, height: 84, borderRadius: 20 }]} />
        <View style={[s.skel, { flex: 1, height: 84, borderRadius: 20 }]} />
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24 },
  textHero: { flex: 1, justifyContent: 'flex-end', padding: 24, paddingBottom: 48, gap: 12 },
  quote: { fontFamily: fonts.displayItalic, fontSize: 30, lineHeight: 36, color: '#fff' },
  heroBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  heroBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.42)', alignItems: 'center', justifyContent: 'center' },
  sheet: { marginTop: -28, backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 24 },
  title: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, color: colors.text, padding: 0 },
  time: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted, marginTop: 4 },
  body: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22, color: colors.text },
  kcalCard: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: colors.card, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: colors.border },
  flame: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  kcalLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.muted },
  kcalValue: { fontFamily: fonts.display, fontSize: 52, lineHeight: 56, color: colors.text },
  macro: { flex: 1, backgroundColor: colors.card, borderRadius: 20, padding: 14, gap: 6, borderWidth: 1, borderColor: colors.border },
  macroDot: { width: 10, height: 10, borderRadius: 5 },
  macroValue: { fontFamily: fonts.bold, fontSize: 20, color: colors.text },
  macroUnit: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted },
  macroLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  section: { fontFamily: fonts.display, fontSize: 26, color: colors.text, marginTop: 6 },
  addRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.muted, paddingVertical: 14 },
  addText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  scanLine: { position: 'absolute', left: 24, right: 24, height: 3, borderRadius: 2, backgroundColor: '#fff', shadowColor: '#fff', shadowOpacity: 0.9, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } },
  analyzing: { position: 'absolute', bottom: 48, left: 0, right: 0, alignItems: 'center', gap: 8 },
  analyzingText: { fontFamily: fonts.semibold, fontSize: 15, color: '#fff' },
  skel: { backgroundColor: '#E6E0D6', borderRadius: 10 },
});
