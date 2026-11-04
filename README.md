# CalAI MVP – liczenie kalorii i makro ze zdjęć

Aplikacja mobilna (React Native + Expo SDK 58 + TypeScript) uruchamiana w **Expo Go**, inspirowana działaniem Cal AI.
Wszystkie dane są zapisywane **lokalnie na telefonie**. Do analizy zdjęć służy mały backend uruchamiany na Twoim komputerze.

```
 Telefon (Expo Go)                              Komputer (ta sama sieć Wi-Fi)          Internet
┌──────────────────────────────┐   HTTP/LAN    ┌──────────────────────────┐   HTTPS   ┌──────────────┐
│ SQLite: posiłki, składniki,  │ ── zdjęcie ─▶ │ backend/ (Node, Express) │ ────────▶ │ Claude API   │
│ cele, ustawienia             │ ◀─ wynik ──── │ klucz API tylko w .env   │ ◀──────── │ (Anthropic)  │
│ documents/meal-photos/*.jpg  │               │ nic nie zapisuje         │           └──────────────┘
└──────────────────────────────┘               └──────────────────────────┘
```

## Najprościej: zdjęcie → kalorie (bez zapisywania)

Aplikacja startuje od razu na aparacie. Nie trzeba wpisywać żadnego klucza. Na dole są trzy tryby, jak w Cal AI:

- **Posiłek** – zdjęcie talerza. Widać je z linią skanowania, a po kilkunastu sekundach pojawiają się kalorie, makro i składniki.
- **Kod kreskowy** – wystarczy skierować aparat na kod, spust nie jest potrzebny. Dane produktu pochodzą z bazy Open Food Facts, którą odpytuje serwer.
- **Etykieta** – zdjęcie tabeli wartości odżywczych. Claude odczytuje wartości na 100 g, porcję i masę opakowania.

Na ekranie wyniku:
- **Liczba porcji** (− / +, krok 0,5).
- **Miara** dla produktów: porcja, opakowanie albo 100 g.
- **Edycja składników**: nazwa, gramatura (−/+ 10 g), kalorie i makro. Można też dodać składnik.
- **Popraw** (dla zdjęć i opisów): opisujesz, co się nie zgadza, np. „brakuje fety, kurczak smażony na maśle”, a model przelicza posiłek jeszcze raz ze zdjęciem.

Pozostałe funkcje:
- **Galeria** analizuje zdjęcie z telefonu w bieżącym trybie.
- **Powiedz** pozwala opisać posiłek tekstem albo głosem. Do dyktowania służy mikrofon na systemowej klawiaturze. Stamtąd można też wpisać wartości ręcznie.
- Ikona zegara otwiera listę **Ostatnio dodane** z bieżącej sesji, z linkiem do Dziennika.

Wygląd wzorowany na ekranach Cal AI z Mobbin (skanowanie, szczegóły produktu, „Fix result”, „Recently uploaded”). Czcionki: Manrope oraz Instrument Serif w logo. Ikony: Ionicons i Material Community Icons.

