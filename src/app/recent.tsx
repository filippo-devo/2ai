import { router, Stack } from 'expo-router';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon, colors, fonts } from '../components/ui';
import { fmtKcal, mealTotals } from '../lib/nutrition';
import { session, useSession, type QuickEntry } from '../lib/session';

/** Wyniki z bieżącej sesji (tylko w pamięci – znikają po zamknięciu aplikacji). */
export default function RecentScreen() {
  const { entries } = useSession();
  return (
    <>
      <Stack.Screen
        options={{
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
        contentContainerStyle={{ padding: 20, gap: 12 }}
        data={entries}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => <Row entry={item} />}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyTitle}>Jeszcze pusto</Text>
            <Text style={s.emptyText}>Zrób zdjęcie posiłku, a wynik pojawi się tutaj.</Text>
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
  const kcal = mealTotals(entry.items).kcal;
  const time = new Date(entry.at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  return (
    <Pressable onPress={() => router.push({ pathname: '/scan/[id]', params: { id: entry.id } })} style={s.row}>
      {entry.image ? (
        <Image source={{ uri: entry.image }} style={s.thumb} />
      ) : (
        <View style={[s.thumb, s.thumbEmpty]}>
          <Icon name={entry.source === 'manual' ? 'create-outline' : 'chatbubble-ellipses-outline'} size={22} color={colors.muted} />
        </View>
      )}
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={s.name} numberOfLines={1}>
          {entry.status === 'analyzing' ? 'Analizuję…' : entry.status === 'error' ? 'Nie udało się' : entry.name || entry.items[0]?.name || 'Posiłek'}
        </Text>
        <Text style={s.time}>{time}</Text>
      </View>
      {entry.status === 'done' && (
        <Text style={s.kcal}>
          {fmtKcal(kcal)} <Text style={s.kcalUnit}>kcal</Text>
        </Text>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  headerAction: { fontFamily: fonts.semibold, fontSize: 15, color: colors.danger, paddingHorizontal: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, borderRadius: 22, padding: 10, paddingRight: 16, borderWidth: 1, borderColor: colors.border },
  thumb: { width: 64, height: 64, borderRadius: 16 },
  thumbEmpty: { backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  time: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted },
  kcal: { fontFamily: fonts.display, fontSize: 26, color: colors.text },
  kcalUnit: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 32, color: colors.text },
  emptyText: { fontFamily: fonts.medium, fontSize: 15, color: colors.muted, textAlign: 'center' },
  diary: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, padding: 16, borderRadius: 18, backgroundColor: colors.chip },
  diaryText: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
});
