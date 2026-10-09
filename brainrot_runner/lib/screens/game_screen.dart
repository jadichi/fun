import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';

import '../game/audio.dart';
import '../game/engine.dart';
import '../game/prefs.dart';
import '../game/renderer.dart';

class GameScreen extends StatefulWidget {
  const GameScreen({super.key, required this.book, required this.prefs, this.demo = false});
  final String book;
  final Prefs prefs;
  /// The autopilot plays (nice for screen recordings); no highscore is saved.
  final bool demo;

  @override
  State<GameScreen> createState() => _GameScreenState();
}

class _GameScreenState extends State<GameScreen> with SingleTickerProviderStateMixin {
  late final Game game = Game(book: widget.book)..autopilot = widget.demo;
  late final Ticker _ticker = createTicker(_tick);
  final ValueNotifier<int> _frame = ValueNotifier(0);
  final Sounds _sounds = Sounds();
  final FocusNode _focus = FocusNode();
  Duration _last = Duration.zero;
  bool _paused = false;
  double _deadFor = 0;
  bool _newHigh = false, _saved = false;
  Offset? _swipeStart;
  bool _swipeUsed = false;

  @override
  void initState() {
    super.initState();
    _sounds.enabled = widget.prefs.sound;
    _sounds.load();
    _ticker.start();
  }

  @override
  void dispose() {
    _ticker.dispose();
    _sounds.dispose();
    _focus.dispose();
    _frame.dispose();
    super.dispose();
  }

  void _tick(Duration now) {
    final dt = _last == Duration.zero ? 0.0 : (now - _last).inMicroseconds / 1e6;
    _last = now;
    if (_paused) return;
    game.update(dt);
    for (final e in game.events) {
      _sounds.play(e);
      if (e == Sfx.crash) HapticFeedback.heavyImpact();
      if (e == Sfx.stumble) HapticFeedback.mediumImpact();
    }
    game.events.clear();
    if (!game.alive) {
      _deadFor += dt;
      if (!_saved) _save();
    }
    _frame.value++;
  }

  void _save() {
    _saved = true;
    if (widget.demo) return;
    final sc = game.score.round();
    if (sc > widget.prefs.highscore) {
      widget.prefs.highscore = sc;
      _newHigh = true;
    }
    if (game.letters > widget.prefs.bestLetters) widget.prefs.bestLetters = game.letters;
  }

  void _restart() {
    setState(() {
      game.reset();
      game.autopilot = widget.demo;
      _deadFor = 0;
      _saved = false;
      _newHigh = false;
      _paused = false;
    });
  }

  // ---------------------------------------------------------------- input
  void _swipe(Offset d) {
    if (d.dx.abs() > d.dy.abs()) {
      d.dx < 0 ? game.left() : game.right();
    } else {
      d.dy < 0 ? game.jump() : game.roll_();
    }
  }

  KeyEventResult _key(FocusNode _, KeyEvent e) {
    if (e is! KeyDownEvent) return KeyEventResult.ignored;
    final k = e.logicalKey;
    if (k == LogicalKeyboardKey.arrowLeft || k == LogicalKeyboardKey.keyA) {
      game.left();
    } else if (k == LogicalKeyboardKey.arrowRight || k == LogicalKeyboardKey.keyD) {
      game.right();
    } else if (k == LogicalKeyboardKey.arrowUp || k == LogicalKeyboardKey.keyW || k == LogicalKeyboardKey.space) {
      game.jump();
    } else if (k == LogicalKeyboardKey.arrowDown || k == LogicalKeyboardKey.keyS) {
      game.roll_();
    } else if (k == LogicalKeyboardKey.keyP || k == LogicalKeyboardKey.escape) {
      setState(() => _paused = !_paused);
    } else {
      return KeyEventResult.ignored;
    }
    return KeyEventResult.handled;
  }

