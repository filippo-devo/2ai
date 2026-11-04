import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, colors, fonts } from '../../components/ui';
import { fixScan } from '../../lib/scan';

/** „Popraw wynik”: opisz, co się nie zgadza – model przeliczy posiłek jeszcze raz (ze zdjęciem). */
export default function FixScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.root, { paddingTop: Platform.OS === 'ios' ? 18 : insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <Pressable onPress={() => router.back()} style={s.back} accessibilityRole="button" accessibilityLabel="Wróć" hitSlop={8}>
          <Icon name="arrow-back" size={22} />
        </Pressable>

        <View style={s.titleRow}>
          <Icon name="sparkles" size={24} />
          <Text style={s.title}>Popraw wynik</Text>
        </View>

        <TextInput
          style={s.input}
          value={text}
          onChangeText={setText}
          placeholder="Opisz, co trzeba poprawić"
          placeholderTextColor={colors.muted}
          multiline
          autoFocus
          maxLength={500}
          textAlignVertical="top"
        />

        <View style={s.example}>
          <Text style={s.exampleText}>
            <Text style={{ fontFamily: fonts.bold }}>Przykład: </Text>W sałatce brakuje awokado i fety, a kurczak był smażony na maśle.
          </Text>
        </View>

        <View style={{ flex: 1 }} />

        <Pressable
          onPress={() => {
            fixScan(db, id, text);
            router.back();
          }}
          disabled={text.trim().length < 2}
          style={({ pressed }) => [s.update, (pressed || text.trim().length < 2) && { opacity: 0.5 }]}
          accessibilityRole="button"
        >
          <Text style={s.updateText}>Aktualizuj</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20, gap: 18 },
  back: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  title: { fontFamily: fonts.bold, fontSize: 26, color: colors.text },
  input: { minHeight: 56, backgroundColor: colors.chip, borderRadius: 16, padding: 16, fontFamily: fonts.medium, fontSize: 16, color: colors.text },
  example: { backgroundColor: colors.chip, borderRadius: 16, padding: 16 },
  exampleText: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22, color: colors.text },
  update: { backgroundColor: colors.text, borderRadius: 999, paddingVertical: 16, alignItems: 'center' },
  updateText: { fontFamily: fonts.bold, fontSize: 16, color: '#fff' },
});