Analizę wykonuje serwer w chmurze: Supabase Edge Function `supabase/functions/calai`. Klucz API Anthropic jest wyłącznie sekretem tej funkcji, nie ma go ani w aplikacji, ani w repozytorium. Funkcję wdraża workflow `.github/workflows/supabase-deploy.yml` z sekretów repozytorium: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` i `ANTHROPIC_API_KEY`. Po wdrożeniu workflow robi jedno prawdziwe testowe zapytanie.

**Nic nie jest zapisywane.** Zdjęcia i wyniki są w aplikacji tylko w pamięci i znikają po jej zamknięciu. Pliki tymczasowe z aparatu są usuwane od razu. Serwer nie zapisuje zdjęć ani wyników. Trzyma tylko w pamięci przybliżony licznik zapytań, który pilnuje limitu 30 analiz na godzinę z jednego adresu IP.

Wszystkie analizy są rozliczane z jednego konta API. Warto ustawić miesięczny limit wydatków w konsoli Anthropic (Settings → Limits).

Pełny dziennik z zapisywaniem posiłków, celami i historią (opisany niżej) jest pod przyciskiem **Dziennik**. Szybka analiza nic do niego nie dopisuje.

## Funkcje

- Dzienne podsumowanie kalorii, białka, węglowodanów i tłuszczów z paskami postępu względem celów.
- Własne dzienne cele (kcal, B, W, T).
- Zdjęcie posiłku aparatem albo wybór z galerii.
- Analiza AI: rozpoznane produkty, szacowana gramatura, kcal i makro dla każdego składnika i całego posiłku. Wyniki są oznaczone jako **szacunkowe**.
- Edycja składników i gramatury z automatycznym przeliczaniem (wartości przechowywane są na 100 g; zmiana gramatury skaluje kcal i makro, a zmiana kcal/makro porcji przelicza wartości na 100 g).
- Typ posiłku: śniadanie, obiad, kolacja, przekąska. Możliwość przeniesienia posiłku na inny dzień.
- Historia dni, edycja i usuwanie posiłków.
- Ręczne dodawanie posiłków bez zdjęcia (działa bez internetu i bez backendu).
- Gdy analiza się nie uda, możesz wpisać składniki ręcznie i zachować zdjęcie. Aplikacja nigdy nie pokazuje wymyślonych wyników.

## Wymagania

- **Node.js 20+** (zalecany 22 LTS) na komputerze.
- Telefon z aplikacją **Expo Go** w najnowszej wersji ze sklepu (projekt używa Expo SDK 58). Jeśli Expo Go zgłasza niezgodną wersję SDK, zaktualizuj ją w App Store lub Google Play.
- Telefon i komputer w **tej samej sieci Wi-Fi**.
- Klucz API Anthropic (https://platform.claude.com → API Keys). Potrzebny tylko do analizy zdjęć.

## Uruchomienie

### 1. Backend (komputer)

```bash
cd backend
npm install
cp .env.example .env        # Windows: copy .env.example .env
```

Otwórz `backend/.env` i wpisz klucz:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Uruchom serwer:

```bash
npm start
```

Backend wypisze adresy, pod którymi jest dostępny w sieci lokalnej, np.:

```
CalAI backend działa na porcie 3001
Model: claude-opus-5-5
Klucz API: skonfigurowany

Wpisz w aplikacji (Ustawienia → Adres backendu) jeden z adresów:
  http://192.168.1.20:3001
```

Szybki test z komputera: otwórz `http://localhost:3001/health` w przeglądarce. Powinieneś zobaczyć `"apiKeyConfigured": true`.

> **Zapora sieciowa:** przy pierwszym uruchomieniu Windows lub macOS może zapytać, czy zezwolić Node.js na połączenia przychodzące. Zezwól dla sieci prywatnej, bo inaczej telefon nie połączy się z portem 3001.

### 2. Aplikacja (Expo Go)

W nowym terminalu, w katalogu głównym projektu:

```bash
npm install
npx expo start
```

W terminalu pojawi się **kod QR**:

- **Android:** otwórz Expo Go → „Scan QR code” i zeskanuj kod.
- **iPhone:** zeskanuj kod systemową aplikacją Aparat i stuknij powiadomienie „Otwórz w Expo Go”. Gdy iOS zapyta o dostęp do **sieci lokalnej** dla Expo Go, zezwól. Bez tego nie połączysz się ani z Metro, ani z backendem.

Jeśli telefon nie może połączyć się z Metro (np. przez izolację klientów w sieci Wi-Fi), spróbuj `npx expo start --tunnel`. Tunel dotyczy tylko kodu aplikacji. Backend nadal musi być osiągalny w sieci lokalnej.

### 2b. Aplikacja w Expo Go bez uruchamiania komputera (EAS Update)

Projekt jest połączony z kontem Expo (`@filiocha/calai-mvp`). Każdy push na `main` uruchamia workflow **EAS Update**, który publikuje aktualną wersję aplikacji na expo.dev. Workflow korzysta z sekretu `EXPO_TOKEN` w repozytorium.

Jak otworzyć aplikację:
- **Expo Go → zaloguj się na konto `filiocha` → Home → Projects → calai-mvp** i wybierz najnowszą aktualizację z gałęzi `main`;
- albo na **expo.dev → Projects → calai-mvp → Updates** otwórz aktualizację i zeskanuj kod QR z podglądu.

