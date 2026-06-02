# imu_reader

IMU sensor monitoring app (Physics Toolbox compatible) with Supabase auth and cloud storage for recordings.

## Architecture (what you asked about)

- **Component-based?** The UI is **screen-based** with reusable widgets inside one app. There are no separate “components” in the sense of a component library; `AuthScreen` and `IMUScreen` are the main screens, and things like `MiniGraphPainter` / `_buildInfoRow` are internal UI pieces. So it’s **not** a formal component-based architecture (e.g. a dedicated `components/` folder with shared buttons/cards).
- **Microservices?** **No.** This is a single Flutter app talking to one backend (Supabase). Supabase itself is a single BaaS (Backend-as-a-Service), not a set of small services you deploy separately. So the structure is: **one mobile app + one backend (Supabase)**.
- **Layers:** The code is organized into:
  - **Config** – `lib/config/supabase_config.dart` (URL + anon key).
  - **Models** – `lib/models/app_user.dart` (user for display and ownership).
  - **Services** – `lib/services/supabase_service.dart` (auth + sessions).
  - **UI** – `lib/main.dart` (app, auth screen, IMU screen, sensor logic). Sensor/recording logic is unchanged; only the backend (MongoDB → Supabase) and auth were swapped.

---

## Supabase setup (step-by-step)

1. **Create a Supabase project**
   - Go to [supabase.com](https://supabase.com) → sign in → New project.
   - Pick org, project name, database password, region. Wait until the project is ready.

2. **Get URL and anon key**
   - In the project: **Settings** → **API**.
   - Copy **Project URL** and **anon public** key.

3. **Configure the app**
   - Open `lib/config/supabase_config.dart`.
   - Set:
     - `url` = your Project URL (e.g. `https://xxxx.supabase.co`).
     - `anonKey` = your anon public key.  
   Do not commit real keys to git; use env vars or a secrets approach in production.

4. **Create tables and RLS**
   - In Supabase: **SQL Editor** → New query.
   - Paste the contents of **`supabase_schema.sql`** (in the project root).
   - Run the script. It creates:
     - `profiles` (id, first_name, last_name, age) linked to `auth.users`.
     - `swimming_sessions` (session_id, user_id, swimmer_info, device_info, session_metadata, samples, etc.).
     - Row Level Security (RLS) so each user only sees/inserts their own data.

5. **Run the app**
   - `flutter pub get`
   - `flutter run`
   - Sign up or sign in; recordings are stored under the signed-in user.

---

## What was changed (MongoDB → Supabase)

- **Removed:** `mongo_dart`, `crypto`, custom `User`/`MongoDatabase`, and all MongoDB connection/session code.
- **Added:** Supabase (auth + database), `AppUser` model, `SupabaseService`, and `supabase_schema.sql`.
- **Unchanged:** All sensor behavior (linear accelerometer, gyroscope, sampling, merge, CSV export). Only the backend and auth were replaced; recordings are now saved under the logged-in Supabase user with RLS.

---

## Getting Started (Flutter)

- [Lab: Write your first Flutter app](https://docs.flutter.dev/get-started/codelab)
- [Cookbook: Useful Flutter samples](https://docs.flutter.dev/cookbook)
- [Flutter documentation](https://docs.flutter.dev/)
