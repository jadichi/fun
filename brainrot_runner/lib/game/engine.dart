// Pure-Dart game simulation: no Flutter imports, so it can be unit-tested and soak-tested headless.
import 'dart:math';
import 'dart:typed_data';

const double laneW = 2.6;
double laneX(int lane) => lane * laneW;
const double kGravity = -38;
const double kJumpV = 12.0; // apex ~1.9 m: clears low barriers, not high bars or trains
const double kSuperJumpV = 16.5; // apex ~3.6 m: lands on train roofs
const double kTrainH = 3.0;
const double kRampLen = 8.0;
const double kFlyY = 7.0;
const double kStandH = 1.8, kSlideH = 0.9, kBeetleH = 0.8;
const double kHalfW = 0.4; // player half width / half depth
const double kObHalfW = 1.15; // obstacle half width

enum ObKind { train, low, high }

class Obstacle {
  Obstacle(this.kind, this.lane, this.s0, this.len, {this.ramp = false, this.color = 0});
  final ObKind kind;
  final int lane;
  final double s0, len;
  final bool ramp;
  final int color;
  bool dead = false;
  double get s1 => s0 + len;
  double get x => laneX(lane);
  double get bottom => kind == ObKind.high ? 1.3 : 0;
  double get top => switch (kind) { ObKind.train => kTrainH, ObKind.low => 1.0, ObKind.high => 2.6 };
}

enum Power { jetpack, magnet, x2, sneakers }

enum Meme { beetle, moai, skull, sixSeven, sigma, ohio, skibidi, fire, aura, brain, rizz, money }

const Map<Power, String> powerGlyph = {Power.jetpack: '🚀', Power.magnet: '🧲', Power.x2: '⭐', Power.sneakers: '👟'};
const Map<Power, double> powerDuration = {Power.jetpack: 7, Power.magnet: 10, Power.x2: 10, Power.sneakers: 10};
const Map<Meme, String> memeGlyph = {
  Meme.beetle: '🪳', Meme.moai: '🗿', Meme.skull: '💀', Meme.sixSeven: '6 7', Meme.sigma: 'SIGMA', Meme.ohio: 'OHIO',
  Meme.skibidi: 'SKIBIDI', Meme.fire: '🔥', Meme.aura: 'AURA', Meme.brain: '🧠', Meme.rizz: 'RIZZ', Meme.money: '🤑',
};
const Map<Meme, double> memeDuration = {
  Meme.beetle: 6, Meme.moai: 6, Meme.skull: 0.6, Meme.sixSeven: 2.6, Meme.sigma: 5, Meme.ohio: 8,
  Meme.skibidi: 2, Meme.fire: 4, Meme.aura: 2.5, Meme.brain: 6, Meme.rizz: 8, Meme.money: 1.5,
};
/// What each meme does, shown in the HUD while it is active.
const Map<Meme, String> memeInfo = {
  Meme.beetle: 'Käfer: krabbelt unter allem durch', Meme.moai: 'Stein-Modus: zerlegt alles', Meme.skull: 'Weg damit!',
  Meme.sixSeven: '6 7 ×67', Meme.sigma: 'Sigma: riesig + unaufhaltbar', Meme.ohio: 'Ohio: Steuerung vertauscht, ×2',
  Meme.skibidi: 'Klopapier-Regen', Meme.fire: 'Feuer: ×3 + Turbo', Meme.aura: '+1000 Aura + Schild',
  Meme.brain: 'Big Brain: spielt für dich', Meme.rizz: 'Rizz-Magnet', Meme.money: 'Geldregen',
};

enum PickKind { letter, power, meme, bonus }

class Pickup {
  Pickup(this.kind, this.x, this.y, this.s, this.glyph, {this.power, this.meme, this.value = 0, this.book = -1});
  final PickKind kind;
  double x, y, s;
  final String glyph;
  final Power? power;
  final Meme? meme;
  final int value;
  final int book; // index into the book text for letters
  bool pulled = false;
}

class TrackRow {
  TrackRow(this.s0, this.len, this.choice, this.types, this.ramps);
  final double s0, len;
  final int choice; // lane that is guaranteed passable (the autopilot's line)
  final List<ObKind?> types;
  final List<bool> ramps;
  double get s1 => s0 + len;
}

class Building {
  Building(this.s0, this.len, this.x0, this.x1, this.h, this.color);
  final double s0, len, x0, x1, h;
  final int color;
}

