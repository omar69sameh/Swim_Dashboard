import 'dart:convert';
import 'dart:typed_data';

import 'package:supabase_flutter/supabase_flutter.dart';
import '../config/supabase_config.dart';
import '../models/app_user.dart';

/// Handles Supabase init, auth (sign up / sign in / sign out), and swimming sessions.
class SupabaseService {
  static SupabaseClient get _client => Supabase.instance.client;

  /// Call once at app startup (e.g. in main() before runApp).
  static Future<void> initialize() async {
    await Supabase.initialize(
      url: SupabaseConfig.url,
      anonKey: SupabaseConfig.anonKey,
    );
  }

  /// Whether the Supabase URL and key are configured (not placeholders).
  static bool get isConfigured =>
      SupabaseConfig.url.startsWith('https://') &&
      SupabaseConfig.anonKey.isNotEmpty &&
      SupabaseConfig.anonKey != 'YOUR_SUPABASE_ANON_KEY';

  // --- Auth ---

  static Session? get currentSession => _client.auth.currentSession;
  static User? get currentUser => _client.auth.currentUser;

  /// Coaches for signup dropdown (requires migration 003 RLS policy).
  static Future<List<({String id, String name})>> listCoaches() async {
    try {
      final res = await _client
          .from('profiles')
          .select('id, first_name, last_name')
          .eq('role', 'coach')
          .order('first_name');
      return (res as List).map((row) {
        final fn = row['first_name'] as String? ?? '';
        final ln = row['last_name'] as String? ?? '';
        final name = '$fn $ln'.trim();
        return (id: row['id'] as String, name: name.isEmpty ? 'Coach' : name);
      }).toList();
    } catch (_) {
      return [];
    }
  }

  /// Sign up — swimmers only (same account works on web dashboard).
  static Future<AppUser> signUp({
    required String email,
    required String password,
    required String firstName,
    required String lastName,
    required int age,
    String? coachId,
  }) async {
    final name = '$firstName $lastName'.trim();
    final res = await _client.auth.signUp(
      email: email.trim().toLowerCase(),
      password: password,
      data: {'role': 'swimmer', 'name': name},
    );
    if (res.user == null) throw Exception('Sign up failed');
    final userId = res.user!.id;
    await _upsertProfile(
      userId,
      firstName: firstName,
      lastName: lastName,
      age: age,
      role: 'swimmer',
      coachId: coachId,
    );
    return getAppUser(userId);
  }

  /// Send password reset email.
  static Future<void> resetPassword(String email) async {
    await _client.auth.resetPasswordForEmail(email.trim().toLowerCase());
  }

  /// Sign in — blocks coach accounts (coaches use the web dashboard).
  static Future<AppUser?> signIn(String email, String password) async {
    await _client.auth.signInWithPassword(
      email: email.trim().toLowerCase(),
      password: password,
    );
    final user = _client.auth.currentUser;
    if (user == null) return null;

    final role = await _getProfileRole(user.id);
    if (role == 'coach') {
      await signOut();
      throw AuthException(
        'Coaches use the web dashboard. This app is for swimmers only.',
      );
    }

    return getAppUser(user.id);
  }

  static Future<void> signOut() async {
    await _client.auth.signOut();
  }

  /// Build AppUser from auth user and profiles row.
  static Future<AppUser> getAppUser(String userId) async {
    final authUser = _client.auth.currentUser;
    final email = authUser?.email ?? '';

    final profile = await _client
        .from('profiles')
        .select('first_name, last_name, age, role')
        .eq('id', userId)
        .maybeSingle();

    final fn = profile?['first_name'] as String? ?? '';
    final ln = profile?['last_name'] as String? ?? '';
    final a = profile?['age'] as int? ?? 0;

    return AppUser(
      id: userId,
      firstName: fn,
      lastName: ln,
      age: a,
      email: email,
    );
  }

  static Future<String> _getProfileRole(String userId) async {
    try {
      final profile = await _client
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .maybeSingle();
      final role = profile?['role'] as String?;
      if (role == 'coach' || role == 'swimmer') return role!;
    } catch (_) {
      // role column missing until migration 001 — treat as swimmer
    }
    final meta = _client.auth.currentUser?.userMetadata;
    if (meta?['role'] == 'coach') return 'coach';
    return 'swimmer';
  }

  static Future<void> _upsertProfile(
    String userId, {
    required String firstName,
    required String lastName,
    required int age,
    String role = 'swimmer',
    String? coachId,
  }) async {
    final payload = <String, dynamic>{
      'id': userId,
      'first_name': firstName,
      'last_name': lastName,
      'age': age,
      'role': role,
    };
    if (coachId != null && coachId.isNotEmpty) {
      payload['coach_id'] = coachId;
    }
    await _client.from('profiles').upsert(payload);
  }

  // --- Sessions (recordings) ---

  static const String _table = 'swimming_sessions';

  /// Insert one recording. Sets analysis_status pending for ML worker.
  static Future<void> insertSession(Map<String, dynamic> sessionData) async {
    final payload = Map<String, dynamic>.from(sessionData);
    payload['analysis_status'] = 'pending';
    await _client.from(_table).insert(payload);
  }

  /// List recordings for the current user.
  static Future<List<Map<String, dynamic>>> getUserSessions(String userId) async {
    final res = await _client
        .from(_table)
        .select()
        .eq('user_id', userId)
        .order('created_at', ascending: false);
    return List<Map<String, dynamic>>.from(res as List);
  }

  // --- Storage: session CSV files (for dashboard / automatic download) ---

  static const String sessionCsvBucket = 'session-csvs';

  /// Upload session CSV to Storage. Path: {userId}/{filename}.csv
  /// Dashboard can list and download from this bucket.
  static Future<void> uploadSessionCsv({
    required String userId,
    required String filename,
    required String csvContent,
  }) async {
    final path = '$userId/$filename';
    final bytes = Uint8List.fromList(utf8.encode(csvContent));
    await _client.storage.from(sessionCsvBucket).uploadBinary(
          path,
          bytes,
          fileOptions: const FileOptions(
            contentType: 'text/csv',
            upsert: true,
          ),
        );
  }

  /// List CSV filenames for a user (for dashboard).
  static Future<List<String>> listUserSessionCsvs(String userId) async {
    final list = await _client.storage.from(sessionCsvBucket).list(path: userId);
    return list.map((f) => f.name).where((n) => n.endsWith('.csv')).toList();
  }

  /// Get a signed or public URL for a session CSV (for dashboard download).
  static Future<String> getSessionCsvDownloadUrl(String userId, String filename) async {
    final path = '$userId/$filename';
    final url = await _client.storage.from(sessionCsvBucket).createSignedUrl(path, 60);
    return url;
  }
}
