import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'screens/menu_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  runApp(const BrainrotApp());
}

class BrainrotApp extends StatelessWidget {
  const BrainrotApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Verwandlung Brainrot Runner',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff8338ec), brightness: Brightness.dark),
        scaffoldBackgroundColor: const Color(0xff1a1240),
        useMaterial3: true,
      ),
      home: const MenuScreen(),
    );
  }
}