class Cameo {
  Cameo(this.s, this.x, this.glyph, this.size);
  final double s, x, size;
  final String glyph;
}

class Particle {
  double x = 0, y = 0, s = 0, vx = 0, vy = 0, vs = 0, life = 0, max = 1, size = 0.2, g = 12;
  int color = 0xffffffff;
  String? emoji;
}

enum Sfx { letter, jump, slide, power, crash, boom, horn, hit, stumble, whoosh, tung }

class WorldTheme {
  const WorldTheme(this.skyTop, this.skyBottom, this.ground, this.bld, {this.ohio = false});
  final int skyTop, skyBottom, ground;
  final List<int> bld;
  final bool ohio;
}

const List<WorldTheme> themes = [
  WorldTheme(0xff3fb7ff, 0xffbff0ff, 0xff7ed957, [0xffff8fab, 0xffffd166, 0xff6ee7ff, 0xffb69cff, 0xff9be564]),
  WorldTheme(0xffff6cc4, 0xffffe1f3, 0xffffa8d9, [0xffffffff, 0xffc8b6ff, 0xff9ef0ff, 0xffffd6a5, 0xffff9ecf]), // pink (rizz)
  WorldTheme(0xffff5e4d, 0xffffd27a, 0xffe0a43d, [0xffff9f68, 0xffffd56b, 0xfff26b8a, 0xff8c6bff, 0xffffe3b3]),
  WorldTheme(0xff1d0f4f, 0xff6a35d8, 0xff2f2070, [0xff3b2a85, 0xff2c2070, 0xff4a3a9a, 0xff1c2f6e, 0xff412a74]),
  WorldTheme(0xff14c38e, 0xffd3ffe9, 0xff2fbf71, [0xffffe066, 0xff63e6be, 0xffff8787, 0xff74c0fc, 0xffffffff]),
  WorldTheme(0xffff9a00, 0xfffff1a8, 0xffffc94d, [0xffff6b6b, 0xff4ecdc4, 0xffffe66d, 0xffa06cd5, 0xffffffff]),
  WorldTheme(0xff1a0000, 0xff8b1a1a, 0xff2d3a1f, [0xff5a1d1d, 0xff2f3a1c, 0xff6a1818, 0xff3a123a, 0xff4d3b12], ohio: true),
];
const int kPinkTheme = 1, kOhioTheme = 6;

const List<int> trainColors = [0xffff4d6d, 0xffffb703, 0xff3a86ff, 0xff8338ec, 0xff06d6a0];
const List<int> confetti = [0xffff4fa3, 0xffffd23f, 0xff3ff2c8, 0xff3a86ff, 0xff8338ec, 0xffff7a3d];
const List<String> cameoGlyphs = ['🦈👟', '🐊✈️', '🪵🏏', '☕🩰', '🚽', '🗿', '🦍🍌', '🐸', '💀'];

class Game {
  Game({required this.book, int? seed}) : rnd = Random(seed) {
    reset();
  }

  final String book;
  final Random rnd;

  // book progress: 0 = not reached yet, 1 = collected, 2 = missed
  late Uint8List bookState;
  int bookPos = 0;
  int resolvedMax = -1;

  // player
  double s = 0, px = 0, py = 0, vy = 0, slideT = 0, time = 0, speed = 17, runPhase = 0;
  int lane = 0, prevLane = 0;
  bool onGround = true, rollOnLand = false, landing = false;
  bool alive = true;
  String deathReason = '';
  double score = 0;
  int letters = 0;
  double stumbleT = 0, graceT = 0;
  bool shield = false;
  final Map<Meme, double> fx = {};
  final Map<Power, double> powers = {};

  final List<Obstacle> obstacles = [];
  final List<Pickup> pickups = [];
  final List<TrackRow> rows = [];
  final List<Building> buildings = [];
  final List<Cameo> cameos = [];
  final List<Particle> particles = [];
  final List<Sfx> events = [];

  double genS = 0;
  int lastChoice = 0, rowsSincePower = 0, rowsSinceMeme = 0, lastMemeIdx = -1;
  final List<double> bldGen = [0, 0];
  double cameoGen = 0;

  int themeIdx = 0;
  double nextThemeAt = 700, nextMilestone = 500;

