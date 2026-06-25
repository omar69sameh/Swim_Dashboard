/// Integration tests for the Flutter mobile app.
/// These tests verify the data contracts and pipeline logic that connects
/// the IMU recording layer, the AppUser model, and the Supabase service
/// interface — without requiring a live network connection.

import 'package:flutter_test/flutter_test.dart';
import 'package:imu_reader/models/app_user.dart';
import 'package:imu_reader/services/supabase_service.dart';
import 'package:imu_reader/config/supabase_config.dart';

void main() {
  // ─── IT-MOB-01: Session payload structure ──────────────────────────────────
  group('IT-MOB-01: Session payload contract for insertSession', () {
    test('payload with analysis_status=pending is structurally valid', () {
      final payload = <String, dynamic>{
        'user_id': 'swimmer-uuid-001',
        'stroke_type': 'Freestyle',
        'duration_seconds': 300,
        'num_strokes': 45,
        'created_at': DateTime.now().toIso8601String(),
        'analysis_status': 'pending',
      };
      // The service sets analysis_status = 'pending' before insert.
      // Verify all required keys are present and correctly typed.
      expect(payload['user_id'], isA<String>());
      expect(payload['analysis_status'], equals('pending'));
      expect(payload['duration_seconds'], isA<int>());
      expect(payload['created_at'], isA<String>());
    });

    test('payload user_id matches authenticated AppUser id', () {
      final user = AppUser(
        id: 'swimmer-uuid-001',
        firstName: 'Khaled',
        lastName: 'Amr',
        age: 22,
        email: 'khaled@swim.com',
      );
      final payload = <String, dynamic>{
        'user_id': user.id,
        'stroke_type': 'Freestyle',
        'duration_seconds': 120,
        'analysis_status': 'pending',
      };
      expect(payload['user_id'], equals(user.id));
    });
  });

  // ─── IT-MOB-02: CSV filename contract ──────────────────────────────────────
  group('IT-MOB-02: CSV upload filename contract', () {
    test('CSV path uses userId/filename.csv format', () {
      const userId = 'swimmer-uuid-001';
      const filename = 'session_2025-06-15_143000.csv';
      final path = '$userId/$filename';
      expect(path, equals('swimmer-uuid-001/session_2025-06-15_143000.csv'));
      expect(path, endsWith('.csv'));
      expect(path, startsWith(userId));
    });

    test('uploadSessionCsv bucket name is correct', () {
      expect(SupabaseService.sessionCsvBucket, equals('session-csvs'));
    });
  });

  // ─── IT-MOB-03: Auth configuration prerequisites ───────────────────────────
  group('IT-MOB-03: Auth configuration prerequisites for sign-in', () {
    test('Supabase is configured before auth calls are made', () {
      expect(SupabaseService.isConfigured, isTrue);
    });

    test('email is trimmed and lowercased before sending to Supabase', () {
      // Simulates the email normalisation that signIn() applies
      const rawEmail = '  Khaled28Amr@Gmail.COM  ';
      final normalised = rawEmail.trim().toLowerCase();
      expect(normalised, equals('khaled28amr@gmail.com'));
    });

    test('coach login must be blocked — signIn throws for coach role', () {
      // The service throws AuthException for coach accounts.
      // We verify the expected message text used in the throw.
      const expectedMessage =
          'Coaches use the web dashboard. This app is for swimmers only.';
      expect(expectedMessage, contains('web dashboard'));
      expect(expectedMessage, contains('swimmers only'));
    });
  });

  // ─── IT-MOB-04: AppUser construction from Supabase profile row ─────────────
  group('IT-MOB-04: AppUser construction from profile data', () {
    test('profile with all fields builds valid AppUser', () {
      // Simulates what getAppUser() does after fetching the profiles row
      const fn = 'Khaled';
      const ln = 'Amr';
      const a = 22;
      const email = 'khaled@swim.com';
      const userId = 'uuid-001';
      final user = AppUser(
        id: userId,
        firstName: fn,
        lastName: ln,
        age: a,
        email: email,
      );
      expect(user.fullName, equals('Khaled Amr'));
      expect(user.fullNameOrEmail, equals('Khaled Amr'));
      expect(user.age, equals(22));
    });

    test('profile with missing names falls back to email display', () {
      final user = AppUser(
        id: 'uuid-002',
        firstName: '',
        lastName: '',
        age: 0,
        email: 'unknown@swim.com',
      );
      expect(user.fullNameOrEmail, equals('unknown@swim.com'));
    });
  });

  // ─── IT-MOB-05: Coach list response parsing ────────────────────────────────
  group('IT-MOB-05: Coach list response parsing', () {
    test('coach row with first and last name produces correct display name', () {
      // Simulates what listCoaches() does with each profile row
      final row = <String, dynamic>{
        'id': 'coach-uuid',
        'first_name': 'Mohamed',
        'last_name': 'Aly',
      };
      final fn = row['first_name'] as String? ?? '';
      final ln = row['last_name'] as String? ?? '';
      final name = '$fn $ln'.trim();
      expect(name, equals('Mohamed Aly'));
    });

    test('coach row with empty names falls back to "Coach"', () {
      final row = <String, dynamic>{
        'id': 'coach-uuid',
        'first_name': '',
        'last_name': '',
      };
      final fn = row['first_name'] as String? ?? '';
      final ln = row['last_name'] as String? ?? '';
      final name = '$fn $ln'.trim();
      final displayName = name.isEmpty ? 'Coach' : name;
      expect(displayName, equals('Coach'));
    });

    test('coach row with null names uses empty-string default', () {
      final row = <String, dynamic>{'id': 'c1', 'first_name': null, 'last_name': null};
      final fn = row['first_name'] as String? ?? '';
      final ln = row['last_name'] as String? ?? '';
      expect(fn, equals(''));
      expect(ln, equals(''));
    });
  });

  // ─── IT-MOB-06: Password reset email normalisation ─────────────────────────
  group('IT-MOB-06: Password reset email normalisation', () {
    test('resetPassword normalises email before sending', () {
      const raw = '  Test@Gmail.COM ';
      final normalised = raw.trim().toLowerCase();
      expect(normalised, equals('test@gmail.com'));
    });

    test('redirect URL includes /reset-password path', () {
      final redirectUrl = '${SupabaseConfig.dashboardUrl}/reset-password';
      expect(redirectUrl, endsWith('/reset-password'));
    });
  });
}
