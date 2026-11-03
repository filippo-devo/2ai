import { Pressable, Text, View } from 'react-native';
import { MEAL_TYPES, type MealType } from '../lib/types';
import { colors, fonts } from './ui';

export function MealTypePicker({ value, onChange }: { value: MealType; onChange: (t: MealType) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {MEAL_TYPES.map((t) => {
        const active = t.key === value;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: active ? colors.primary : colors.border,
              backgroundColor: active ? colors.primary : '#fff',
            }}
          >
            <Text style={{ color: active ? '#fff' : colors.text, fontFamily: fonts.semibold }}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