  // camera / feel
  double camX = 0, camY = 4.4, roll = 0, shake = 0, fovKick = 0, flashT = 0;
  int flashColor = 0xffffffff;

  bool autopilot = false; // testing aid; the 🧠 meme switches it on temporarily

  void reset() {
    bookState = Uint8List(book.length);
    bookPos = 0;
    resolvedMax = -1;
    s = 0; px = 0; py = 0; vy = 0; slideT = 0; time = 0; speed = 17; runPhase = 0;
    lane = 0; prevLane = 0; onGround = true; rollOnLand = false; landing = false;
    alive = true; deathReason = ''; score = 0; letters = 0; stumbleT = 0; graceT = 0; shield = false;
    fx.clear(); powers.clear();
    obstacles.clear(); pickups.clear(); rows.clear(); buildings.clear(); cameos.clear(); particles.clear(); events.clear();
    genS = 45; lastChoice = 0; rowsSincePower = 0; rowsSinceMeme = 1; lastMemeIdx = -1;
    bldGen[0] = -20; bldGen[1] = -20; cameoGen = 30;
    themeIdx = rnd.nextInt(themes.length - 1); // never start in Ohio
    nextThemeAt = 700; nextMilestone = 500;
    camX = 0; camY = 4.4; roll = 0; shake = 0; fovKick = 0; flashT = 0;
    _generate();
  }

  // ---------------------------------------------------------------- queries
  bool has(Meme m) => (fx[m] ?? 0) > 0;
  bool hasPower(Power p) => (powers[p] ?? 0) > 0;
  bool get flying => hasPower(Power.jetpack) || landing;
  bool get beetle => has(Meme.beetle);
  bool get smash => has(Meme.moai) || has(Meme.sigma) || has(Meme.fire);
  bool get brain => autopilot || has(Meme.brain);
  bool get sliding => slideT > 0 && onGround;
  double get playerH => beetle ? kBeetleH : sliding ? kSlideH : kStandH;
  int get mult => (hasPower(Power.x2) ? 2 : 1) * (has(Meme.ohio) ? 2 : 1) * (has(Meme.fire) ? 3 : 1);
  int get themeNow => has(Meme.ohio) ? kOhioTheme : has(Meme.rizz) ? kPinkTheme : themeIdx;

  /// Lane the generator keeps passable at distance [at].
  int pathLaneAt(double at) {
    for (final r in rows) {
      if (r.s1 >= at) return r.choice;
    }
    return lastChoice;
  }

  /// Walkable surface height under a body of half width [hw] centred at x, at distance [at].
  double groundAt(double x, double at, {double hw = kHalfW}) {
    double g = 0;
    for (final o in obstacles) {
      if (o.kind != ObKind.train || o.dead) continue;
      if (x + hw <= o.x - kObHalfW || x - hw >= o.x + kObHalfW) continue;
      if (o.ramp && at >= o.s0 - kRampLen && at < o.s0) {
        g = max(g, kTrainH * (at - (o.s0 - kRampLen)) / kRampLen);
      } else if (at >= o.s0 && at <= o.s1) {
        g = max(g, kTrainH);
      }
    }
    return g;
  }

  // ---------------------------------------------------------------- input
  void left() => _steer(has(Meme.ohio) ? 1 : -1);
  void right() => _steer(has(Meme.ohio) ? -1 : 1);

  void _steer(int d) {
    if (!alive || brain) return;
    _setLane(lane + d);
  }

  void _setLane(int l) {
    final nl = l.clamp(-1, 1);
    if (nl == lane) return;
    prevLane = lane;
    lane = nl;
    events.add(Sfx.whoosh);
  }

  void jump() {
    if (!alive || brain || flying) return;
    _jump();
  }

  void _jump() {
    if (!onGround) return;
    vy = hasPower(Power.sneakers) ? kSuperJumpV : kJumpV;
    onGround = false;
    slideT = 0;
    events.add(Sfx.jump);
  }

  void roll_() {
    if (!alive || brain || flying) return;
    _roll();
  }

  void _roll() {
    if (onGround) {
      slideT = 0.75;
      events.add(Sfx.slide);
    } else {
      vy = min(vy, -30);
      rollOnLand = true;
    }
  }

