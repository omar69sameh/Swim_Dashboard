import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:sensors_plus/sensors_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'dart:math' as math;

import 'package:supabase_flutter/supabase_flutter.dart';

import 'models/app_user.dart';
import 'services/supabase_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (SupabaseService.isConfigured) {
    try {
      await SupabaseService.initialize();
    } catch (_) {}
  }
  runApp(const IMUApp());
}

class IMUApp extends StatelessWidget {
  const IMUApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        primarySwatch: Colors.blue,
        useMaterial3: true,
        brightness: Brightness.light,
      ),
      darkTheme: ThemeData(
        primarySwatch: Colors.blue,
        useMaterial3: true,
        brightness: Brightness.dark,
      ),
      home: const AuthScreen(),
    );
  }
}

// --- Authentication screen: sign in / sign up with Supabase ---
class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  bool isLogin = true;
  bool isLoading = false;
  bool _forgotLoading = false;
  bool get isSupabaseReady => SupabaseService.isConfigured;

  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  final _ageController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  List<({String id, String name})> _coaches = [];
  bool _coachesLoading = false;
  String? _selectedCoachId;

  @override
  void initState() {
    super.initState();
    _loadCoaches();
  }

  Future<void> _loadCoaches() async {
    if (!isSupabaseReady) return;
    setState(() => _coachesLoading = true);
    try {
      final list = await SupabaseService.listCoaches();
      if (mounted) setState(() => _coaches = list);
    } finally {
      if (mounted) setState(() => _coachesLoading = false);
    }
  }

  Future<void> _handleForgotPassword() async {
    final emailCtrl = TextEditingController(text: _emailController.text);
    final confirmed = await showDialog<String?>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reset password'),
        content: TextField(
          controller: emailCtrl,
          decoration: const InputDecoration(labelText: 'Email', hintText: 'your@email.com'),
          keyboardType: TextInputType.emailAddress,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, emailCtrl.text.trim()),
            child: const Text('Send link'),
          ),
        ],
      ),
    );
    if (confirmed == null || confirmed.isEmpty || !mounted) return;
    setState(() => _forgotLoading = true);
    try {
      await SupabaseService.resetPassword(confirmed);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Reset link sent — check your email'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Reset link sent if account exists'), backgroundColor: Colors.blue),
        );
      }
    } finally {
      if (mounted) setState(() => _forgotLoading = false);
    }
  }

  Future<void> _handleSubmit() async {
    if (!_formKey.currentState!.validate()) return;
    if (!isSupabaseReady) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Supabase not configured. Set URL and anon key in lib/config/supabase_config.dart'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    setState(() => isLoading = true);

    try {
      if (isLogin) {
        final user = await SupabaseService.signIn(
          _emailController.text,
          _passwordController.text,
        );
        if (user != null && mounted) {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(builder: (context) => IMUScreen(user: user)),
          );
        } else if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Invalid email or password'), backgroundColor: Colors.red),
          );
        }
      } else {
        final user = await SupabaseService.signUp(
          firstName: _firstNameController.text,
          lastName: _lastNameController.text,
          age: int.parse(_ageController.text),
          email: _emailController.text,
          password: _passwordController.text,
          coachId: _selectedCoachId,
        );
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Account created successfully!'), backgroundColor: Colors.green),
          );
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(builder: (context) => IMUScreen(user: user)),
          );
        }
      }
    } on AuthException catch (e) {
      if (mounted) {
        String msg = e.message;
        if (msg.contains('already registered') || msg.contains('already exists')) {
          msg = 'This email is already registered. Please login instead.';
        }
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), backgroundColor: Colors.red, duration: const Duration(seconds: 4)),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString().replaceAll('Exception: ', '')),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 4),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.pool, size: 80, color: Colors.blue.shade700),
                const SizedBox(height: 16),
                const Text(
                  'Swimming IMU Monitor',
                  style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Text(
                  'Swimmers only — same login as web dashboard',
                  style: TextStyle(fontSize: 14, color: Colors.grey.shade600),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 4),
                Text(
                  'Coaches: use the website, not this app',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 40),

                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      isSupabaseReady ? Icons.cloud_done : Icons.cloud_off,
                      color: isSupabaseReady ? Colors.green : Colors.red,
                      size: 20,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      isSupabaseReady ? 'Supabase ready' : 'Configure Supabase (see config)',
                      style: TextStyle(
                        color: isSupabaseReady ? Colors.green : Colors.red,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 32),

                Form(
                  key: _formKey,
                  child: Column(
                    children: [
                      Container(
                        decoration: BoxDecoration(
                          color: Colors.grey.shade200,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: GestureDetector(
                                onTap: () => setState(() => isLogin = true),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(vertical: 12),
                                  decoration: BoxDecoration(
                                    color: isLogin ? Colors.blue.shade700 : Colors.transparent,
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Text(
                                    'LOGIN',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      color: isLogin ? Colors.white : Colors.black,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            Expanded(
                              child: GestureDetector(
                                onTap: () {
                                  setState(() => isLogin = false);
                                  if (_coaches.isEmpty) _loadCoaches();
                                },
                                child: Container(
                                  padding: const EdgeInsets.symmetric(vertical: 12),
                                  decoration: BoxDecoration(
                                    color: !isLogin ? Colors.blue.shade700 : Colors.transparent,
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Text(
                                    'SIGN UP',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      color: !isLogin ? Colors.white : Colors.black,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 24),

                      if (!isLogin) ...[
                        TextFormField(
                          controller: _firstNameController,
                          decoration: InputDecoration(
                            labelText: 'First Name',
                            prefixIcon: const Icon(Icons.person_outline),
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          validator: (value) {
                            if (value == null || value.isEmpty) return 'Please enter your first name';
                            return null;
                          },
                        ),
                        const SizedBox(height: 16),
                        TextFormField(
                          controller: _lastNameController,
                          decoration: InputDecoration(
                            labelText: 'Last Name',
                            prefixIcon: const Icon(Icons.person_outline),
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          validator: (value) {
                            if (value == null || value.isEmpty) return 'Please enter your last name';
                            return null;
                          },
                        ),
                        const SizedBox(height: 16),
                        TextFormField(
                          controller: _ageController,
                          decoration: InputDecoration(
                            labelText: 'Age',
                            prefixIcon: const Icon(Icons.cake_outlined),
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          keyboardType: TextInputType.number,
                          validator: (value) {
                            if (value == null || value.isEmpty) return 'Please enter your age';
                            final age = int.tryParse(value);
                            if (age == null || age < 1 || age > 120) return 'Please enter a valid age';
                            return null;
                          },
                        ),
                        const SizedBox(height: 16),
                        InputDecorator(
                          decoration: InputDecoration(
                            labelText: 'Coach (optional)',
                            prefixIcon: const Icon(Icons.groups_outlined),
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          child: DropdownButtonHideUnderline(
                            child: DropdownButton<String>(
                              isExpanded: true,
                              value: _selectedCoachId,
                              hint: Text(
                                _coachesLoading
                                    ? 'Loading coaches...'
                                    : (_coaches.isEmpty
                                        ? 'No coaches yet — assign later on website'
                                        : 'Select your coach'),
                              ),
                              items: [
                                const DropdownMenuItem<String>(
                                  value: null,
                                  child: Text('No coach yet'),
                                ),
                                ..._coaches.map(
                                  (c) => DropdownMenuItem<String>(
                                    value: c.id,
                                    child: Text(c.name),
                                  ),
                                ),
                              ],
                              onChanged: _coachesLoading
                                  ? null
                                  : (value) => setState(() => _selectedCoachId = value),
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],

                      TextFormField(
                        controller: _emailController,
                        decoration: InputDecoration(
                          labelText: 'Email',
                          prefixIcon: const Icon(Icons.email_outlined),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                        keyboardType: TextInputType.emailAddress,
                        validator: (value) {
                          if (value == null || value.isEmpty) return 'Please enter your email';
                          if (!value.contains('@')) return 'Please enter a valid email';
                          return null;
                        },
                      ),
                      const SizedBox(height: 16),

                      TextFormField(
                        controller: _passwordController,
                        decoration: InputDecoration(
                          labelText: 'Password',
                          prefixIcon: const Icon(Icons.lock_outline),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                        obscureText: true,
                        validator: (value) {
                          if (value == null || value.isEmpty) return 'Please enter your password';
                          if (!isLogin && value.length < 6) return 'Password must be at least 6 characters';
                          return null;
                        },
                      ),
                      const SizedBox(height: 24),

                      SizedBox(
                        width: double.infinity,
                        height: 50,
                        child: ElevatedButton(
                          onPressed: isLoading ? null : _handleSubmit,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.blue.shade700,
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          child: isLoading
                              ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                          )
                              : Text(
                            isLogin ? 'LOGIN' : 'CREATE ACCOUNT',
                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                          ),
                        ),
                      ),

                      if (isLogin)
                        TextButton(
                          onPressed: _forgotLoading ? null : _handleForgotPassword,
                          child: _forgotLoading
                              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                              : Text('Forgot password?', style: TextStyle(color: Colors.blue.shade400, fontSize: 13)),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _firstNameController.dispose();
    _lastNameController.dispose();
    _ageController.dispose();
    super.dispose();
  }
}

// ==========================================
// CORRECTED IMU SCREEN - Physics Toolbox Compatible
// ==========================================

class IMUScreen extends StatefulWidget {
  final AppUser user;
  const IMUScreen({super.key, required this.user});

  @override
  State<IMUScreen> createState() => _IMUScreenState();
}

class _IMUScreenState extends State<IMUScreen> with SingleTickerProviderStateMixin {
  String devicePlatform = '';
  String deviceModel = '';
  String deviceOsVersion = '';

  // LINEAR ACCELEROMETER - Motion only (gravity removed)
  // Uses sensor fusion: accelerometer + gyroscope to remove gravity
  double ax = 0, ay = 0, az = 0;  // m/s² - LINEAR acceleration (NO gravity)
  double gx = 0, gy = 0, gz = 0;  // rad/s - rotational velocity

  // Gravity vector estimation (for removing gravity from accelerometer)
  double gravityX = 0, gravityY = 0, gravityZ = 0;
  final double alpha = 0.8;  // Low-pass filter for gravity estimation only

  // Display-only calculated values (not stored)
  double totalLinearAccel = 0;
  double totalGyro = 0;
  double maxLinearAccel = 0;
  double maxGyro = 0;

  int sampleCount = 0;
  DateTime? startTime;
  DateTime? endTime;

  List<double> linearAccelHistory = [];
  List<double> gyroHistory = [];
  final int maxHistoryLength = 50;

  // CRITICAL: Store raw timestamped samples
  List<Map<String, dynamic>> accelSamples = [];
  List<Map<String, dynamic>> gyroSamples = [];

  StreamSubscription<AccelerometerEvent>? _accelerometerSubscription;
  StreamSubscription<GyroscopeEvent>? _gyroscopeSubscription;

  bool isRunning = false;
  String statusMessage = 'Ready to start monitoring';
  bool get isSupabaseReady => SupabaseService.isConfigured && SupabaseService.currentSession != null;

  late AnimationController _animationController;
  String? sessionId;

  List<Map<String, dynamic>> userSessions = [];
  bool loadingSessions = false;

  // Physics Toolbox target rates
  final double targetAccelRate = 100.0;
  final double targetGyroRate = 60.0;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat(reverse: true);

    _initializeDevice();
    _loadUserSessions();
  }

  Future<void> _initializeDevice() async {
    final deviceInfo = DeviceInfoPlugin();

    try {
      if (Platform.isAndroid) {
        final androidInfo = await deviceInfo.androidInfo;
        setState(() {
          devicePlatform = 'Android';
          deviceModel = '${androidInfo.manufacturer} ${androidInfo.model}';
          deviceOsVersion = 'Android ${androidInfo.version.release}';
        });
      } else if (Platform.isIOS) {
        final iosInfo = await deviceInfo.iosInfo;
        setState(() {
          devicePlatform = 'iOS';
          deviceModel = iosInfo.model;
          deviceOsVersion = iosInfo.systemVersion;
        });
      }
    } catch (e) {
      // Error getting device info
    }
  }

  Future<void> _loadUserSessions() async {
    setState(() => loadingSessions = true);
    try {
      final sessions = await SupabaseService.getUserSessions(widget.user.id);
      setState(() {
        userSessions = sessions;
        loadingSessions = false;
      });
    } catch (e) {
      setState(() => loadingSessions = false);
    }
  }

  void _startMonitoring() {
    if (isRunning) return;

    sessionId = const Uuid().v4();

    setState(() {
      isRunning = true;
      statusMessage = 'Recording: Linear Accelerometer';
      startTime = DateTime.now();
      endTime = null;
      sampleCount = 0;
      maxLinearAccel = 0;
      maxGyro = 0;
      linearAccelHistory.clear();
      gyroHistory.clear();
      accelSamples.clear();
      gyroSamples.clear();
      
      // Reset gravity estimation
      gravityX = 0;
      gravityY = 0;
      gravityZ = 0;
    });

    // LINEAR ACCELEROMETER: Uses sensor fusion to remove gravity
    // This matches Physics Toolbox "Linear Accelerometer" mode
    _accelerometerSubscription = accelerometerEventStream().listen(
          (AccelerometerEvent event) {
        final timestamp = DateTime.now().difference(startTime!).inMicroseconds / 1000000.0;

        // Estimate gravity using low-pass filter
        gravityX = alpha * gravityX + (1 - alpha) * event.x;
        gravityY = alpha * gravityY + (1 - alpha) * event.y;
        gravityZ = alpha * gravityZ + (1 - alpha) * event.z;

        // Remove gravity to get LINEAR acceleration (motion only)
        final linearX = event.x - gravityX;
        final linearY = event.y - gravityY;
        final linearZ = event.z - gravityZ;

        // Store LINEAR acceleration (gravity removed)
        accelSamples.add({
          'time': timestamp,
          'ax': linearX,  // m/s² - LINEAR (no gravity)
          'ay': linearY,
          'az': linearZ,
        });

        // Update display values (for UI only)
        setState(() {
          ax = linearX;
          ay = linearY;
          az = linearZ;
          totalLinearAccel = math.sqrt(ax * ax + ay * ay + az * az);

          if (totalLinearAccel > maxLinearAccel) {
            maxLinearAccel = totalLinearAccel;
          }

          linearAccelHistory.add(totalLinearAccel);
          if (linearAccelHistory.length > maxHistoryLength) {
            linearAccelHistory.removeAt(0);
          }
        });
      },
    );

    _gyroscopeSubscription = gyroscopeEventStream().listen(
          (GyroscopeEvent event) {
        final timestamp = DateTime.now().difference(startTime!).inMicroseconds / 1000000.0;

        // Store RAW gyroscope values in rad/s
        gyroSamples.add({
          'time': timestamp,
          'gx': event.x,  // rad/s - RAW, includes bias and noise
          'gy': event.y,
          'gz': event.z,
        });

        // Update display values (convert to deg/s for UI only)
        setState(() {
          gx = event.x * (180.0 / math.pi);
          gy = event.y * (180.0 / math.pi);
          gz = event.z * (180.0 / math.pi);
          totalGyro = math.sqrt(gx * gx + gy * gy + gz * gz);

          if (totalGyro > maxGyro) {
            maxGyro = totalGyro;
          }

          gyroHistory.add(totalGyro);
          if (gyroHistory.length > maxHistoryLength) {
            gyroHistory.removeAt(0);
          }

          sampleCount = accelSamples.length;
        });
      },
    );
  }

  void _stopMonitoring() async {
    _accelerometerSubscription?.cancel();
    _gyroscopeSubscription?.cancel();

    endTime = DateTime.now();

    setState(() {
      isRunning = false;
      statusMessage = 'Processing data...';
    });

    if (accelSamples.isNotEmpty && gyroSamples.isNotEmpty) {
      await Future.wait([
        _saveDataToCSV(),
        _saveDataToSupabase(),
      ]);
      await _loadUserSessions();
    } else {
      setState(() {
        statusMessage = 'No data to save';
      });
    }
  }

  // CRITICAL FIX: Merge sensor streams at target rates
  List<Map<String, dynamic>> _mergeSensorData() {
    if (accelSamples.isEmpty || gyroSamples.isEmpty) return [];

    final merged = <Map<String, dynamic>>[];

    // Find time range
    final startT = math.min(accelSamples.first['time'] as double, gyroSamples.first['time'] as double);
    final endT = math.max(accelSamples.last['time'] as double, gyroSamples.last['time'] as double);

    // Resample accelerometer to 100 Hz
    final accelInterval = 1.0 / targetAccelRate;  // 0.01 seconds
    int accelIdx = 0;

    for (double t = startT; t <= endT; t += accelInterval) {
      // Find nearest accelerometer sample
      while (accelIdx < accelSamples.length - 1 &&
          accelSamples[accelIdx + 1]['time'] < t) {
        accelIdx++;
      }

      // Find nearest gyro sample (naturally ~60Hz, use closest)
      int gyroIdx = 0;
      double minDiff = double.infinity;
      for (int i = 0; i < gyroSamples.length; i++) {
        final diff = (gyroSamples[i]['time'] - t).abs();
        if (diff < minDiff) {
          minDiff = diff;
          gyroIdx = i;
        }
      }

      if (accelIdx < accelSamples.length && gyroIdx < gyroSamples.length) {
        final accel = accelSamples[accelIdx];
        final gyro = gyroSamples[gyroIdx];

        merged.add({
          'time': t - startT,  // Relative time from 0
          'ax': accel['ax'],
          'ay': accel['ay'],
          'az': accel['az'],
          'gx': gyro['gx'] * (180.0 / math.pi),  // Convert rad/s to deg/s
          'gy': gyro['gy'] * (180.0 / math.pi),
          'gz': gyro['gz'] * (180.0 / math.pi),
        });
      }
    }

    return merged;
  }

  /// Builds the exact CSV string for this recording (header + data rows).
  /// Stored in Supabase and used for download so the file is exactly "as saved".
  String _buildSessionCsvString(List<Map<String, dynamic>> mergedData) {
    final csv = StringBuffer();
    csv.writeln('time,ax_filtered,ay_filtered,az_filtered,wx_filtered,wy_filtered,wz_filtered');
    for (var data in mergedData) {
      csv.writeln(
          '${data['time'].toStringAsFixed(3)},'
          '${data['ax'].toStringAsFixed(6)},'
          '${data['ay'].toStringAsFixed(6)},'
          '${data['az'].toStringAsFixed(6)},'
          '${data['gx'].toStringAsFixed(6)},'
          '${data['gy'].toStringAsFixed(6)},'
          '${data['gz'].toStringAsFixed(6)}');
    }
    return csv.toString();
  }

  Future<void> _saveDataToSupabase() async {
    if (!isSupabaseReady) {
      setState(() => statusMessage = 'Not signed in or Supabase not configured');
      return;
    }

    try {
      setState(() => statusMessage = 'Uploading to Supabase...');

      final mergedData = _mergeSensorData();
      final samplesArray = <Map<String, dynamic>>[];

      for (var data in mergedData) {
        samplesArray.add({
          'time': double.parse(data['time'].toStringAsFixed(3)),
          'ax_filtered': double.parse(data['ax'].toStringAsFixed(6)),
          'ay_filtered': double.parse(data['ay'].toStringAsFixed(6)),
          'az_filtered': double.parse(data['az'].toStringAsFixed(6)),
          'wx_filtered': double.parse(data['gx'].toStringAsFixed(6)),
          'wy_filtered': double.parse(data['gy'].toStringAsFixed(6)),
          'wz_filtered': double.parse(data['gz'].toStringAsFixed(6)),
        });
      }

      final duration = endTime!.difference(startTime!).inSeconds;
      final actualRate = duration > 0 ? mergedData.length / duration : 0.0;

      final sessionDocument = {
        'session_id': sessionId,
        'user_id': widget.user.id,
        'swimmer_info': {
          'name': widget.user.fullNameOrEmail,
          'first_name': widget.user.firstName,
          'last_name': widget.user.lastName,
          'age': widget.user.age,
          'email': widget.user.email,
        },
        'device_info': {
          'platform': devicePlatform,
          'model': deviceModel,
          'os_version': deviceOsVersion,
        },
        'session_metadata': {
          'start_time': startTime!.toUtc().toIso8601String(),
          'end_time': endTime!.toUtc().toIso8601String(),
          'duration_seconds': duration,
          'sample_count': mergedData.length,
          'sampling_rate': double.parse(actualRate.toStringAsFixed(2)),
          'accelerometer_target_hz': targetAccelRate,
          'gyroscope_target_hz': targetGyroRate,
          'raw_accel_samples': accelSamples.length,
          'raw_gyro_samples': gyroSamples.length,
        },
        'samples': samplesArray,
        'csv_content': _buildSessionCsvString(mergedData),
        'created_at': DateTime.now().toUtc().toIso8601String(),
      };

      final csvContent = sessionDocument['csv_content'] as String;
      final startDt = startTime!;
      final csvFilename = 'session_${sessionId!.length >= 8 ? sessionId!.substring(0, 8) : sessionId}_${startDt.year}${startDt.month.toString().padLeft(2, '0')}${startDt.day.toString().padLeft(2, '0')}_${startDt.hour.toString().padLeft(2, '0')}${startDt.minute.toString().padLeft(2, '0')}.csv';

      await SupabaseService.insertSession(sessionDocument);
      await SupabaseService.uploadSessionCsv(
        userId: widget.user.id,
        filename: csvFilename,
        csvContent: csvContent,
      );

      setState(() => statusMessage = 'Data uploaded successfully');

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '✓ Saved to Supabase',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                ),
                const SizedBox(height: 8),
                Text(
                  'Swimmer: ${widget.user.fullNameOrEmail}',
                  style: const TextStyle(fontSize: 12),
                ),
                Text(
                  'Samples: ${mergedData.length} @ ${actualRate.toStringAsFixed(1)} Hz',
                  style: const TextStyle(fontSize: 12),
                ),
                Text(
                  'Raw: ${accelSamples.length} accel, ${gyroSamples.length} gyro',
                  style: const TextStyle(fontSize: 12),
                ),
              ],
            ),
            backgroundColor: Colors.green.shade700,
            duration: const Duration(seconds: 6),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      setState(() => statusMessage = 'Upload failed: $e');

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Supabase upload failed:\n${e.toString()}'),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 5),
          ),
        );
      }
    }
  }

  Future<void> _saveDataToCSV() async {
    try {
      final mergedData = _mergeSensorData();
      final csvString = _buildSessionCsvString(mergedData);

      final now = DateTime.now();
      final filename = 'session_${sessionId!.substring(0, 8)}_${now.year}${now.month.toString().padLeft(2, '0')}${now.day.toString().padLeft(2, '0')}_${now.hour.toString().padLeft(2, '0')}${now.minute.toString().padLeft(2, '0')}.csv';

      String filePath;

      if (Platform.isAndroid) {
        final downloadsDir = Directory('/storage/emulated/0/Download');
        if (await downloadsDir.exists()) {
          filePath = '${downloadsDir.path}/$filename';
        } else {
          final directory = await getExternalStorageDirectory();
          filePath = '${directory!.path}/$filename';
        }
      } else {
        final directory = await getApplicationDocumentsDirectory();
        filePath = '${directory.path}/$filename';
      }

      final file = File(filePath);
      await file.writeAsString(csvString);
    } catch (e) {
      // CSV save error
    }
  }

  Future<void> _downloadSessionCSV(Map<String, dynamic> session) async {
    try {
      // Use stored CSV so download is exactly as saved; fallback to building from samples for old rows
      String csvString;
      final storedCsv = session['csv_content'] as String?;
      if (storedCsv != null && storedCsv.isNotEmpty) {
        csvString = storedCsv;
      } else {
        final csvBuffer = StringBuffer();
        csvBuffer.writeln('time,ax_filtered,ay_filtered,az_filtered,wx_filtered,wy_filtered,wz_filtered');
        final samples = session['samples'] as List? ?? [];
        for (var sample in samples) {
          csvBuffer.writeln(
              '${sample['time']},'
              '${sample['ax_filtered']},'
              '${sample['ay_filtered']},'
              '${sample['az_filtered']},'
              '${sample['wx_filtered']},'
              '${sample['wy_filtered']},'
              '${sample['wz_filtered']}');
        }
        csvString = csvBuffer.toString();
      }

      // Filename like: session_8adc1e4a_20260213_0019.csv (session prefix + date + time)
      final sessionId = session['session_id']?.toString() ?? 'session';
      final prefix = sessionId.length >= 8 ? sessionId.substring(0, 8) : sessionId;
      final metadata = session['session_metadata'];
      DateTime startDt = DateTime.now();
      if (metadata is Map && metadata['start_time'] != null) {
        try {
          startDt = DateTime.parse(metadata['start_time'].toString());
        } catch (_) {}
      }
      final dateStr = '${startDt.year}${startDt.month.toString().padLeft(2, '0')}${startDt.day.toString().padLeft(2, '0')}';
      final timeStr = '${startDt.hour.toString().padLeft(2, '0')}${startDt.minute.toString().padLeft(2, '0')}';
      final filename = 'session_${prefix}_${dateStr}_$timeStr.csv';

      String filePath;

      if (Platform.isAndroid) {
        final downloadsDir = Directory('/storage/emulated/0/Download');
        if (await downloadsDir.exists()) {
          filePath = '${downloadsDir.path}/$filename';
        } else {
          final directory = await getExternalStorageDirectory();
          filePath = '${directory!.path}/$filename';
        }
      } else {
        final directory = await getApplicationDocumentsDirectory();
        filePath = '${directory.path}/$filename';
      }

      final file = File(filePath);
      await file.writeAsString(csvString);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('✓ Downloaded: $filename'),
            backgroundColor: Colors.green,
            duration: const Duration(seconds: 3),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Download failed: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  void _showSessionsDialog() {
    showDialog(
      context: context,
      builder: (context) => Dialog(
        child: Container(
          constraints: const BoxConstraints(maxHeight: 500),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'My Sessions',
                      style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.pop(context),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1),
              Expanded(
                child: loadingSessions
                    ? const Center(child: CircularProgressIndicator())
                    : userSessions.isEmpty
                    ? const Center(
                  child: Text(
                    'No sessions yet.\nRecord your first session!',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.grey),
                  ),
                )
                    : ListView.builder(
                  itemCount: userSessions.length,
                  itemBuilder: (context, index) {
                    final session = userSessions[index];
                    final metadata = session['session_metadata'];
                    final startTime = DateTime.parse(metadata['start_time']);

                    return ListTile(
                      leading: const Icon(Icons.insert_chart, color: Colors.blue),
                      title: Text(
                        'Session ${index + 1}',
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                      subtitle: Text(
                        '${metadata['sample_count']} samples • ${metadata['duration_seconds']}s\n${startTime.day}/${startTime.month}/${startTime.year} ${startTime.hour}:${startTime.minute.toString().padLeft(2, '0')}',
                      ),
                      trailing: IconButton(
                        icon: const Icon(Icons.download, color: Colors.green),
                        onPressed: () {
                          Navigator.pop(context);
                          _downloadSessionCSV(session);
                        },
                        tooltip: 'Download CSV',
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _resetData() {
    setState(() {
      ax = ay = az = 0;
      gx = gy = gz = 0;
      gravityX = gravityY = gravityZ = 0;
      totalLinearAccel = totalGyro = 0;
      maxLinearAccel = 0;
      maxGyro = 0;
      sampleCount = 0;
      linearAccelHistory.clear();
      gyroHistory.clear();
      accelSamples.clear();
      gyroSamples.clear();
      statusMessage = 'Ready to start monitoring';
      startTime = null;
      endTime = null;
    });
  }

  void _logout() async {
    await SupabaseService.signOut();
    if (!mounted) return;
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (context) => const AuthScreen()),
    );
  }

  @override
  void dispose() {
    _accelerometerSubscription?.cancel();
    _gyroscopeSubscription?.cancel();
    _animationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final duration = startTime != null ? DateTime.now().difference(startTime!).inSeconds : 0;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text("Swimming IMU Monitor", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
            Text(
              widget.user.fullName,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.normal),
            ),
          ],
        ),
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.folder_open, semanticLabel: 'My Sessions'),
            onPressed: _showSessionsDialog,
            tooltip: 'My Sessions',
          ),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Icon(
              isSupabaseReady ? Icons.cloud_done : Icons.cloud_off,
              color: isSupabaseReady ? Colors.green : Colors.red,
            ),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: _logout,
            tooltip: 'Logout',
          ),
        ],
      ),
      body: Column(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: isRunning
                    ? [Colors.green.shade400, Colors.green.shade600]
                    : [Colors.grey.shade300, Colors.grey.shade400],
              ),
            ),
            child: Column(
              children: [
                Row(
                  children: [
                    AnimatedBuilder(
                      animation: _animationController,
                      builder: (context, child) {
                        return Icon(
                          isRunning ? Icons.sensors : Icons.sensors_off,
                          color: Colors.white,
                          size: 28 + (isRunning ? _animationController.value * 4 : 0),
                        );
                      },
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            statusMessage,
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                              fontSize: 14,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                if (isRunning) ...[
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _buildStatChip("Accel", "${accelSamples.length}"),
                      _buildStatChip("Gyro", "${gyroSamples.length}"),
                      _buildStatChip("Time", "${duration}s"),
                    ],
                  ),
                ],
              ],
            ),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Card(
                  elevation: 2,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(Icons.pool, color: Colors.blue.shade700),
                            const SizedBox(width: 8),
                            const Text(
                              "Session Info",
                              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                            ),
                            const Spacer(),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                              decoration: BoxDecoration(
                                color: Colors.blue.shade50,
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Text(
                                '${userSessions.length} sessions',
                                style: TextStyle(
                                  color: Colors.blue.shade700,
                                  fontWeight: FontWeight.w600,
                                  fontSize: 12,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        _buildInfoRow("Swimmer", widget.user.fullName),
                        _buildInfoRow("Age", '${widget.user.age} years'),
                        _buildInfoRow("Device", deviceModel),
                        const Divider(height: 24),
                        const Text(
                          "Sensor Configuration",
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 8),
                        _buildInfoRow("Accelerometer", "Linear (gravity removed)"),
                        _buildInfoRow("Gyroscope", "Rotational velocity"),
                        _buildInfoRow("Data Mode", "Physics Toolbox compatible"),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Card(
                  elevation: 4,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: Colors.blue.withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Icon(Icons.speed, color: Colors.blue, size: 28),
                            ),
                            const SizedBox(width: 12),
                            const Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    "Linear Accelerometer",
                                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                                  ),
                                  Text(
                                    "Motion only (gravity removed via sensor fusion)",
                                    style: TextStyle(fontSize: 11, color: Colors.grey),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 20),
                        if (linearAccelHistory.isNotEmpty) ...[
                          SizedBox(
                            height: 60,
                            child: CustomPaint(
                              size: const Size(double.infinity, 60),
                              painter: MiniGraphPainter(
                                data: linearAccelHistory,
                                color: Colors.blue,
                                max: maxLinearAccel > 0 ? maxLinearAccel : 1,
                              ),
                            ),
                          ),
                          const SizedBox(height: 16),
                        ],
                        _buildAxisRow("X", ax, "m/s²", Colors.red),
                        const SizedBox(height: 10),
                        _buildAxisRow("Y", ay, "m/s²", Colors.green),
                        const SizedBox(height: 10),
                        _buildAxisRow("Z", az, "m/s²", Colors.blue),
                        const SizedBox(height: 16),
                        Row(
                          children: [
                            Expanded(
                              child: Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: Colors.blue.withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Column(
                                  children: [
                                    const Text("Magnitude", style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                                    const SizedBox(height: 4),
                                    Text(
                                      "${totalLinearAccel.toStringAsFixed(2)} m/s²",
                                      style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.blue, fontSize: 18),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: Colors.grey.withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Column(
                                  children: [
                                    const Text("Peak", style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                                    const SizedBox(height: 4),
                                    Text(
                                      "${maxLinearAccel.toStringAsFixed(2)} m/s²",
                                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Card(
                  elevation: 4,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: Colors.orange.withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Icon(Icons.screen_rotation, color: Colors.orange, size: 28),
                            ),
                            const SizedBox(width: 12),
                            const Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    "Gyroscope",
                                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                                  ),
                                  Text(
                                    "Measures rotational velocity around 3 axes",
                                    style: TextStyle(fontSize: 11, color: Colors.grey),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 20),
                        if (gyroHistory.isNotEmpty) ...[
                          SizedBox(
                            height: 60,
                            child: CustomPaint(
                              size: const Size(double.infinity, 60),
                              painter: MiniGraphPainter(
                                data: gyroHistory,
                                color: Colors.orange,
                                max: maxGyro > 0 ? maxGyro : 1,
                              ),
                            ),
                          ),
                          const SizedBox(height: 16),
                        ],
                        _buildAxisRow("X", gx, "deg/s", Colors.red),
                        const SizedBox(height: 10),
                        _buildAxisRow("Y", gy, "deg/s", Colors.green),
                        const SizedBox(height: 10),
                        _buildAxisRow("Z", gz, "deg/s", Colors.blue),
                        const SizedBox(height: 16),
                        Row(
                          children: [
                            Expanded(
                              child: Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: Colors.orange.withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Column(
                                  children: [
                                    const Text("Magnitude", style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                                    const SizedBox(height: 4),
                                    Text(
                                      "${totalGyro.toStringAsFixed(2)} deg/s",
                                      style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.orange, fontSize: 18),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: Colors.grey.withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Column(
                                  children: [
                                    const Text("Peak", style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                                    const SizedBox(height: 4),
                                    Text(
                                      "${maxGyro.toStringAsFixed(2)} deg/s",
                                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 80),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Theme.of(context).scaffoldBackgroundColor,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.1),
                  blurRadius: 10,
                  offset: const Offset(0, -3),
                ),
              ],
            ),
            child: SafeArea(
              child: Row(
                children: [
                  Expanded(
                    flex: 2,
                    child: ElevatedButton.icon(
                      onPressed: isRunning ? null : _startMonitoring,
                      icon: const Icon(Icons.play_arrow, size: 24),
                      label: const Text("START", style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        disabledBackgroundColor: Colors.grey.shade300,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton.icon(
                      onPressed: isRunning ? _stopMonitoring : null,
                      icon: const Icon(Icons.stop, size: 24),
                      label: const Text("STOP", style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.red,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        disabledBackgroundColor: Colors.grey.shade300,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _resetData,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.grey.shade700,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: const Icon(Icons.refresh, size: 24),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.grey)),
          Flexible(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600), textAlign: TextAlign.end)),
        ],
      ),
    );
  }

  Widget _buildStatChip(String label, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Text(value, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
          Text(label, style: const TextStyle(color: Colors.white70, fontSize: 10)),
        ],
      ),
    );
  }

  Widget _buildAxisRow(String axis, double value, String unit, Color color) {
    return Row(
      children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(color: color.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(10)),
          child: Center(
            child: Text(axis, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: color)),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(color: Colors.grey.shade100, borderRadius: BorderRadius.circular(10)),
            child: Text("${value.toStringAsFixed(3)} $unit",
                style: const TextStyle(fontFamily: 'monospace', fontSize: 16, fontWeight: FontWeight.w500, color: Colors.black87)),
          ),
        ),
      ],
    );
  }
}

class MiniGraphPainter extends CustomPainter {
  final List<double> data;
  final Color color;
  final double max;

  MiniGraphPainter({required this.data, required this.color, required this.max});

  @override
  void paint(Canvas canvas, Size size) {
    if (data.isEmpty) return;

    final paint = Paint()
      ..color = color
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;
    final fillPaint = Paint()
      ..color = color.withValues(alpha: 0.2)
      ..style = PaintingStyle.fill;
    final path = Path();
    final fillPath = Path();
    final stepX = size.width / (data.length - 1);

    for (int i = 0; i < data.length; i++) {
      final x = i * stepX;
      final y = size.height - (data[i] / max * size.height);
      if (i == 0) {
        path.moveTo(x, y);
        fillPath.moveTo(x, size.height);
        fillPath.lineTo(x, y);
      } else {
        path.lineTo(x, y);
        fillPath.lineTo(x, y);
      }
    }

    fillPath.lineTo(size.width, size.height);
    fillPath.close();
    canvas.drawPath(fillPath, fillPaint);
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}