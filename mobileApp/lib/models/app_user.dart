/// App user built from Supabase Auth + profiles row. Used for display and session ownership.
class AppUser {
  final String id;
  final String firstName;
  final String lastName;
  final int age;
  final String email;

  AppUser({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.age,
    required this.email,
  });

  String get fullName => '$firstName $lastName'.trim();
  String get fullNameOrEmail => fullName.isNotEmpty ? fullName : email;
}
