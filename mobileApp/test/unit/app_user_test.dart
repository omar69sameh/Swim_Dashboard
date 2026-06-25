import 'package:flutter_test/flutter_test.dart';
import 'package:imu_reader/models/app_user.dart';

void main() {
  group('AppUser — fullName getter', () {
    test('MOB-UT-01: returns combined first and last name', () {
      final user = AppUser(
        id: '1',
        firstName: 'Khaled',
        lastName: 'Amr',
        age: 22,
        email: 'khaled@swim.com',
      );
      expect(user.fullName, 'Khaled Amr');
    });

    test('MOB-UT-02: trims whitespace when lastName is empty', () {
      final user = AppUser(
        id: '2',
        firstName: 'Khaled',
        lastName: '',
        age: 22,
        email: 'khaled@swim.com',
      );
      expect(user.fullName, 'Khaled');
    });

    test('MOB-UT-03: trims whitespace when firstName is empty', () {
      final user = AppUser(
        id: '3',
        firstName: '',
        lastName: 'Amr',
        age: 22,
        email: 'khaled@swim.com',
      );
      expect(user.fullName, 'Amr');
    });

    test('MOB-UT-04: returns empty string when both names are empty', () {
      final user = AppUser(
        id: '4',
        firstName: '',
        lastName: '',
        age: 22,
        email: 'khaled@swim.com',
      );
      expect(user.fullName, '');
    });
  });

  group('AppUser — fullNameOrEmail getter', () {
    test('MOB-UT-05: returns fullName when name is available', () {
      final user = AppUser(
        id: '5',
        firstName: 'Sherif',
        lastName: 'Hassan',
        age: 25,
        email: 'sherif@swim.com',
      );
      expect(user.fullNameOrEmail, 'Sherif Hassan');
    });

    test('MOB-UT-06: falls back to email when both names are empty', () {
      final user = AppUser(
        id: '6',
        firstName: '',
        lastName: '',
        age: 25,
        email: 'sherif@swim.com',
      );
      expect(user.fullNameOrEmail, 'sherif@swim.com');
    });

    test('MOB-UT-07: uses firstName alone when lastName is empty', () {
      final user = AppUser(
        id: '7',
        firstName: 'Sherif',
        lastName: '',
        age: 25,
        email: 'sherif@swim.com',
      );
      expect(user.fullNameOrEmail, 'Sherif');
    });
  });

  group('AppUser — equality and fields', () {
    test('MOB-UT-08: id field is preserved correctly', () {
      final user = AppUser(
        id: 'uuid-abc-123',
        firstName: 'Test',
        lastName: 'User',
        age: 20,
        email: 'test@swim.com',
      );
      expect(user.id, 'uuid-abc-123');
    });

    test('MOB-UT-09: age field is preserved correctly', () {
      final user = AppUser(
        id: 'u1',
        firstName: 'Test',
        lastName: 'User',
        age: 18,
        email: 'test@swim.com',
      );
      expect(user.age, 18);
    });

    test('MOB-UT-10: email field is preserved correctly', () {
      final user = AppUser(
        id: 'u1',
        firstName: 'Test',
        lastName: 'User',
        age: 18,
        email: 'test@swim.com',
      );
      expect(user.email, 'test@swim.com');
    });
  });

  group('AppUser — age validation (BUG-04)', () {
    test('MOB-UT-16: age = 0 should be rejected — FAILS (BUG-04)', () {
      // SupabaseService.signUp() and the AppUser constructor accept age = 0
      // (and negative values) with no validation. A swimmer registered with
      // age = 0 produces an invalid profile row in Supabase.
      // Expected: age must be greater than 0. Fails until BUG-04 is fixed.
      final user = AppUser(
        id: 'u-bug04',
        firstName: 'Test',
        lastName: 'User',
        age: 0,
        email: 'test@swim.com',
      );
      expect(user.age, greaterThan(0)); // FAILS — no validation in constructor
    });
  });
}