Opublikowana wersja nie potrzebuje `npx expo start`. Backend do analizy zdjęć nadal działa lokalnie na komputerze w tej samej sieci Wi-Fi. Dane opublikowanej wersji są zapisywane w Expo Go, tak samo jak przy `npx expo start`.

Ręczna publikacja z komputera (po `npx eas-cli@latest login`):

```bash
npx eas-cli@latest update --branch main --message "opis zmian" --environment preview
```

### 3. Połączenie aplikacji z backendem

W aplikacji: **Ustawienia → Backend do analizy zdjęć** → wpisz adres wypisany przez backend (np. `192.168.1.20:3001`; brakujące `http://` i port `3001` zostaną dodane automatycznie) → **Testuj połączenie**.
Adres jest zapisywany na telefonie. Jeśli komputer dostanie inne IP (np. po restarcie routera), wpisz nowy adres.

## Korzystanie

1. Ekran główny pokazuje bieżący dzień. Strzałkami ‹ › zmieniasz dzień, a stuknięcie daty wraca do dziś.
2. **📷 Aparat** lub **🖼️ Galeria** → opcjonalnie dopisz opis (np. „owsianka na mleku 2%”) → **Analizuj**.
3. Sprawdź i popraw składniki oraz gramaturę, wybierz rodzaj posiłku → **Zapisz posiłek**. Dopiero wtedy zdjęcie jest kopiowane do pamięci aplikacji, a dane trafiają do bazy.
4. **✏️ Dodaj ręcznie** – posiłek bez zdjęcia. Wpisz gramaturę i wartości dla porcji.
5. Stuknij posiłek na liście, aby go edytować lub usunąć. **Historia** pokazuje wszystkie dni z sumami.

## Gdzie są dane i czy przetrwają restart

| Co | Gdzie | Uwagi |
|---|---|---|
| Posiłki, składniki (gramy, wartości na 100 g), daty, typy posiłków | `expo-sqlite`, plik `calai.db` w katalogu aplikacji | tabele `meals`, `meal_items` |
| Cele i adres backendu | ta sama baza, tabela `settings` | |
| Zdjęcia | `expo-file-system`: `Paths.document/meal-photos/meal-….jpg` | w bazie zapisywana jest tylko **nazwa pliku**, a pełna ścieżka jest budowana przy odczycie. Na iOS ścieżka kontenera aplikacji może się zmieniać, więc absolutny URI nie jest trwały. Tymczasowe adresy z aparatu i galerii nie są zapisywane. |

- Po zamknięciu i ponownym uruchomieniu aplikacji dane są odczytywane z bazy przy starcie (`SQLiteProvider` + migracje oparte o `PRAGMA user_version`).
- Historia, cele i ręczne wpisy działają bez internetu i przy wyłączonym backendzie. Internet jest potrzebny tylko do analizy zdjęcia.
- Brak kont, logowania, chmury i synchronizacji.

> ⚠️ **Ważne – dane testowe w Expo Go:** aplikacja działa wewnątrz Expo Go, więc baza i zdjęcia są przechowywane w danych **aplikacji Expo Go**. **Odinstalowanie Expo Go albo wyczyszczenie jej danych lub pamięci** (Android: Ustawienia → Aplikacje → Expo Go → Pamięć → Wyczyść dane) **usunie wszystkie posiłki, cele i zdjęcia**. Zwykłe zamknięcie aplikacji, restart telefonu czy aktualizacja kodu projektu danych nie usuwają. Trwała, samodzielna instalacja wymagałaby własnego buildu (poza zakresem tego MVP).

## Weryfikacja trwałości zapisów

### Test automatyczny (komputer)

```bash
npm run test:db
```

Test uruchamia **ten sam kod warstwy danych co aplikacja** (`src/db/schema.ts`, `src/db/repo.ts`) na prawdziwym pliku SQLite. Zamyka i ponownie otwiera bazę 4 razy, tak jak przy restartach aplikacji. Sprawdza: domyślne i zapisane cele, adres backendu, posiłki ręczne i AI, składniki, nazwy plików zdjęć, sumy dnia, historię, edycję gramatury i przeliczanie, usuwanie z kaskadowym usunięciem składników oraz idempotentne migracje.

### Test ręczny na telefonie (zalecany, 2 minuty)

