import { router, Stack } from 'expo-router';
import { Pressable, View } from 'react-native';
import { DayView } from '../components/DayView';
import { Icon } from '../components/ui';
import { todayString } from '../lib/dates';

export default function DiaryScreen() {
  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <Pressable onPress={() => router.push('/history')} hitSlop={8} accessibilityLabel="Historia">
                <Icon name="calendar-outline" size={22} />
              </Pressable>
              <Pressable onPress={() => router.push('/settings')} hitSlop={8} accessibilityLabel="Ustawienia">
                <Icon name="settings-outline" size={22} />
              </Pressable>
            </View>
          ),
        }}
      />
      <DayView initialDay={todayString()} showNav />
    </>
  );
}