  // ---------------------------------------------------------------- UI
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Focus(
        focusNode: _focus,
        autofocus: true,
        onKeyEvent: _key,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onPanStart: (d) {
            _swipeStart = d.localPosition;
            _swipeUsed = false;
          },
          onPanUpdate: (d) {
            final st = _swipeStart;
            if (st == null || _swipeUsed) return;
            final delta = d.localPosition - st;
            if (delta.distance > 28) {
              _swipeUsed = true;
              _swipe(delta);
            }
          },
          onPanEnd: (_) => _swipeStart = null,
          child: Stack(
            fit: StackFit.expand,
            children: [
              RepaintBoundary(child: CustomPaint(painter: GamePainter(game, _frame))),
              ValueListenableBuilder<int>(valueListenable: _frame, builder: (_, _, _) => _hud()),
              if (_paused) _pauseOverlay(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _hud() {
    final g = game;
    final top = MediaQuery.paddingOf(context).top + 8;
    final chips = <Widget>[
      for (final e in g.powers.entries) _effectChip(powerGlyph[e.key]!, _powerName(e.key), e.value / powerDuration[e.key]!),
      for (final e in g.fx.entries)
        if (memeDuration[e.key]! > 1.6) _effectChip(memeGlyph[e.key]!, memeInfo[e.key]!, e.value / memeDuration[e.key]!),
      if (g.shield) _effectChip('🛡️', 'Aura-Schild', 1),
    ];
    return Stack(children: [
      Positioned(
        left: 14,
        top: top,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('AURA', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: Colors.white70, letterSpacing: 2)),
          Row(children: [
            _outlined('${g.score.round()}', 34, const Color(0xffffd23f)),
            if (g.mult > 1) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(color: const Color(0xffff4fa3), borderRadius: BorderRadius.circular(10)),
                child: Text('×${g.mult}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18)),
              ),
            ],
          ]),
        ]),
      ),
      Positioned(
        right: 8,
        top: top,
        child: Row(children: [
          _outlined('📖 ${g.letters}', 22, Colors.white),
          IconButton(
            onPressed: g.alive ? () => setState(() => _paused = true) : null,
            icon: const Icon(Icons.pause_circle_filled, size: 36, color: Colors.white),
          ),
        ]),
      ),
      Positioned(
        left: 12,
        top: top + 70,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: chips),
      ),
      if (g.stumbleT > 0 && g.alive)
        Positioned(
          left: 0,
          right: 0,
          top: top + 60,
          child: Center(child: _outlined('🍎 Der Vater ist hinter dir!', 18, const Color(0xffff6b6b))),
        ),
      if (widget.demo)
        Positioned(left: 0, right: 0, top: top + 4, child: Center(child: _outlined('DEMO', 18, const Color(0xff3ff2c8)))),
      if (g.time < 4 && g.alive && !widget.demo)
        Positioned(
          left: 0,
          right: 0,
          bottom: 140,
          child: Opacity(
            opacity: (4 - g.time).clamp(0.0, 1.0),
            child: Center(child: _outlined('Wischen: ⬅️ ➡️ ⬆️ ⬇️', 22, Colors.white)),
          ),
        ),
      if (widget.prefs.bookLine && g.resolvedMax >= 0) Positioned(left: 12, right: 12, bottom: MediaQuery.paddingOf(context).bottom + 16, child: _bookLine()),
      if (!g.alive && _deadFor > 0.9) _gameOver(),
    ]);
  }

  String _powerName(Power p) => switch (p) {
        Power.jetpack => 'Jetpack',
        Power.magnet => 'Magnet',
        Power.x2 => 'Doppelte Aura',
        Power.sneakers => 'Super-Sprung',
      };

  Widget _effectChip(String glyph, String label, double frac) {
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.fromLTRB(6, 4, 10, 4),
      decoration: BoxDecoration(color: const Color(0xaa1a1240), borderRadius: BorderRadius.circular(12)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Text(glyph, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
        const SizedBox(width: 6),
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
          const SizedBox(height: 3),
          SizedBox(
            width: 110,
            height: 4,
            child: LinearProgressIndicator(value: frac.clamp(0, 1), color: const Color(0xff3ff2c8), backgroundColor: Colors.white24),
          ),
        ]),
      ]),
    );
  }

  /// The last stretch of the book: collected characters bright, missed ones faint.
  Widget _bookLine() {
    final g = game;
    final end = g.resolvedMax + 1;
    final start = max(0, end - 46);
    final spans = <TextSpan>[];
    for (var i = start; i < end; i++) {
      final got = g.bookState[i] == 1 || widget.book[i] == ' ';
      spans.add(TextSpan(text: widget.book[i], style: TextStyle(color: got ? Colors.white : Colors.white30)));
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(color: const Color(0x991a1240), borderRadius: BorderRadius.circular(12)),
      child: Text.rich(TextSpan(children: spans),
          maxLines: 1, overflow: TextOverflow.clip, textAlign: TextAlign.right, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
    );
  }

  Widget _pauseOverlay() {
    return Container(
      color: const Color(0xaa000000),
      child: Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          _outlined('PAUSE', 44, Colors.white),
          const SizedBox(height: 20),
          _button('WEITER', () => setState(() => _paused = false)),
          const SizedBox(height: 10),
          _button('MENÜ', () => Navigator.of(context).pop(), dark: true),
        ]),
      ),
    );
  }

  Widget _gameOver() {
    final g = game;
    final total = widget.book.replaceAll(' ', '').length;
    return Container(
      color: const Color(0xbb000000),
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('💀', style: TextStyle(fontSize: 64)),
            _outlined('COOKED', 46, const Color(0xffff4d6d)),
            const SizedBox(height: 6),
            Text(g.deathReason, textAlign: TextAlign.center, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Colors.white70)),
            const SizedBox(height: 22),
            _stat('Aura', '${g.score.round()}', highlight: _newHigh),
            _stat('Zeichen gesammelt', '${g.letters} / $total'),
            _stat('Strecke', '${g.s.round()} m'),
            _stat('Highscore', '${widget.prefs.highscore}'),
            if (_newHigh) ...[const SizedBox(height: 8), _outlined('NEUER HIGHSCORE! 🗿', 20, const Color(0xff3ff2c8))],
            const SizedBox(height: 22),
            _button('NOCHMAL', _restart),
            const SizedBox(height: 10),
            _button('MENÜ', () => Navigator.of(context).pop(), dark: true),
          ]),
        ),
      ),
    );
  }

  Widget _stat(String k, String v, {bool highlight = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: SizedBox(
          width: 280,
          child: Row(children: [
            Text(k, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white70)),
            const Spacer(),
            Text(v, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: highlight ? const Color(0xff3ff2c8) : const Color(0xffffd23f))),
          ]),
        ),
      );

  Widget _button(String t, VoidCallback onTap, {bool dark = false}) => SizedBox(
        width: 240,
        height: 54,
        child: FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: dark ? const Color(0xff3a2585) : const Color(0xffffd23f),
            foregroundColor: dark ? Colors.white : const Color(0xff2a145f),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          ),
          onPressed: onTap,
          child: Text(t, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, letterSpacing: 1.5)),
        ),
      );

  Widget _outlined(String t, double size, Color color) => Stack(children: [
        Text(t,
            style: TextStyle(
                fontSize: size,
                fontWeight: FontWeight.w900,
                foreground: Paint()
                  ..style = PaintingStyle.stroke
                  ..strokeWidth = size * 0.18
                  ..strokeJoin = StrokeJoin.round
                  ..color = const Color(0xff2a145f))),
        Text(t, style: TextStyle(fontSize: size, fontWeight: FontWeight.w900, color: color)),
      ]);
}
