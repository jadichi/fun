import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../game/engine.dart';
import '../game/prefs.dart';
import 'game_screen.dart';

class MenuScreen extends StatefulWidget {
  const MenuScreen({super.key});

  @override
  State<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends State<MenuScreen> with SingleTickerProviderStateMixin {
  Prefs? _prefs;
  String? _book;
  late final AnimationController _wobble = AnimationController(vsync: this, duration: const Duration(seconds: 2))
    ..repeat(reverse: true);

  @override
  void initState() {
    super.initState();
    Prefs.load().then((p) => setState(() => _prefs = p));
    rootBundle.loadString('assets/book.txt').then((b) => setState(() => _book = b));
  }

  @override
  void dispose() {
    _wobble.dispose();
    super.dispose();
  }

  Future<void> _play({bool demo = false}) async {
    final prefs = _prefs, book = _book;
    if (prefs == null || book == null) return;
    await Navigator.of(context).push(PageRouteBuilder(
      pageBuilder: (_, _, _) => GameScreen(book: book, prefs: prefs, demo: demo),
      transitionsBuilder: (_, a, _, child) => FadeTransition(opacity: a, child: child),
    ));
    setState(() {}); // refresh highscore
  }

  @override
  Widget build(BuildContext context) {
    final p = _prefs;
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xff3fb7ff), Color(0xff8338ec), Color(0xff1a1240)]),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Column(
              children: [
                const Spacer(),
                AnimatedBuilder(
                  animation: _wobble,
                  builder: (_, child) => Transform.rotate(angle: (_wobble.value - 0.5) * 0.08, child: child),
                  child: const Text('🪳', style: TextStyle(fontSize: 96)),
                ),
                const SizedBox(height: 8),
                const _Outlined('DIE VERWANDLUNG', size: 34),
                const _Outlined('BRAINROT RUNNER', size: 26, color: Color(0xff3ff2c8)),
                const SizedBox(height: 10),
                const Text('Gregor Samsa erwacht als Käfer. Lauf. Sammle jedes Zeichen des Buches.',
                    textAlign: TextAlign.center, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white70)),
                const SizedBox(height: 18),
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 6,
                  runSpacing: 6,
                  children: [for (final m in Meme.values) _chip(memeGlyph[m]!)],
                ),
                const Spacer(),
                if (p != null)
                  Text('Highscore: ${p.highscore} Aura', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Color(0xffffd23f))),
                const SizedBox(height: 14),
                SizedBox(
                  width: double.infinity,
                  height: 64,
                  child: FilledButton(
                    style: FilledButton.styleFrom(backgroundColor: const Color(0xffffd23f), foregroundColor: const Color(0xff2a145f), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18))),
                    onPressed: (p == null || _book == null) ? null : _play,
                    child: const Text('SPIELEN', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900, letterSpacing: 2)),
                  ),
                ),
                const SizedBox(height: 12),
                if (p != null)
                  Wrap(alignment: WrapAlignment.center, spacing: 8, runSpacing: 4, children: [
                    _toggle(p.sound ? '🔊 Ton an' : '🔇 Ton aus', () => setState(() => p.sound = !p.sound)),
                    _toggle(p.bookLine ? '📖 Buchzeile an' : '📖 Buchzeile aus', () => setState(() => p.bookLine = !p.bookLine)),
                    _toggle('👀 Demo', () => _play(demo: true)),
                  ]),
                const SizedBox(height: 14),
                const Text('Wischen: ⬅️ ➡️ Spur wechseln · ⬆️ springen · ⬇️ rutschen\nRampen führen auf die Zugdächer. Zweimal stolpern, dann erwischt dich der Vater 🍎',
                    textAlign: TextAlign.center, style: TextStyle(fontSize: 12.5, color: Colors.white60, height: 1.4)),
                const SizedBox(height: 12),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _chip(String t) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(color: const Color(0x33ffffff), borderRadius: BorderRadius.circular(20)),
        child: Text(t, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
      );

  Widget _toggle(String t, VoidCallback onTap) => TextButton(
        onPressed: onTap,
        style: TextButton.styleFrom(backgroundColor: const Color(0x33ffffff), foregroundColor: Colors.white),
        child: Text(t, style: const TextStyle(fontWeight: FontWeight.w800)),
      );
}

class _Outlined extends StatelessWidget {
  const _Outlined(this.text, {required this.size, this.color = Colors.white});
  final String text;
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Stack(children: [
      Text(text,
          textAlign: TextAlign.center,
          style: TextStyle(
              fontSize: size,
              fontWeight: FontWeight.w900,
              foreground: Paint()
                ..style = PaintingStyle.stroke
                ..strokeWidth = size * 0.2
                ..strokeJoin = StrokeJoin.round
                ..color = const Color(0xff2a145f))),
      Text(text, textAlign: TextAlign.center, style: TextStyle(fontSize: size, fontWeight: FontWeight.w900, color: color)),
    ]);
  }
}
