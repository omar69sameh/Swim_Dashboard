import 'package:flutter_test/flutter_test.dart';
import 'package:imu_reader/services/supabase_service.dart';
import 'package:imu_reader/config/supabase_config.dart';

void main() {
  group('SupabaseService — isConfigured', () {
    test('MOB-UT-11: returns true when URL and anonKey are real values', () {
      // The app ships with real credentials in SupabaseConfig.
      // isConfigured checks URL starts with https:// and key is non-empty.
      expect(SupabaseConfig.url.startsWith('https://'), isTrue);
      expect(SupabaseConfig.anonKey.isNotEmpty, isTrue);
      expect(SupabaseConfig.anonKey, isNot('YOUR_SUPABASE_ANON_KEY'));
    });

    test('MOB-UT-12: isConfigured returns true for the shipped config', () {
      expect(SupabaseService.isConfigured, isTrue);
    });

    test('MOB-UT-13: dashboardUrl is a valid local or remote URL', () {
      final url = SupabaseConfig.dashboardUrl;
      expect(
        url.startsWith('http://') || url.startsWith('https://'),
        isTrue,
      );
    });
  });

  group('SupabaseConfig — URL format validation', () {
    test('MOB-UT-14: Supabase URL contains .supabase.co domain', () {
      expect(SupabaseConfig.url, contains('supabase.co'));
    });

    test('MOB-UT-15: anonKey is a JWT (starts with eyJ)', () {
      // All Supabase anon keys are JWTs, which begin with the base64 header eyJ
      expect(SupabaseConfig.anonKey.startsWith('eyJ'), isTrue);
    });
  });
}
