import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { MacroLine } from '../components/MacroSummary';
import { Card, ProgressBar, colors, styles } from '../components/ui';
import { getGoals, listDays, DEFAULT_GOALS } from '../db/repo';
import { formatDay } from '../lib/dates';
import { fmtKcal } from '../lib/nutrition';
import type { DaySummary, Goals } from '../lib/types';

export default function HistoryScreen() {
  const db = useSQLiteContext();
  const [days, setDays] = useState<DaySummary[]>([]);
  const [goals, setGoals] = useState<Goals>(DEFAULT_GOALS);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      Promise.all([listDays(db), getGoals(db)]).then(([d, g]) => {
        setDays(d);
        setGoals(g);
        setLoaded(true);
      });
    }, [db]),
  );

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={days}
      keyExtractor={(d) => d.day}
      ListEmptyComponent={loaded ? <Text style={[styles.muted, { textAlign: 'center' }]}>Historia jest pusta.</Text> : undefined}
      renderItem={({ item }) => (
        <Pressable onPress={() => router.push({ pathname: '/day/[date]', params: { date: item.day } })}>
          <Card>
            <View style={[styles.row, { justifyContent: 'space-between' }]}>
              <Text style={[styles.h2, { flex: 1 }]}>{formatDay(item.day)}</Text>
              <Text style={styles.muted}>posiłki: {item.mealCount}</Text>
            </View>
            <Text style={styles.text}>
              {fmtKcal(item.totals.kcal)} / {fmtKcal(goals.kcal)} kcal
            </Text>
            <ProgressBar value={item.totals.kcal} max={goals.kcal} color={colors.kcal} />
            <MacroLine m={item.totals} />
          </Card>
        </Pressable>
      )}
    />
  );
}
