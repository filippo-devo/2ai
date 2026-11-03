import { InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, useFonts } from '@expo-google-fonts/manrope';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Suspense } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { colors, fonts } from '../components/ui';
import { migrateDbIfNeeded } from '../db/schema';

const DB_NAME = 'calai.db';

function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
      <ActivityIndicator color="#fff" />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });
  // Gdyby czcionki się nie wczytały, aplikacja i tak startuje (z czcionką systemową).
  if (!fontsLoaded && !fontError) return <Loading />;

  return (
    <Suspense fallback={<Loading />}>
      {/* Lokalna baza SQLite – używa jej tylko Dziennik. Szybkie skany są wyłącznie w pamięci. */}
      <SQLiteProvider databaseName={DB_NAME} onInit={migrateDbIfNeeded} useSuspense>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerShadowVisible: false,
            headerTitleStyle: { fontFamily: fonts.bold, fontSize: 17, color: colors.text },
            headerTintColor: colors.text,
            headerBackButtonDisplayMode: 'minimal',
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false, contentStyle: { backgroundColor: '#000' } }} />
          <Stack.Screen name="scan/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="describe" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="recent" options={{ title: 'Ostatnie' }} />
          <Stack.Screen name="diary" options={{ title: 'Dziennik' }} />
          <Stack.Screen name="day/[date]" options={{ title: 'Dzień' }} />
          <Stack.Screen name="history" options={{ title: 'Historia' }} />
          <Stack.Screen name="settings" options={{ title: 'Ustawienia' }} />
          <Stack.Screen name="analyze" options={{ title: 'Analiza zdjęcia' }} />
          <Stack.Screen name="meal/[id]" options={{ title: 'Posiłek' }} />
        </Stack>
      </SQLiteProvider>
    </Suspense>
  );
}
