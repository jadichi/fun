import 'dart:io';

import 'package:brainrot_runner/game/engine.dart';
import 'package:flutter_test/flutter_test.dart';

final book = File('assets/book.txt').readAsStringSync();

/// A game with an empty track ahead, for hand-built scenarios.
Game emptyGame() {
  final g = Game(book: book, seed: 1);
  g.obstacles.clear();
  g.pickups.clear();
  g.rows.clear();
  g.genS = 1e9; // stop the generator
  return g;
}

void run(Game g, double seconds, {void Function(Game)? each}) {
  for (var t = 0.0; t < seconds && g.alive; t += 1 / 60) {
    each?.call(g);
    g.update(1 / 60);
  }
}

void main() {
  test('every generated level is passable: the autopilot survives 10 minutes', () {
    for (var seed = 0; seed < 6; seed++) {
      final g = Game(book: book, seed: seed)..autopilot = true;
      run(g, 600);
      expect(g.alive, isTrue, reason: 'seed $seed died at ${g.s.round()} m: ${g.deathReason}');
      expect(g.letters, greaterThan(1000), reason: 'seed $seed collected only ${g.letters} letters');
    }
  });

  test('standing still runs into something', () {
    final g = Game(book: book, seed: 3);
    run(g, 120);
    expect(g.alive, isFalse);
  });

  test('a jump clears a low barrier, running into it is fatal', () {
    var g = emptyGame();
    g.obstacles.add(Obstacle(ObKind.low, 0, g.s + 20, 0.4));
    run(g, 3);
    expect(g.alive, isFalse);

    g = emptyGame();
    final at = g.s + 20;
    g.obstacles.add(Obstacle(ObKind.low, 0, at, 0.4));
    run(g, 3, each: (g) {
      if (at - g.s < g.speed * 0.24 + 0.6) g.jump();
    });
    expect(g.alive, isTrue);
  });

  test('a slide passes under a high bar, a jump does not', () {
    var g = emptyGame();
    final at = g.s + 20;
    g.obstacles.add(Obstacle(ObKind.high, 0, at, 0.4));
    run(g, 3, each: (g) {
      if (at - g.s < 4) g.roll_();
    });
    expect(g.alive, isTrue);

    g = emptyGame();
    g.obstacles.add(Obstacle(ObKind.high, 0, at, 0.4));
    run(g, 3, each: (g) {
      if (at - g.s < 4) g.jump();
    });
    expect(g.alive, isFalse);
  });

  test('a ramp leads onto the train roof', () {
    final g = emptyGame();
    g.obstacles.add(Obstacle(ObKind.train, 0, g.s + 20, 25, ramp: true));
    var maxY = 0.0;
    run(g, 2.5, each: (g) => maxY = maxY > g.py ? maxY : g.py);
    expect(g.alive, isTrue);
    expect(maxY, closeTo(kTrainH, 0.01));
  });

  test('clipping a train from the side bounces back; twice and the father catches you', () {
    final g = emptyGame();
    g.obstacles.add(Obstacle(ObKind.train, 1, g.s - 5, 200));
    g.right();
    run(g, 0.5);
    expect(g.alive, isTrue);
    expect(g.lane, 0);
    expect(g.stumbleT, greaterThan(0));
    run(g, 1); // let the short grace run out
    g.right();
    run(g, 0.5);
    expect(g.alive, isFalse);
    expect(g.deathReason, contains('Apfel'));
  });

  test('beetle crawls through low barriers, moai smashes trains', () {
    var g = emptyGame();
    g.obstacles.add(Obstacle(ObKind.low, 0, g.s + 15, 0.4));
    g.applyMeme(Meme.beetle);
    run(g, 2);
    expect(g.alive, isTrue);

    g = emptyGame();
    final t = Obstacle(ObKind.train, 0, g.s + 15, 20);
    g.obstacles.add(t);
    g.applyMeme(Meme.moai);
    run(g, 2);
    expect(g.alive, isTrue);
    expect(t.dead, isTrue);
  });

  test('ohio mirrors the controls', () {
    final g = emptyGame();
    g.applyMeme(Meme.ohio);
    g.left();
    expect(g.lane, 1);
  });

  test('letters come from the book in order', () {
    final g = Game(book: book, seed: 2);
    final ls = g.pickups.where((p) => p.kind == PickKind.letter).toList()..sort((a, b) => a.s.compareTo(b.s));
    final text = ls.take(10).map((p) => p.glyph).join();
    expect(text, book.replaceAll(' ', '').substring(0, 10));
  });
}