  // ---------------------------------------------------------------- simulation
  void update(double dt) {
    if (!alive) {
      _updateParticles(dt);
      return;
    }
    dt = min(dt, 1 / 20);
    // sub-steps keep the 0.4 m barriers from being tunnelled through at top speed
    final steps = max(1, (dt * speed / 0.25).ceil());
    final h = dt / steps;
    for (var i = 0; i < steps && alive; i++) {
      _step(h);
    }
    _updateParticles(dt);
    // camera follows loosely; higher when on roofs / flying, further up when giant
    final k = min(1.0, dt * 5);
    camX += (px * 0.75 - camX) * k;
    camY += (4.4 + py * 0.8 + (has(Meme.sigma) ? 2 : 0) - camY) * k;
  }

  void _step(double dt) {
    time += dt;
    final base = min(40.0, 17 + time * 0.16);
    speed = base * (has(Meme.fire) ? 1.4 : 1);
    final prevS = s, prevX = px;
    s += speed * dt;
    runPhase += speed * dt * 0.55;
    score += speed * dt * 0.5 * mult;

    for (final k in fx.keys.toList()) {
      fx[k] = fx[k]! - dt;
      if (fx[k]! <= 0) fx.remove(k);
    }
    for (final k in powers.keys.toList()) {
      powers[k] = powers[k]! - dt;
      if (powers[k]! <= 0) {
        powers.remove(k);
        if (k == Power.jetpack) landing = true;
      }
    }
    stumbleT = max(0, stumbleT - dt);
    graceT = max(0, graceT - dt);
    slideT = max(0, slideT - dt);
    flashT = max(0, flashT - dt * 1.6);
    shake = max(0, shake - dt * 3);
    fovKick = max(0, fovKick - dt * 12);
    roll = max(0, roll - dt / 1.2);

    if (brain) _autopilot();

    // lateral movement
    final tx = laneX(lane);
    final step = 15 * dt;
    px += (tx - px).abs() <= step ? tx - px : (tx - px).sign * step;

    // vertical movement
    if (hasPower(Power.jetpack)) {
      py += (kFlyY - py) * min(1, dt * 3.5);
      vy = 0;
      onGround = false;
      if (rnd.nextDouble() < 0.6) _burst(px, py + 0.4, s - 0.4, const [0xffffb703, 0xffff4d6d, 0xffffffff], 2, 0.8, -2, 0.4, g: 0);
    } else {
      final g = groundAt(px, s);
      if (onGround) {
        if (g > py && g - py < 0.7) {
          py = g; // walking up a ramp
        } else if (g < py - 0.05) {
          onGround = false;
          vy = 0;
        }
      }
      if (!onGround) {
        vy += kGravity * dt * (landing ? 0.6 : 1);
        py += vy * dt;
        if (py <= g && vy <= 0) {
          py = g;
          vy = 0;
          onGround = true;
          if (landing) {
            landing = false;
            graceT = max(graceT, 1.2);
            _shock();
          }
          if (rollOnLand) {
            rollOnLand = false;
            slideT = 0.75;
            events.add(Sfx.slide);
          }
          _burst(px, py + 0.2, s, const [0xffffffff, 0xffffd23f], 8, 3, 2, 0.35);
        }
      }
    }

    _collide(prevS, prevX);
    if (!alive) return;
    _collect();

    if (s >= nextMilestone) {
      nextMilestone += 500;
      _emojiBurst(const ['💯', '🔥', '🗿', '💀', '😭'], 16, px, py + 3, s + 3, 8);
      events.add(Sfx.boom);
      flash(0xffff2860);
      fovKick = 8;
    }
    if (s >= nextThemeAt) {
      nextThemeAt += 700;
      var n = themeIdx;
      while (n == themeIdx || themes[n].ohio) {
        n = rnd.nextInt(themes.length);
      }
      themeIdx = n;
    }

    _generate();
    _cull();
  }

  void _autopilot() {
    if (flying) {
      _setLane(pathLaneAt(s + 30));
      return;
    }
    TrackRow? cur;
    for (final r in rows) {
      if (r.s1 > s - 0.5) {
        cur = r;
        break;
      }
    }
    if (cur == null) return;
    _setLane(cur.choice);
    if ((px - laneX(cur.choice)).abs() > 0.3) return;
    final t = cur.types[cur.choice + 1];
    final dist = cur.s0 - s;
    if (t == ObKind.low && !beetle && dist > 0 && dist <= speed * 0.24 + 0.6) _jump();
    if (t == ObKind.high && !beetle && dist > -0.3 && dist <= speed * 0.2 + 0.6) {
      if (onGround) {
        if (slideT < 0.3) _roll();
      } else {
        _roll();
      }
    }
  }

