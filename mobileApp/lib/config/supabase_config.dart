/// Supabase project URL and anon (public) key.
/// Replace with your project values from: Supabase Dashboard → Settings → API.
/// Do not commit real keys to git; use .env or flutter_dotenv in production.
class SupabaseConfig {
  static const String url = 'https://fdeiebmamhhwrucrwytl.supabase.co';
  static const String anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkZWllYm1hbWhod3J1Y3J3eXRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNDg3MzQsImV4cCI6MjA4NjcyNDczNH0.i0vn_jA3JEK7qCH604GehmSpG0uwMNGJl4CYU1HBke0';

  /// Base URL of the web dashboard.
  /// - Emulator / same-machine browser: keep as http://localhost:3000
  /// - Physical phone on same WiFi: change to http://YOUR_LAPTOP_IP:3000
  ///   (find your IP with: ipconfig on Windows, look for IPv4 under Wi-Fi)
  /// - Deployed dashboard: use the deployed URL (e.g. https://swimmate.vercel.app)
  static const String dashboardUrl = 'http://localhost:3000';
}
