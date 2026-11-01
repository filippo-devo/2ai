import { router, Stack } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { DayView } from '../components/DayView';
import { todayString } from '../lib/dates';

export default function TodayScreen() {
  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <Pressable onPress={() => router.push('/history')} hitSlop={8}>
                <Text style={{ fontSize: 15, fontWeight: '600' }}>Historia</Text>
              </Pressable>
              <Pressable onPress={() => router.push('/settings')} hitSlop={8}>
                <Text style={{ fontSize: 15, fontWeight: '600' }}>Ustawienia</Text>
              </Pressable>
            </View>
          ),
        }}
      />
      <DayView initialDay={todayString()} showNav />
    </>
  );
}