  void _collide(double prevS, double prevX) {
    final h = playerH;
    for (final o in obstacles) {
      if (o.dead) continue;
      if (o.s0 > s + kHalfW || o.s1 < s - kHalfW) continue;
      if (px + kHalfW <= o.x - kObHalfW || px - kHalfW >= o.x + kObHalfW) continue;
      switch (o.kind) {
        case ObKind.train:
          if (py >= kTrainH - 0.45) continue; // standing on the roof
        case ObKind.low:
          if (py >= o.top - 0.1 || beetle) continue;
        case ObKind.high:
          if (py + h <= o.bottom + 0.05 || py >= o.top) continue;
      }
      // hit something
      if (smash) {
        _destroy(o, 50);
        continue;
      }
      final wasInS = prevS + kHalfW > o.s0 && prevS - kHalfW < o.s1;
      if (o.kind == ObKind.train && wasInS) {
        // clipped a train while changing lanes: bounce back (always) and stumble (unless protected)
        lane = prevLane;
        px = prevX;
        if (graceT <= 0 && !landing) _stumble();
        return;
      }
      if (graceT > 0 || landing) continue;
      if (shield) {
        shield = false;
        _destroy(o, 0);
        events.add(Sfx.hit);
        graceT = 0.6;
        continue;
      }
      _die(switch (o.kind) {
        ObKind.train => 'Frontal in den Zug. Gregor ist cooked.',
        ObKind.low => 'Über die Schranke musst du springen ⬆️',
        ObKind.high => 'Unter dem Balken musst du rutschen ⬇️',
      });
      return;
    }
  }

  void _stumble() {
    events.add(Sfx.stumble);
    shake = max(shake, 1);
    if (stumbleT > 0 && graceT <= 0) {
      _die('Der Vater hat dich mit einem Apfel erwischt 🍎');
      return;
    }
    stumbleT = 7; // the father chases you for a while; stumble again and he catches you
    graceT = 0.8;
  }

  void _die(String why) {
    alive = false;
    deathReason = why;
    events.add(Sfx.crash);
    shake = 1.5;
    flash(0xffff0030);
    _burst(px, py + 1, s, confetti, 40, 8, 6, 1);
  }

  void _destroy(Obstacle o, int bonus) {
    o.dead = true;
    score += bonus * mult;
    events.add(Sfx.hit);
    shake = max(shake, 0.6);
    final cy = o.kind == ObKind.high ? 2 : 1;
    _burst(o.x, cy.toDouble(), max(o.s0, s + 1), [o.color == 0 ? 0xffffffff : o.color, 0xffffd23f, 0xffff4d6d], 26, 7, 7, 0.8);
  }

  void _collect() {
    final h = playerH;
    final magnet = hasPower(Power.magnet) || has(Meme.rizz);
    final cy = py + h * 0.55;
    for (var i = pickups.length - 1; i >= 0; i--) {
      final p = pickups[i];
      final ds = p.s - s;
      if (ds < -3) {
        if (p.kind == PickKind.letter) _resolve(p.book, 2);
        pickups.removeAt(i);
        continue;
      }
      if (ds > 40) continue;
      if ((magnet && p.kind != PickKind.meme && p.kind != PickKind.power && ds < 16) || p.pulled) {
        p.pulled = true;
        const k = 0.25;
        p.x += (px - p.x) * k;
        p.y += (cy - p.y) * k;
        p.s += (s - p.s) * k;
      }
      if ((p.s - s).abs() < 1.0 && (p.x - px).abs() < 1.25 && p.y > py - 0.7 && p.y < py + h + 0.9) {
        pickups.removeAt(i);
        _take(p);
      }
    }
  }

