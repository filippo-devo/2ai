import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { getGoals, listMealsForDay, DEFAULT_GOALS } from '../db/repo';
import { addDays, formatDay, todayString } from '../lib/dates';
import { sumMacros } from '../lib/nutrition';
import { photoUri } from '../lib/photos';
import { MEAL_TYPES, type Goals, type MealSummary } from '../lib/types';
import { MacroLine, MacroSummary } from './MacroSummary';
import { Button, Card, Icon, colors, styles } from './ui';

export function DayView({ initialDay, showNav }: { initialDay: string; showNav?: boolean }) {
  const db = useSQLiteContext();
  const [day, setDay] = useState(initialDay);
  const [goals, setGoals] = useState<Goals>(DEFAULT_GOALS);
  const [meals, setMeals] = useState<MealSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [g, m] = await Promise.all([getGoals(db), listMealsForDay(db, day)]);
      setGoals(g);
      setMeals(m);
      setError(null);
    } catch (e) {
      setError(`Błąd odczytu danych: ${String(e)}`);
    }
  }, [db, day]);

  // Odświeżaj po powrocie na ekran (np. po zapisaniu posiłku).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const totals = sumMacros(meals.map((m) => m.totals));

  async function pickPhoto(fromCamera: boolean) {
    try {
      let result: ImagePicker.ImagePickerResult;
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Brak dostępu do aparatu', 'Zezwól Expo Go na dostęp do aparatu w ustawieniach telefonu albo wybierz zdjęcie z galerii.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      }
      if (result.canceled || !result.assets?.[0]) return;
      const a = result.assets[0];
      router.push({
        pathname: '/analyze',
        params: { uri: a.uri, width: String(a.width ?? 0), height: String(a.height ?? 0), day },
      });
    } catch (e) {
      Alert.alert('Nie udało się pobrać zdjęcia', String(e));
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        {showNav ? (
          <Pressable onPress={() => setDay(addDays(day, -1))} hitSlop={12} accessibilityLabel="Poprzedni dzień">
            <Icon name="chevron-back" size={24} />
          </Pressable>
        ) : (
          <View />
        )}
        <Pressable onPress={() => showNav && setDay(todayString())} style={{ flex: 1 }}>
          <Text style={[styles.h2, { textAlign: 'center' }]}>{formatDay(day)}</Text>
        </Pressable>
        {showNav ? (
          <Pressable onPress={() => setDay(addDays(day, 1))} hitSlop={12} accessibilityLabel="Następny dzień">
            <Icon name="chevron-forward" size={24} />
          </Pressable>
        ) : (
          <View />
        )}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <MacroSummary totals={totals} goals={goals} />

      <View style={styles.row}>
        <Button title="Aparat" icon="camera-outline" onPress={() => pickPhoto(true)} style={{ flex: 1 }} disabled={Platform.OS === 'web'} />
        <Button title="Galeria" icon="images-outline" variant="secondary" onPress={() => pickPhoto(false)} style={{ flex: 1 }} />
      </View>
      <Button
        title="Dodaj ręcznie"
        icon="create-outline"
        variant="secondary"
        onPress={() => router.push({ pathname: '/meal/[id]', params: { id: 'new', day } })}
      />

      {MEAL_TYPES.map((t) => {
        const list = meals.filter((m) => m.mealType === t.key);
        if (list.length === 0) return null;
        return (
          <View key={t.key} style={{ gap: 8 }}>
            <Text style={[styles.h2, { marginTop: 8 }]}>{t.label}</Text>
            {list.map((m) => (
              <MealRow key={m.id} meal={m} />
            ))}
          </View>
        );
      })}
      {meals.length === 0 && <Text style={[styles.muted, { textAlign: 'center', marginTop: 16 }]}>Brak posiłków w tym dniu.</Text>}
    </ScrollView>
  );
}

function MealRow({ meal }: { meal: MealSummary }) {
  const uri = photoUri(meal.photoFile);
  return (
    <Pressable onPress={() => router.push({ pathname: '/meal/[id]', params: { id: String(meal.id) } })}>
      <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        {uri ? (
          <Image source={{ uri }} style={{ width: 56, height: 56, borderRadius: 14 }} />
        ) : (
          <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="restaurant-outline" size={22} color={colors.muted} />
          </View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Text style={[styles.h2, { flex: 1 }]} numberOfLines={1}>
              {meal.name}
            </Text>
          </View>
          <MacroLine m={meal.totals} />
          <Text style={[styles.muted, { color: colors.muted }]}>Składniki: {meal.itemCount}</Text>
        </View>
      </Card>
    </Pressable>
  );
}
