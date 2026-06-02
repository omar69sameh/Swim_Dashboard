import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:sensors_plus/sensors_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'dart:math' as math;

void main() {
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
      home: const IMUScreen(),
    );
  }
}

class IMUScreen extends StatefulWidget {
  const IMUScreen({super.key});

  @override
  State<IMUScreen> createState() => _IMUScreenState();
}

class _IMUScreenState extends State<IMUScreen> with SingleTickerProviderStateMixin {
  // Raw sensor data
  double ax = 0, ay = 0, az = 0;
  double gx = 0, gy = 0, gz = 0;
  double mx = 0, my = 0, mz = 0;

  // Filtered data (complementary filter)
  double filteredPitch = 0;
  double filteredRoll = 0;
  double filteredYaw = 0;

  // Calculated data
  double totalAcceleration = 0;
  double totalGyro = 0;
  double totalMag = 0;

  // Motion detection
  double linearAcceleration = 0;
  double smoothedLinearAccel = 0;
  bool isMoving = false;
  String motionState = "Stationary";

  // Motion detection parameters
  final double _stationaryThreshold = 0.3;
  final double _walkingThreshold = 1.5;
  final double _runningThreshold = 4.0;
  final double _motionSmoothingAlpha = 0.9;

  // Motion state stability
  int _motionStateCounter = 0;
  String _pendingMotionState = "Stationary";
  final int _stateChangeThreshold = 5;

  // Orientation
  double pitch = 0;
  double roll = 0;
  double yaw = 0;

  // Heading
  double heading = 0;
  double tiltCompensatedHeading = 0;

  // Statistics
  double maxAcceleration = 0;
  double maxGyro = 0;
  int sampleCount = 0;
  DateTime? startTime;

  // History for graphs
  List<double> accelerationHistory = [];
  List<double> gyroHistory = [];
  final int maxHistoryLength = 50;

  // Data collection for CSV export
  List<Map<String, dynamic>> collectedData = [];

  // Stream subscriptions
  StreamSubscription<AccelerometerEvent>? _accelerometerSubscription;
  StreamSubscription<GyroscopeEvent>? _gyroscopeSubscription;
  StreamSubscription<MagnetometerEvent>? _magnetometerSubscription;

  // Status
  bool isRunning = false;
  String statusMessage = 'Ready to start monitoring';

  // Filter parameters
  final double _alpha = 0.8;
  final double _complementaryAlpha = 0.98;
  final double _gravity = 9.81;

  Timer? _filterTimer;
  DateTime? _lastUpdateTime;