  void _take(Pickup p) {
    switch (p.kind) {
      case PickKind.letter:
        letters++;
        _resolve(p.book, 1);
        score += 10 * mult;
        events.add(Sfx.letter);
        if (letters % 100 == 0) {
          _shock();
          fovKick = max(fovKick, 6);
        }
      case PickKind.bonus:
        score += p.value * mult;
        events.add(Sfx.letter);
        _burst(p.x, p.y, p.s, const [0xffffd23f, 0xffffffff], 6, 3, 3, 0.4);
      case PickKind.power:
        final pw = p.power!;
        powers[pw] = powerDuration[pw]!;
        events.add(Sfx.power);
        fovKick = 10;
        _shock();
        _burst(px, py + 1.2, s, confetti, 30, 7, 7, 0.9);
        if (pw == Power.jetpack) {
          slideT = 0;
          landing = false;
          _liftLettersToSky();
        }
      case PickKind.meme:
        events.add(Sfx.hit);
        fovKick = 10;
        shake = max(shake, 0.6);
        _burst(px, py + 1.2, s, confetti, 36, 8, 7, 0.9);
        applyMeme(p.meme!);
    }
  }

  void _resolve(int idx, int state) {
    if (idx < 0 || idx >= bookState.length) return;
    bookState[idx] = state;
    if (idx > resolvedMax) resolvedMax = idx;
  }

  /// Letters waiting ahead on the ground move up into the sky trail while the jetpack runs.
  void _liftLettersToSky() {
    final end = s + speed * powerDuration[Power.jetpack]! - 12;
    var l = lane, n = 0;
    final ls = pickups.where((p) => p.kind == PickKind.letter && p.s > s + 14 && p.s < end).toList()
      ..sort((a, b) => a.s.compareTo(b.s));
    for (final p in ls) {
      if (++n % 9 == 0) l = (l + (rnd.nextBool() ? 1 : -1)).clamp(-1, 1);
      p.x = laneX(l);
      p.y = kFlyY + 0.9;
    }
  }

  // ---------------------------------------------------------------- memes
  void applyMeme(Meme m) {
    final d = memeDuration[m]!;
    fx[m] = d;
    switch (m) {
      case Meme.beetle:
        events.add(Sfx.boom);
        _emojiBurst(const ['🪳', '🐛'], 12, px, py + 1.5, s + 1, 7);
      case Meme.moai:
        events.add(Sfx.boom);
        cameos.add(Cameo(s + 34, -7.5, '🗿', 9));
        cameos.add(Cameo(s + 34, 7.5, '🗿', 9));
        shake = 1.3;
        flash(0xff787882);
      case Meme.skull:
        events.add(Sfx.boom);
        flash(0xffff0028);
        _emojiBurst(const ['💀', '💀', '😭', '☠️'], 26, px, py + 1.5, s + 1, 10);
        for (final o in obstacles) {
          if (!o.dead && o.s1 > s && o.s0 < s + 70) _destroy(o, 20);
        }
      case Meme.sixSeven:
        events.add(Sfx.horn);
        score += 67 * 10 * mult;
        _emojiBurst(const ['🤲', '😂', '6️⃣', '7️⃣'], 16, px, py + 2, s + 1, 7);
      case Meme.sigma:
        events.add(Sfx.horn);
        _shock();
      case Meme.ohio:
        events.add(Sfx.boom);
        roll = 1;
        flash(0xff8b0000);
        _emojiBurst(const ['💀', '🥶', '🌽'], 14, px, py + 2, s + 2, 8);
      case Meme.skibidi:
        events.add(Sfx.horn);
        _rainBonus('🧻', 18, 25);
        for (var i = 0; i < 6; i++) {
          final p = Particle()
            ..emoji = '🚽'
            ..x = (rnd.nextBool() ? 1 : -1) * (5 + rnd.nextDouble() * 3)
            ..y = 18 + rnd.nextDouble() * 8
            ..s = s + 12 + rnd.nextDouble() * 30
            ..vy = -4
            ..g = 22
            ..size = 2.4
            ..life = 2.2
            ..max = 2.2;
          particles.add(p);
        }
      case Meme.fire:
        events.add(Sfx.whoosh);
        _emojiBurst(const ['🔥'], 14, px, py + 1.5, s + 1, 8);
      case Meme.aura:
        events.add(Sfx.power);
        score += 1000 * mult;
        shield = true;
        flash(0xffb14dff);
        _shock();
      case Meme.brain:
        events.add(Sfx.power);
        _emojiBurst(const ['🧠'], 12, px, py + 2.5, s + 1, 7);
      case Meme.rizz:
        events.add(Sfx.power);
        flash(0xffff2d95);
        _emojiBurst(const ['💖', '😍', '💘', '🌹'], 22, px, py + 1.5, s + 1, 8);
      case Meme.money:
        events.add(Sfx.power);
        _emojiBurst(const ['🤑', '💸', '💰'], 18, px, py + 1.5, s + 1, 8);
        _rainBonus('💸', 26, 20);
    }
  }

