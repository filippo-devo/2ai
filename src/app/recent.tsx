import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon, colors, fonts, type IconName } from '../components/ui';
import { fmtKcal } from '../lib/nutrition';
import { entryName, entryTotals, session, useSession, type QuickEntry } from '../lib/session';

const ICON: Record<QuickEntry['source'], IconName> = {
  photo: 'restaurant-outline',
  label: 'document-text-outline',
  barcode: 'barcode-outline',
  text: 'chatbubble-ellipses-outline',
  manual: 'create-outline',
};

/** Wyniki z bieżącej sesji (tylko w pamięci – znikają po zamknięciu aplikacji). */
export default function RecentScreen() {
  const { entries } = useSession();
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Ostatnio dodane',
          headerRight: () =>
            entries.length > 0 ? (
              <Pressable onPress={() => session.clear()} hitSlop={8}>
                <Text style={s.headerAction}>Wyczyść</Text>
              </Pressable>
            ) : null,
        }}
      />
      <FlatList
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        data={entries}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => <Row entry={item} />}
        ListEmptyComponent={
          <View style={s.empty}>
            <View style={s.emptyIcon}>
              <Icon name="camera-outline" size={28} color={colors.muted} />
            </View>
            <Text style={s.emptyTitle}>Jeszcze nic tu nie ma</Text>
            <Text style={s.emptyText}>Zrób zdjęcie posiłku, zeskanuj kod albo etykietę.</Text>
          </View>
        }
        ListFooterComponent={
          <Pressable onPress={() => router.push('/diary')} style={s.diary} accessibilityRole="button">
            <Icon name="book-outline" size={18} />
            <Text style={s.diaryText}>Dziennik posiłków</Text>
            <Icon name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        }
      />
    </>
  );
}

function Row({ entry }: { entry: QuickEntry }) {
  const t = entryTotals(entry);
  const time = new Date(entry.at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  return (
    <Pressable onPress={() => router.push({ pathname: '/scan/[id]', params: { id: entry.id } })} style={s.card}>
      {entry.image ? (
        <Image source={{ uri: entry.image }} style={s.thumb} />
      ) : (
        <View style={[s.thumb, s.thumbEmpty]}>
          <Icon name={ICON[entry.source]} size={26} color={colors.muted} />
        </View>
      )}
      <View style={s.info}>
        <View style={s.topLine}>
          <Text style={s.name} numberOfLines={1}>
            {entry.status === 'done' ? entryName(entry) : entry.status === 'error' ? 'Nie udało się' : 'Analizuję…'}
          </Text>
          <View style={s.timePill}>
            <Text style={s.timeText}>{time}</Text>
          </View>
        </View>
        {entry.status === 'analyzing' ? (
          <ActivityIndicator color={colors.text} style={{ alignSelf: 'flex-start' }} />
        ) : entry.status === 'done' ? (
          <>
            <View style={s.kcalRow}>
              <MaterialCommunityIcons name="fire" size={18} color={colors.text} />
              <Text style={s.kcal}>{fmtKcal(t.kcal)} kcal</Text>
            </View>
            <View style={s.macros}>
              <Macro icon="food-drumstick" color={colors.protein} value={t.protein} />
              <Macro icon="barley" color={colors.carbs} value={t.carbs} />
              <Macro icon="water" color={colors.fat} value={t.fat} />
            </View>
          </>
        ) : (
          <Text style={s.error} numberOfLines={2}>
            {entry.error?.message}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function Macro({ icon, color, value }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; color: string; value: number }) {
  return (
    <View style={s.macro}>
      <MaterialCommunityIcons name={icon} size={13} color={color} />
      <Text style={s.macroText}>{Math.round(value)} g</Text>
    </View>
  );
}

const s = StyleSheet.create({
  headerAction: { fontFamily: fonts.semibold, fontSize: 15, color: colors.danger, paddingHorizontal: 6, marginRight: 8 },
  card: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  thumb: { width: 104, height: 104 },
  thumbEmpty: { backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, padding: 14, gap: 8, justifyContent: 'center' },
  topLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  timePill: { backgroundColor: colors.chip, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  timeText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.muted },
  kcalRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  kcal: { fontFamily: fonts.bold, fontSize: 18, color: colors.text },
  macros: { flexDirection: 'row', gap: 12 },
  macro: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  macroText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.muted },
  error: { fontFamily: fonts.medium, fontSize: 13, color: colors.danger },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontFamily: fonts.bold, fontSize: 20, color: colors.text },
  emptyText: { fontFamily: fonts.medium, fontSize: 15, color: colors.muted, textAlign: 'center' },
  diary: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, padding: 16, borderRadius: 18, backgroundColor: colors.chip },
  diaryText: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
});