1. Ustaw cel, np. 1800 kcal. Dodaj posiłek ręcznie i jeden ze zdjęciem.
2. Zamknij Expo Go całkowicie (usuń z listy ostatnich aplikacji), zatrzymaj `npx expo start` i uruchom go ponownie, a potem znów zeskanuj QR.
3. Sprawdź, czy cel, posiłki, zdjęcie i wpis w Historii są na miejscu.
4. Wyłącz backend i włącz tryb samolotowy. Historia, edycja i ręczne dodawanie nadal działają, a analiza zdjęcia pokazuje czytelny błąd połączenia.

## Obsługa błędów analizy

| Sytuacja | Co widzi użytkownik |
|---|---|
| Nie ustawiono adresu / backend wyłączony / złe IP / inna sieć | „Brak połączenia z backendem” + przycisk do ustawień; reszta aplikacji działa normalnie |
| Brak `ANTHROPIC_API_KEY` w `backend/.env` | „Brak konfiguracji API” (`API_KEY_MISSING`); test połączenia też to zgłasza |
| Nieprawidłowy klucz | „Nieprawidłowy klucz API” (`API_KEY_INVALID`) |
| Na zdjęciu nie ma jedzenia | „Nie rozpoznano jedzenia” (`NO_FOOD`) |
| Zdjęcie rozmazane, ciemne lub nieczytelne | „Zdjęcie jest nieczytelne” (`UNREADABLE`) |
| Limit zapytań, przekroczony czas, błąd dostawcy | odpowiedni komunikat + „Spróbuj ponownie” |

W każdym przypadku błędu można przejść do ręcznego wpisania składników z zachowaniem zdjęcia.

## Backend – szczegóły

- `GET /health` – status i informacja, czy klucz API jest skonfigurowany (bez ujawniania klucza).
- `POST /analyze` – `{ imageBase64, hint? }` → składniki (gramy, wartości na 100 g i dla porcji) + suma, `estimated: true`.
- Zdjęcie istnieje tylko w pamięci na czas zapytania. Backend nie zapisuje zdjęć, wyników ani historii, a w logach zapisuje jedynie liczbę składników, kcal i czas trwania.
- Aplikacja przed wysłaniem zmniejsza zdjęcie (dłuższy bok 1280 px, JPEG). Backend rozpoznaje format po nagłówku pliku.
- Model: domyślnie `claude-opus-5-5` (structured outputs = gwarantowany format JSON; wartości są dodatkowo walidowane i przycinane do sensownych zakresów). Tańszy model ustawisz przez `ANTHROPIC_MODEL=claude-sonnet-5-5` lub `claude-haiku-5-5` w `.env`.
- Włączony jest serwerowy fallback (`fallbacks: "default"`): jeśli klasyfikatory bezpieczeństwa odrzucą zapytanie, API samo ponowi je na zalecanym modelu. Jeśli odrzucą je wszystkie modele, aplikacja pokaże „Analiza odrzucona”.

## Struktura projektu

```
src/app/              ekrany (expo-router)
  _layout.tsx         SQLiteProvider + nawigacja
  index.tsx           dzisiaj (podsumowanie, posiłki, dodawanie)
  day/[date].tsx      dowolny dzień z historii
  analyze.tsx         przygotowanie zdjęcia, wysyłka, obsługa błędów
  meal/[id].tsx       edycja/nowy posiłek, zapis, usuwanie
  history.tsx         lista dni
  settings.tsx        cele, adres backendu, informacje o danych
src/db/               schemat + migracje, zapytania SQL
src/lib/              API backendu, zdjęcia (expo-file-system), przeliczenia, daty
src/components/       komponenty UI
tests/                test trwałości bazy
backend/              lokalny serwer analizy (Express + @anthropic-ai/sdk)
```

Przydatne komendy: `npm run typecheck`, `npm run test:db`, `cd backend && npm run typecheck`.

Plik `metro.config.js` zawiera dodatki potrzebne tylko do uruchamiania w przeglądarce (`npx expo start --web`; użyto go do testu end-to-end). W wersji web działa wyłącznie ręczne dodawanie posiłków, bo zapis zdjęć jest dostępny tylko na telefonie. Te dodatki nie wpływają na Expo Go.