  /// Bonus collectibles along the safe line ahead.
  void _rainBonus(String glyph, int n, int value) {
    for (var i = 0; i < n; i++) {
      final at = s + 12 + i * 2.6;
      final l = pathLaneAt(at);
      final x = laneX(l);
      pickups.add(Pickup(PickKind.bonus, x, groundAt(x, at) + 1.1, at, glyph, value: value));
    }
  }

  void flash(int color) {
    flashT = 1;
    flashColor = color;
  }

  void _shock() {
    _burst(px, py + 0.3, s, confetti, 24, 9, 1.5, 0.5, g: 2);
  }

  // ---------------------------------------------------------------- particles
  void _burst(double x, double y, double at, List<int> colors, int n, double spread, double up, double life,
      {double g = 12}) {
    for (var i = 0; i < n; i++) {
      if (particles.length > 500) particles.removeAt(0);
      particles.add(Particle()
        ..x = x
        ..y = y
        ..s = at
        ..vx = (rnd.nextDouble() - 0.5) * spread
        ..vy = rnd.nextDouble() * up
        ..vs = (rnd.nextDouble() - 0.5) * spread
        ..color = colors[i % colors.length]
        ..life = life * (0.6 + rnd.nextDouble() * 0.6)
        ..max = life
        ..g = g
        ..size = 0.12 + rnd.nextDouble() * 0.12);
    }
  }

  void _emojiBurst(List<String> list, int n, double x, double y, double at, double sp) {
    for (var i = 0; i < n; i++) {
      if (particles.length > 500) particles.removeAt(0);
      particles.add(Particle()
        ..emoji = list[i % list.length]
        ..x = x
        ..y = y
        ..s = at
        ..vx = (rnd.nextDouble() - 0.5) * sp
        ..vy = 3 + rnd.nextDouble() * sp * 0.8
        ..vs = (0.3 + rnd.nextDouble()) * sp * 0.7 // always away from the camera
        ..g = 9
        ..size = 0.7 + rnd.nextDouble() * 0.6
        ..life = 1.3 + rnd.nextDouble() * 0.6
        ..max = 1.9);
    }
  }