  late AnimationController _animationController;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat(reverse: true);
  }

  void _startMonitoring() {
    if (isRunning) return;

    setState(() {
      isRunning = true;
      statusMessage = 'Monitoring active';
      startTime = DateTime.now();
      sampleCount = 0;
      maxAcceleration = 0;
      maxGyro = 0;
      accelerationHistory.clear();
      gyroHistory.clear();
      collectedData.clear();
    });

    _lastUpdateTime = DateTime.now();

    _accelerometerSubscription = accelerometerEventStream().listen(
          (AccelerometerEvent event) {
        setState(() {
          ax = _alpha * event.x + (1 - _alpha) * ax;
          ay = _alpha * event.y + (1 - _alpha) * ay;
          az = _alpha * event.z + (1 - _alpha) * az;

          totalAcceleration = math.sqrt(ax * ax + ay * ay + az * az);
          linearAcceleration = (totalAcceleration - _gravity).abs();
          smoothedLinearAccel = _motionSmoothingAlpha * smoothedLinearAccel +
              (1 - _motionSmoothingAlpha) * linearAcceleration;

          String newMotionState;
          if (smoothedLinearAccel < _stationaryThreshold) {
            newMotionState = "Stationary";
            isMoving = false;
          } else if (smoothedLinearAccel < _walkingThreshold) {
            newMotionState = "Light Motion";
            isMoving = true;
          } else if (smoothedLinearAccel < _runningThreshold) {
            newMotionState = "Walking";
            isMoving = true;
          } else if (smoothedLinearAccel < 8.0) {
            newMotionState = "Running";
            isMoving = true;
          } else {
            newMotionState = "High Activity";
            isMoving = true;
          }

          if (newMotionState == _pendingMotionState) {
            _motionStateCounter++;
            if (_motionStateCounter >= _stateChangeThreshold) {
              motionState = newMotionState;
            }
          } else {
            _pendingMotionState = newMotionState;
            _motionStateCounter = 0;
          }

          pitch = math.atan2(ay, math.sqrt(ax * ax + az * az)) * 180 / math.pi;
          roll = math.atan2(-ax, az) * 180 / math.pi;

          if (totalAcceleration > maxAcceleration) {
            maxAcceleration = totalAcceleration;
          }

          accelerationHistory.add(totalAcceleration);
          if (accelerationHistory.length > maxHistoryLength) {
            accelerationHistory.removeAt(0);
          }

          sampleCount++;

          collectedData.add({
            'elapsed_ms': DateTime.now().difference(startTime!).inMilliseconds,
            'ax': ax,
            'ay': ay,
            'az': az,
            'gx': gx,
            'gy': gy,
            'gz': gz,
            'mx': mx,
            'my': my,
            'mz': mz,
          });
        });
      },
      onError: (error) {
        setState(() {
          statusMessage = 'Accelerometer error: $error';
        });
      },
    );

    _gyroscopeSubscription = gyroscopeEventStream().listen(
          (GyroscopeEvent event) {
        final now = DateTime.now();
        final dt = _lastUpdateTime != null
            ? now.difference(_lastUpdateTime!).inMicroseconds / 1000000.0
            : 0.01;
        _lastUpdateTime = now;

        setState(() {
          gx = _alpha * event.x + (1 - _alpha) * gx;
          gy = _alpha * event.y + (1 - _alpha) * gy;
          gz = _alpha * event.z + (1 - _alpha) * gz;

          totalGyro = math.sqrt(gx * gx + gy * gy + gz * gz);

          final gyroPitch = filteredPitch + gy * dt * 180 / math.pi;
          final gyroRoll = filteredRoll + gx * dt * 180 / math.pi;

          filteredPitch = _complementaryAlpha * gyroPitch + (1 - _complementaryAlpha) * pitch;
          filteredRoll = _complementaryAlpha * gyroRoll + (1 - _complementaryAlpha) * roll;

          filteredYaw += gz * dt * 180 / math.pi;
          filteredYaw = filteredYaw % 360;
          if (filteredYaw < 0) filteredYaw += 360;

          if (totalGyro > maxGyro) {
            maxGyro = totalGyro;
          }

          gyroHistory.add(totalGyro);
          if (gyroHistory.length > maxHistoryLength) {
            gyroHistory.removeAt(0);
          }
        });
      },
      onError: (error) {
        setState(() {
          statusMessage = 'Gyroscope error: $error';
        });
      },
    );

    _magnetometerSubscription = magnetometerEventStream().listen(
          (MagnetometerEvent event) {
        setState(() {
          mx = _alpha * event.x + (1 - _alpha) * mx;
          my = _alpha * event.y + (1 - _alpha) * my;
          mz = _alpha * event.z + (1 - _alpha) * mz;

          totalMag = math.sqrt(mx * mx + my * my + mz * mz);

          heading = math.atan2(my, mx) * 180 / math.pi;
          if (heading < 0) heading += 360;

          final pitchRad = filteredPitch * math.pi / 180;
          final rollRad = filteredRoll * math.pi / 180;

          final magX = mx * math.cos(pitchRad) + mz * math.sin(pitchRad);
          final magY = mx * math.sin(rollRad) * math.sin(pitchRad) +
              my * math.cos(rollRad) -
              mz * math.sin(rollRad) * math.cos(pitchRad);

          tiltCompensatedHeading = math.atan2(magY, magX) * 180 / math.pi;
          if (tiltCompensatedHeading < 0) tiltCompensatedHeading += 360;
        });
      },
      onError: (error) {
        setState(() {
          statusMessage = 'Magnetometer error: $error';
        });
      },
    );
  }

  void _stopMonitoring() async {
    _accelerometerSubscription?.cancel();
    _gyroscopeSubscription?.cancel();
    _magnetometerSubscription?.cancel();
    _filterTimer?.cancel();

    setState(() {
      isRunning = false;
      statusMessage = 'Saving data...';
    });

    if (collectedData.isNotEmpty) {
      await _saveDataToCSV();
    } else {
      setState(() {
        statusMessage = 'No data to save';
      });
    }
  }

  Future<void> _saveDataToCSV() async {
    try {
      // Create CSV content
      final csvBuffer = StringBuffer();
      csvBuffer.writeln('time_s,ax,ay,az,gx,gy,gz,mx,my,mz');

      for (var data in collectedData) {
        // Calculate time in seconds from start
        final timeInSeconds = (data['elapsed_ms'] / 1000.0).toStringAsFixed(3);

        csvBuffer.writeln(
            '$timeInSeconds,'
                '${data['ax'].toStringAsFixed(6)},'
                '${data['ay'].toStringAsFixed(6)},'
                '${data['az'].toStringAsFixed(6)},'
                '${data['gx'].toStringAsFixed(6)},'
                '${data['gy'].toStringAsFixed(6)},'
                '${data['gz'].toStringAsFixed(6)},'
                '${data['mx'].toStringAsFixed(6)},'
                '${data['my'].toStringAsFixed(6)},'
                '${data['mz'].toStringAsFixed(6)}'
        );
      }

      final now = DateTime.now();
      final filename = 'IMU_Data_${now.year}${now.month.toString().padLeft(2, '0')}${now.day.toString().padLeft(2, '0')}_${now.hour.toString().padLeft(2, '0')}${now.minute.toString().padLeft(2, '0')}${now.second.toString().padLeft(2, '0')}.csv';

      // Try to save to Downloads folder for Android, or app directory for others
      String filePath;

      if (Platform.isAndroid) {
        // Try Downloads folder first
        final downloadsDir = Directory('/storage/emulated/0/Download');
        if (await downloadsDir.exists()) {
          filePath = '${downloadsDir.path}/$filename';
        } else {
          // Fallback to external storage
          final directory = await getExternalStorageDirectory();
          filePath = '${directory!.path}/$filename';
        }
      } else {
        // For iOS and others, use documents directory
        final directory = await getApplicationDocumentsDirectory();
        filePath = '${directory.path}/$filename';
      }

      final file = File(filePath);
      await file.writeAsString(csvBuffer.toString());

      setState(() {
        statusMessage = 'Saved ${collectedData.length} samples';
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '✓ Data Saved Successfully!',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                ),
                const SizedBox(height: 8),
                Text(
                  'File: $filename',
                  style: const TextStyle(fontSize: 13),
                ),
                const SizedBox(height: 4),
                Text(
                  'Location: Downloads',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                ),
                const SizedBox(height: 4),
                Text(
                  'Samples: ${collectedData.length}',
                  style: const TextStyle(fontSize: 12),
                ),
              ],
            ),
            backgroundColor: Colors.green.shade700,
            duration: const Duration(seconds: 8),
            behavior: SnackBarBehavior.floating,
            action: SnackBarAction(
              label: 'OK',
              textColor: Colors.white,
              onPressed: () {},
            ),
          ),
        );
      }
    } catch (e) {
      setState(() {
        statusMessage = 'Save failed: ${e.toString()}';
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error saving file:\n${e.toString()}'),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 6),
          ),
        );
      }
    }
  }

  void _resetData() {
    setState(() {
      ax = ay = az = 0;
      gx = gy = gz = 0;
      mx = my = mz = 0;
      totalAcceleration = totalGyro = totalMag = 0;
      pitch = roll = yaw = 0;
      filteredPitch = filteredRoll = filteredYaw = 0;
      heading = tiltCompensatedHeading = 0;
      linearAcceleration = 0;
      smoothedLinearAccel = 0;
      isMoving = false;
      motionState = "Stationary";
      _pendingMotionState = "Stationary";
      _motionStateCounter = 0;
      maxAcceleration = 0;
      maxGyro = 0;
      sampleCount = 0;
      accelerationHistory.clear();
      gyroHistory.clear();
      statusMessage = 'Data reset';
      startTime = null;
    });
  }

  @override
  void dispose() {
    _stopMonitoring();
    _animationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final duration = startTime != null
        ? DateTime.now().difference(startTime!).inSeconds
        : 0;

    return Scaffold(
      appBar: AppBar(
        title: const Text("IMU Sensor Monitor", style: TextStyle(fontWeight: FontWeight.bold)),
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.info_outline),
            onPressed: () => _showInfoDialog(context),
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
                              fontSize: 16,
                            ),
                          ),
                          if (isRunning) ...[
                            const SizedBox(height: 4),
                            Text(
                              'Motion: $motionState',
                              style: const TextStyle(
                                color: Colors.white70,
                                fontSize: 12,
                              ),
                            ),
                          ],
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
                      _buildStatChip("Samples", sampleCount.toString()),
                      _buildStatChip("Time", "${duration}s"),
                      _buildStatChip("Rate", sampleCount > 0 ? "${(sampleCount / duration).toStringAsFixed(0)} Hz" : "0 Hz"),
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
                _buildSensorCardWithGraph(
                  title: "Accelerometer",
                  unit: "m/s²",
                  x: ax,
                  y: ay,
                  z: az,
                  total: totalAcceleration,
                  max: maxAcceleration,
                  icon: Icons.speed,
                  color: Colors.blue,
                  history: accelerationHistory,
                ),
                const SizedBox(height: 16),

                _buildSensorCardWithGraph(
                  title: "Gyroscope",
                  unit: "rad/s",
                  x: gx,
                  y: gy,
                  z: gz,
                  total: totalGyro,
                  max: maxGyro,
                  icon: Icons.screen_rotation,
                  color: Colors.orange,
                  history: gyroHistory,
                ),
                const SizedBox(height: 16),

                _buildSensorCard(
                  title: "Magnetometer",
                  unit: "μT",
                  x: mx,
                  y: my,
                  z: mz,
                  total: totalMag,
                  icon: Icons.explore,
                  color: Colors.purple,
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
                  color: Colors.black.withOpacity(0.1),
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
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
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
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
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
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
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

  Widget _buildSensorCardWithGraph({
    required String title, required String unit, required double x, required double y, required double z,
    required double total, required double max, required IconData icon, required Color color, required List<double> history,
  }) {
    return Card(
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
                  decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                  child: Icon(icon, color: color, size: 28),
                ),
                const SizedBox(width: 12),
                Text(title, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
              ],
            ),
            const SizedBox(height: 20),

            if (history.isNotEmpty) ...[
              SizedBox(
                height: 60,
                child: CustomPaint(
                  size: const Size(double.infinity, 60),
                  painter: MiniGraphPainter(data: history, color: color, max: max > 0 ? max : 1),
                ),
              ),
              const SizedBox(height: 16),
            ],

            _buildAxisRow("X", x, unit, Colors.red),
            const SizedBox(height: 10),
            _buildAxisRow("Y", y, unit, Colors.green),
            const SizedBox(height: 10),
            _buildAxisRow("Z", z, unit, Colors.blue),

            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                    child: Column(
                      children: [
                        const Text("Magnitude", style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                        const SizedBox(height: 4),
                        Text("${total.toStringAsFixed(2)} $unit",
                            style: TextStyle(fontWeight: FontWeight.bold, color: color, fontSize: 18)),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: Colors.grey.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                    child: Column(
                      children: [
                        const Text("Peak", style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                        const SizedBox(height: 4),
                        Text("${max.toStringAsFixed(2)} $unit",
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSensorCard({
    required String title, required String unit, required double x, required double y, required double z,
    required double total, required IconData icon, required Color color,
  }) {
    return Card(
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
                  decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                  child: Icon(icon, color: color, size: 28),
                ),
                const SizedBox(width: 12),
                Text(title, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
              ],
            ),
            const SizedBox(height: 20),

            _buildAxisRow("X", x, unit, Colors.red),
            const SizedBox(height: 10),
            _buildAxisRow("Y", y, unit, Colors.green),
            const SizedBox(height: 10),
            _buildAxisRow("Z", z, unit, Colors.blue),

            const SizedBox(height: 16),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text("Magnitude", style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                  Text("${total.toStringAsFixed(2)} $unit",
                      style: TextStyle(fontWeight: FontWeight.bold, color: color, fontSize: 20)),
                ],
              ),
            ),
          ],
        ),
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

  void _showInfoDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text("About IMU Monitor"),
        content: const SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text("Features:", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              SizedBox(height: 8),
              Text("• Low-pass filtering for noise reduction"),
              Text("• Complementary filter for stable orientation"),
              Text("• Real-time data visualization with graphs"),
              Text("• CSV export to Downloads folder"),
              SizedBox(height: 12),
              Text("CSV Output:", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              SizedBox(height: 8),
              Text("• Time starts from 0 seconds"),
              Text("• Raw sensor data: ax, ay, az, gx, gy, gz, mx, my, mz"),
              Text("• Files saved in Downloads folder"),
              SizedBox(height: 12),
              Text("Sensors:", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              SizedBox(height: 8),
              Text("• Accelerometer: measures acceleration"),
              Text("• Gyroscope: measures angular velocity"),
              Text("• Magnetometer: measures magnetic field"),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text("Close"),
          ),
        ],
      ),
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

    final paint = Paint()..color = color..strokeWidth = 2..style = PaintingStyle.stroke;
    final fillPaint = Paint()..color = color.withValues(alpha: 0.2)..style = PaintingStyle.fill;
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