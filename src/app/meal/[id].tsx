import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { ItemEditor } from '../../components/ItemEditor';
import { MacroLine } from '../../components/MacroSummary';
import { MealTypePicker } from '../../components/MealTypePicker';
import { Button, Card, Icon, styles } from '../../components/ui';
import { deleteMeal, getMeal, saveMeal } from '../../db/repo';
import { addDays, defaultMealType, formatDay, isValidDay, todayString } from '../../lib/dates';
import { dropDraft, getDraft, newKey } from '../../lib/draft';
import { mealTotals } from '../../lib/nutrition';
import { deletePhoto, persistPhoto, photoUri } from '../../lib/photos';
import type { ItemDraft, MealDraft } from '../../lib/types';


function emptyItem(): ItemDraft {
  return { key: newKey(), name: '', grams: 100, per100: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, aiEstimated: false };
}

export default function MealScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ id: string; draft?: string; day?: string }>();
  const isNew = params.id === 'new';
  // Nowy posiłek: szkic z analizy AI albo pusty formularz – liczony raz przy montowaniu ekranu.
  const [meal, setMeal] = useState<MealDraft | null>(() =>
    isNew
      ? (getDraft(params.draft) ?? {
          day: isValidDay(params.day) ? params.day : todayString(),
          mealType: defaultMealType(),
          name: '',
          photoFile: null,
          source: 'manual',
          aiConfidence: null,
          aiNotes: null,
          items: [emptyItem()],
        })
      : null,
  );
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);

  // Istniejący posiłek: wczytanie z bazy.
  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    getMeal(db, Number(params.id)).then((m) => {
      if (cancelled) return;
      if (m) setMeal(m);
      else setNotFound(true);
    });
    return () => {
      cancelled = true;
    };
  }, [db, isNew, params.id]);

  if (notFound) return <Text style={[styles.error, { padding: 16 }]}>Nie znaleziono posiłku (mógł zostać usunięty).</Text>;
  if (!meal) return <ActivityIndicator style={{ marginTop: 32 }} />;

  const totals = mealTotals(meal.items);
  const previewUri = meal.tempPhotoUri ?? photoUri(meal.photoFile);
  const update = (patch: Partial<MealDraft>) => setMeal({ ...meal, ...patch });
  const updateItem = (key: string, next: ItemDraft) => update({ items: meal.items.map((i) => (i.key === key ? next : i)) });

  async function onSave() {
    if (!meal) return;
    const items = meal.items.map((i) => ({ ...i, name: i.name.trim() }));
    if (items.length === 0) return Alert.alert('Brak składników', 'Dodaj co najmniej jeden składnik.');
    if (items.some((i) => !i.name)) return Alert.alert('Brak nazwy', 'Każdy składnik musi mieć nazwę.');
    if (items.some((i) => !(i.grams > 0))) return Alert.alert('Brak gramatury', 'Każdy składnik musi mieć gramaturę większą od 0.');

    setSaving(true);
    let newPhoto: string | null = null;
    try {
      let photoFile = meal.photoFile;
      if (meal.tempPhotoUri) {
        // Kopiujemy zdjęcie z pamięci tymczasowej do trwałego katalogu aplikacji.
        newPhoto = await persistPhoto(meal.tempPhotoUri);
        photoFile = newPhoto;
      }
      const name = meal.name.trim() || items.map((i) => i.name).slice(0, 3).join(', ');
      await saveMeal(db, { ...meal, name, items, photoFile, tempPhotoUri: null });
      dropDraft(params.draft);
      router.back();
    } catch (e) {
      if (newPhoto) deletePhoto(newPhoto);
      Alert.alert('Nie udało się zapisać', String(e));
      setSaving(false);
    }
  }

  function onDelete() {
    if (!meal?.id) return;
    Alert.alert('Usunąć posiłek?', 'Tej operacji nie można cofnąć.', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: async () => {
          const photo = await deleteMeal(db, meal.id!);
          deletePhoto(photo);
          router.back();
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: isNew ? 'Nowy posiłek' : 'Edycja posiłku' }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {previewUri && <Image source={{ uri: previewUri }} style={{ width: '100%', height: 200, borderRadius: 12 }} resizeMode="cover" />}

        {meal.aiNotes && <Text style={styles.muted}>{meal.aiNotes}</Text>}

        <Card>
          <Text style={styles.label}>Nazwa posiłku</Text>
          <TextInput style={styles.input} value={meal.name} onChangeText={(name) => update({ name })} placeholder="np. Kurczak z ryżem" />
          <Text style={styles.label}>Rodzaj</Text>
          <MealTypePicker value={meal.mealType} onChange={(mealType) => update({ mealType })} />
          <Text style={styles.label}>Dzień</Text>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Pressable onPress={() => update({ day: addDays(meal.day, -1) })} hitSlop={10}>
              <Icon name="chevron-back" size={22} />
            </Pressable>
            <Text style={[styles.text, { flex: 1, textAlign: 'center' }]}>{formatDay(meal.day)}</Text>
            <Pressable onPress={() => update({ day: addDays(meal.day, 1) })} hitSlop={10}>
              <Icon name="chevron-forward" size={22} />
            </Pressable>
          </View>
        </Card>

        <Card>
          <Text style={styles.h2}>Razem</Text>
          <MacroLine m={totals} />
        </Card>

        <Text style={styles.h2}>Składniki</Text>
        {meal.items.map((item) => (
          <ItemEditor
            key={item.key}
            item={item}
            onChange={(next) => updateItem(item.key, next)}
            onRemove={() => update({ items: meal.items.filter((i) => i.key !== item.key) })}
          />
        ))}
        <Button title="+ Dodaj składnik" variant="secondary" onPress={() => update({ items: [...meal.items, emptyItem()] })} />

        <Button title={saving ? 'Zapisuję…' : 'Zapisz posiłek'} onPress={onSave} disabled={saving} />
        {!isNew && <Button title="Usuń posiłek" variant="danger" onPress={onDelete} disabled={saving} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
