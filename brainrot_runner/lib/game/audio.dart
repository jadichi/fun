import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';

import 'engine.dart';

/// Low-latency sound effects; every Sfx maps to `assets/sfx/<name>.wav`.
class Sounds {
  final Map<Sfx, AudioPool> _pools = {};
  bool enabled = true;
  final Map<Sfx, int> _last = {};

  Future<void> load() async {
    for (final s in Sfx.values) {
      try {
        _pools[s] = await AudioPool.createFromAsset(path: 'sfx/${s.name}.wav', maxPlayers: s == Sfx.letter ? 6 : 3);
      } catch (e) {
        debugPrint('sound ${s.name} unavailable: $e');
      }
    }
  }

  void play(Sfx s) {
    if (!enabled) return;
    // letters can arrive many per frame: throttle per effect
    final now = DateTime.now().millisecondsSinceEpoch;
    if (now - (_last[s] ?? 0) < (s == Sfx.letter ? 45 : 60)) return;
    _last[s] = now;
    _pools[s]?.start(volume: s == Sfx.letter ? 0.5 : 0.9).then((_) {}, onError: (_) {});
  }

  void dispose() {
    for (final p in _pools.values) {
      p.dispose();
    }
  }
}
