# Mobile app — test with dashboard + ML

## What changed (minimal)

- Sign up always sets `profiles.role = swimmer` (works with web dashboard login).
- Sign in **blocks coaches** — message: use web dashboard.
- Each recording sets `analysis_status = pending` for the ML worker.

## Before first run

1. Supabase SQL: run `../supabase/migrations/001_profiles_role_coach.sql`, `002_session_analysis.sql`, and `003_profiles_coach_list_rls.sql`.
2. **Coach assignment:** pick a coach at signup on the app, or on the website under **Settings** (swimmer). Coaches only see swimmers assigned to them (`profiles.coach_id`).
3. `lib/config/supabase_config.dart` — same project URL/anon key as dashboard (already set for `imu_reader`).

## Build APK (install on phone)

**Requirements:**

1. [Flutter SDK](https://docs.flutter.dev/get-started/install/windows) on PATH.
2. **Android SDK** for your Windows user (`flutter doctor` → Android toolchain ✓).
   - Install [Android Studio](https://developer.android.com/studio) and complete the SDK setup wizard, **or**
   - If SDK exists under another profile on this PC, copy `android-sdk.local.bat.example` → `android-sdk.local.bat` and set `ANDROID_SDK`.

**Common Windows issues:**

| Symptom | Fix |
|--------|-----|
| `'python' is not recognized` | N/A for mobile — use Flutter, not Python. |
| `dubious ownership` / `Unable to determine engine version` | `build-apk.bat` adds Flutter to git `safe.directory` and restores `engine.version`. |
| `No Android SDK found` | Install Android Studio **or** set `android-sdk.local.bat`. |
| `jlink.exe does not exist` | You need a **full JDK** (not JRE only). Set `JAVA_HOME` in `android-sdk.local.bat` to a JDK with `bin\jlink.exe`. |
| OneDrive `plugin_symlinks` / unable to delete `build` | Script auto-builds from `%LOCALAPPDATA%\SwimIMU\build_workspace`. |

```bat
cd mobileApp
.\build-apk.bat
```

In **PowerShell**, you must use `.\build-apk.bat` (not `build-apk.bat` alone).

**OneDrive:** If the repo is under OneDrive, the script automatically copies the app to `%LOCALAPPDATA%\SwimIMU\build_workspace` and builds there (avoids Gradle getting stuck on locked `build` folders).

APK output (script opens this folder):

`mobileApp\dist\SwimIMU-release.apk`

Copy to phone and install (allow “unknown sources”), or:

```bat
adb install dist\SwimIMU-release.apk
```

**Faster debug on USB:**

```bat
flutter run
```

## Full stack test

1. Repo root: `run-all.bat` (dashboard + ML API + worker).
2. Phone: record session (START → STOP).
3. Watch **ML Worker** window — should analyze within ~30s–few min.
4. PC browser: http://localhost:3000/login — same email/password → see session with stroke + quality.

## Same account rule

| Sign up on | Log in on |
|------------|-------------|
| Phone | Dashboard |
| Dashboard | Phone |

Use the **same email and password**. Pick coach on dashboard **Settings** after signup (optional).
