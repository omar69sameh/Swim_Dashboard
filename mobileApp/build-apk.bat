@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo ============================================
echo   Build Swim IMU APK (release)
echo ============================================
echo.

REM Gradle cache outside OneDrive (prevents wrapper zip lock timeouts)
set "GRADLE_USER_HOME=%LOCALAPPDATA%\SwimIMU\gradle"
if not exist "%GRADLE_USER_HOME%" mkdir "%GRADLE_USER_HOME%"

REM --- Flutter on PATH ---
where flutter >nul 2>&1
if errorlevel 1 (
  echo ERROR: Flutter not in PATH.
  echo Install: https://docs.flutter.dev/get-started/install/windows
  pause
  exit /b 1
)

REM --- Android SDK + JDK (machine-local) ---
set "ANDROID_SDK="
if exist "%~dp0android-sdk.local.bat" call "%~dp0android-sdk.local.bat"
if not defined ANDROID_SDK if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" (
  set "ANDROID_SDK=%LOCALAPPDATA%\Android\Sdk"
)
if not defined ANDROID_SDK (
  for /d %%U in ("C:\Users\*") do (
    if exist "%%U\AppData\Local\Android\Sdk\platform-tools\adb.exe" (
      set "ANDROID_SDK=%%U\AppData\Local\Android\Sdk"
      goto :sdk_done
    )
  )
)
:sdk_done
if not defined ANDROID_SDK (
  echo ERROR: No Android SDK found. Install Android Studio or set android-sdk.local.bat
  pause
  exit /b 1
)

set "ANDROID_HOME=%ANDROID_SDK%"
set "ANDROID_SDK_ROOT=%ANDROID_SDK%"
call flutter config --android-sdk "%ANDROID_SDK%" >nul

if defined JAVA_HOME if exist "%JAVA_HOME%\bin\java.exe" (
  set "PATH=%JAVA_HOME%\bin;%PATH%"
  call flutter config --jdk-dir "%JAVA_HOME%" >nul
  echo Using JAVA_HOME: %JAVA_HOME%
) else (
  echo WARNING: JAVA_HOME not set or invalid. Add it in android-sdk.local.bat
)
echo Using Android SDK: %ANDROID_SDK%
echo Using GRADLE_USER_HOME: %GRADLE_USER_HOME%
echo.

echo Getting packages...
call flutter pub get
if errorlevel 1 (
  echo pub get failed.
  pause
  exit /b 1
)

echo.
echo Building APK (first build can take 15-30 minutes)...
call flutter build apk --release
if errorlevel 1 (
  echo.
  echo Build failed. Run: flutter doctor -v
  pause
  exit /b 1
)

set "APK="
if exist "build\app\outputs\flutter-apk\app-release.apk" (
  set "APK=build\app\outputs\flutter-apk\app-release.apk"
) else if exist "build\app\outputs\apk\release\app-release.apk" (
  set "APK=build\app\outputs\apk\release\app-release.apk"
)
if not defined APK (
  echo ERROR: No APK produced.
  pause
  exit /b 1
)

if not exist "dist" mkdir dist
copy /y "%APK%" "dist\SwimIMU-release.apk" >nul
set "FINAL_APK=%~dp0dist\SwimIMU-release.apk"

echo.
echo ============================================
echo   SUCCESS
echo ============================================
echo   %FINAL_APK%
echo ============================================
start "" explorer /select,"%FINAL_APK%"
pause