  void _updateParticles(double dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      final p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.removeAt(i);
        continue;
      }
      p.vy -= p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.s += p.vs * dt;
      if (p.emoji == '🚽' && p.y < 0) {
        p.y = 0;
        p.vy = 0;
        p.g = 0;
      }
    }
  }

  // ---------------------------------------------------------------- level generation
  void _generate() {
    while (genS < s + 190) {
      _row();
    }
    for (var side = 0; side < 2; side++) {
      while (bldGen[side] < s + 220) {
        final len = 8 + rnd.nextDouble() * 9, w = 5 + rnd.nextDouble() * 4, h = 6 + rnd.nextDouble() * 20;
        final inner = 9 + rnd.nextDouble() * 2.5;
        final th = themes[themeIdx];
        final c = th.bld[rnd.nextInt(th.bld.length)];
        buildings.add(side == 0
            ? Building(bldGen[side], len, -inner - w, -inner, h, c)
            : Building(bldGen[side], len, inner, inner + w, h, c));
        bldGen[side] += len + 1 + rnd.nextDouble() * 4;
      }
    }
    while (cameoGen < s + 200) {
      cameos.add(Cameo(cameoGen, (rnd.nextBool() ? 1 : -1) * 6.2, cameoGlyphs[rnd.nextInt(cameoGlyphs.length)], 2.4));
      cameoGen += 45 + rnd.nextDouble() * 50;
    }
  }

  void _row() {
    final r = rnd.nextDouble();
    final nTrains = r < 0.35 ? 2 : r < 0.75 ? 1 : 0;
    final types = List<ObKind?>.filled(3, null);
    final ramps = List<bool>.filled(3, false);
    final idx = [0, 1, 2]..shuffle(rnd);
    for (var i = 0; i < nTrains; i++) {
      types[idx[i]] = ObKind.train;
      ramps[idx[i]] = rnd.nextDouble() < 0.35;
    }
    for (var i = 0; i < 3; i++) {
      if (types[i] == null) {
        final q = rnd.nextDouble();
        types[i] = q < 0.36 ? ObKind.low : q < 0.7 ? ObKind.high : null;
      }
    }
    // the guaranteed line: any lane except a train without a ramp (a third lane is never a train)
    var best = -1;
    var bestScore = 1e9;
    for (var i = 0; i < 3; i++) {
      if (types[i] == ObKind.train && !ramps[i]) continue;
      final sc = (i - 1 - lastChoice).abs() * 0.4 + (types[i] == null ? 0.7 : 0) + rnd.nextDouble() * 1.2;
      if (sc < bestScore) {
        bestScore = sc;
        best = i;
      }
    }
    final choice = best - 1;
    final len = nTrains > 0 ? 14 + rnd.nextDouble() * 14 : 0.4;
    final s0 = genS;
    final prevEnd = rows.isEmpty ? 3.0 : rows.last.s1; // first row: letters start right away
    final row = TrackRow(s0, len, choice, types, ramps);
    rows.add(row);
    for (var i = 0; i < 3; i++) {
      final t = types[i];
      if (t == null) continue;
      final l = i - 1;
      if (t == ObKind.train) {
        obstacles.add(Obstacle(ObKind.train, l, s0, len, ramp: ramps[i], color: trainColors[rnd.nextInt(trainColors.length)]));
      } else {
        obstacles.add(Obstacle(t, l, s0, 0.4));
      }
    }

    // letter trail along the guaranteed line: first half of the gap in the old lane, then the new one
    final mid = (prevEnd + s0) / 2;
    _trail(prevEnd + 5, mid, lastChoice);
    _trail(mid, s0 + len, choice, row: row);

    // power-ups and memes sit on the line in the gap before the row
    rowsSincePower++;
    rowsSinceMeme++;
    final gapLen = s0 - prevEnd;
    if (gapLen > 18 && rowsSincePower >= 6 && rnd.nextDouble() < 0.45) {
      rowsSincePower = 0;
      final pw = Power.values[rnd.nextInt(Power.values.length)];
      final at = mid - 4;
      pickups.add(Pickup(PickKind.power, laneX(lastChoice), 1.3, at, powerGlyph[pw]!, power: pw));
    } else if (gapLen > 18 && rowsSinceMeme >= 3 && rnd.nextDouble() < 0.55) {
      rowsSinceMeme = 0;
      var mi = rnd.nextInt(Meme.values.length);
      if (mi == lastMemeIdx) mi = (mi + 1) % Meme.values.length;
      lastMemeIdx = mi;
      final m = Meme.values[mi];
      final at = mid + 4;
      pickups.add(Pickup(PickKind.meme, laneX(choice), 1.4, at, memeGlyph[m]!, meme: m));
    }

    lastChoice = choice;
    // spacing grows with speed so lane changes always fit; ramps need their own run-up
    genS = s0 + len + max(22.0, speed * 1.15) + kRampLen + rnd.nextDouble() * 10;
  }

  /// Book characters along lane [l] from [a] to [b] (spaces leave a gap), following ramps, roofs and jumps.
  void _trail(double a, double b, int l, {TrackRow? row}) {
    const spacing = 2.0;
    final x = laneX(l);
    for (var at = a; at < b; at += spacing) {
      if (bookPos >= book.length) bookPos = 0; // the book loops
      final c = book[bookPos];
      final idx = bookPos++;
      if (c == ' ') continue;
      var y = 1.0;
      if (row != null) {
        final t = row.types[l + 1];
        final d = at - row.s0;
        if (t == ObKind.train && row.ramps[l + 1]) {
          if (d >= -kRampLen && d < 0) {
            y += kTrainH * (d + kRampLen) / kRampLen;
          } else if (d >= 0) {
            y += kTrainH;
          }
        } else if (t == ObKind.low) {
          final k = d / 5.5;
          if (k.abs() < 1) y += 1.4 * (1 - k * k);
        } else if (t == ObKind.high && d.abs() < 3) {
          y = 0.5;
        }
      }
      pickups.add(Pickup(PickKind.letter, x, y, at, c, book: idx));
    }
  }

  void _cull() {
    obstacles.removeWhere((o) => o.s1 < s - 12);
    rows.removeWhere((r) => r.s1 < s - 12);
    buildings.removeWhere((b) => b.s0 + b.len < s - 12);
    cameos.removeWhere((c) => c.s < s - 12);
  }
}
