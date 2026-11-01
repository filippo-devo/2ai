import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Suspense } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { colors } from '../components/ui';
import { migrateDbIfNeeded } from '../db/schema';

const DB_NAME = 'calai.db';

function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <ActivityIndicator />
    </View>
  );
}

export default function RootLayout() {
  return (
    <Suspense fallback={<Loading />}>
      {/* Lokalna baza SQLite w pamięci telefonu – dane zostają po zamknięciu i ponownym uruchomieniu aplikacji. */}
      <SQLiteProvider databaseName={DB_NAME} onInit={migrateDbIfNeeded} useSuspense>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'CalAI' }} />
          <Stack.Screen name="day/[date]" options={{ title: 'Dzień' }} />
          <Stack.Screen name="history" options={{ title: 'Historia' }} />
          <Stack.Screen name="settings" options={{ title: 'Cele i ustawienia' }} />
          <Stack.Screen name="analyze" options={{ title: 'Analiza zdjęcia' }} />
          <Stack.Screen name="meal/[id]" options={{ title: 'Posiłek' }} />
        </Stack>
      </SQLiteProvider>
    </Suspense>
  );
}
