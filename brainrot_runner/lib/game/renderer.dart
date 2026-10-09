// Pseudo-3D renderer: projects the engine's boxes and billboards onto a Canvas (painter's algorithm).
import 'dart:math';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'engine.dart';

const double _camBack = 7.5; // camera distance behind the runner
const double _pitch = 0.2; // camera looks slightly down
const double _near = 0.8;

class GamePainter extends CustomPainter {
  GamePainter(this.g, Listenable repaint) : super(repaint: repaint);
  final Game g;

  late double _w, _h, _f, _cx, _cy, _camZ, _cosP, _sinP;
  late Color _fog;
  final Paint _p = Paint()..isAntiAlias = true;

  // ---------------------------------------------------------------- projection
  double _depth(double y, double z) => (z - _camZ) * _cosP - (y - g.camY) * _sinP;

  Offset? _proj(double x, double y, double z) {
    final ry = y - g.camY, rz = z - _camZ;
    final d = rz * _cosP - ry * _sinP;
    if (d < _near) return null;
    final v = ry * _cosP + rz * _sinP;
    return Offset(_cx + (x - g.camX) * _f / d, _cy - v * _f / d);
  }

  double _scaleAt(double y, double z) {
    final d = _depth(y, z);
    return d < _near ? 0 : _f / d;
  }

  Color _fogged(int c, double z) {
    final t = ((z - g.s - 55) / 130).clamp(0.0, 1.0);
    return Color.lerp(Color(c), _fog, t)!;
  }

  void _quad(Canvas c, List<Offset?> pts, Color col) {
    if (pts.any((p) => p == null)) return;
    final path = Path()..moveTo(pts[0]!.dx, pts[0]!.dy);
    for (var i = 1; i < pts.length; i++) {
      path.lineTo(pts[i]!.dx, pts[i]!.dy);
    }
    path.close();
    _p
      ..color = col
      ..style = PaintingStyle.fill;
    c.drawPath(path, _p);
  }

  static Color _shade(int c, double k) {
    final col = Color(c);
    int f(double v) => (v * 255 * k).round().clamp(0, 255);
    return Color.fromARGB(255, f(col.r), f(col.g), f(col.b));
  }

  /// Axis-aligned box. Faces facing the camera are drawn back to front. Returns the front face rect if visible.
  Rect? _box(Canvas c, double x0, double x1, double y0, double y1, double z0, double z1, int color,
      {int? top, int? front, double sideK = 0.78}) {
    final zn = _camZ + _near + 0.2;
    if (z1 <= zn) return null;
    final clipped = z0 < zn;
    final za = max(z0, zn);
    final topC = _fogged(top ?? _shade(color, 1.12).toARGB32(), za);
    final sideC = _fogged(_shade(color, sideK).toARGB32(), za);
    final frontC = _fogged(front ?? color, za);
    if (g.camY > y1) {
      _quad(c, [_proj(x0, y1, za), _proj(x1, y1, za), _proj(x1, y1, z1), _proj(x0, y1, z1)], topC);
    }
    if (g.camX < x0) {
      _quad(c, [_proj(x0, y0, za), _proj(x0, y1, za), _proj(x0, y1, z1), _proj(x0, y0, z1)], sideC);
    }
    if (g.camX > x1) {
      _quad(c, [_proj(x1, y0, za), _proj(x1, y1, za), _proj(x1, y1, z1), _proj(x1, y0, z1)], sideC);
    }
    if (clipped) return null;
    final a = _proj(x0, y1, z0), b = _proj(x1, y0, z0);
    if (a == null || b == null) return null;
    final r = Rect.fromPoints(a, b);
    _p.color = frontC;
    c.drawRect(r, _p);
    return r;
  }

  // ---------------------------------------------------------------- text / emoji billboards
  static final Map<String, TextPainter> _tp = {};

  TextPainter _text(String t, {bool stroke = false, int color = 0xffffd23f}) {
    final key = '$t|$stroke|$color';
    return _tp.putIfAbsent(key, () {
      final style = stroke
          ? TextStyle(
              fontSize: 100,
              fontWeight: FontWeight.w900,
              foreground: Paint()
                ..style = PaintingStyle.stroke
                ..strokeWidth = 18
                ..strokeJoin = StrokeJoin.round
                ..color = const Color(0xff2a145f))
          : TextStyle(fontSize: 100, fontWeight: FontWeight.w900, color: Color(color));
      return TextPainter(text: TextSpan(text: t, style: style), textDirection: TextDirection.ltr)..layout();
    });
  }

  /// Draws text centred at a screen point with a pixel height of [px].
  void _drawText(Canvas c, String t, Offset at, double px,
      {bool outline = true, int color = 0xffffd23f, double depth = 0, double opacity = 1}) {
    if (px < 2) return;
    final fill = _text(t, color: color);
    final k = px / fill.height;
    c.save();
    c.translate(at.dx, at.dy);
    c.scale(k);
    final o = Offset(-fill.width / 2, -fill.height / 2);
    if (opacity < 1) c.saveLayer(null, Paint()..color = Color.fromRGBO(0, 0, 0, opacity));
    if (depth > 0) {
      // fake extrusion: dark copies stacked down-right
      final dark = _text(t, color: 0xff3a1f6b);
      final n = 6;
      for (var i = n; i >= 1; i--) {
        dark.paint(c, o + Offset(i * depth / n, i * depth / n));
      }
    }
    if (outline) _text(t, stroke: true).paint(c, o);
    fill.paint(c, o);
    if (opacity < 1) c.restore();
    c.restore();
  }

  // ---------------------------------------------------------------- paint
  @override
  void paint(Canvas canvas, Size size) {
    _w = size.width;
    _h = size.height;
    _f = _h * 0.95 / (1 + g.fovKick * 0.02);
    _cx = _w / 2;
    _cy = _h * 0.4;
    _camZ = g.s - _camBack;
    _cosP = cos(_pitch);
    _sinP = sin(_pitch);
    final th = themes[g.themeNow];
    _fog = Color(th.skyBottom);

    canvas.save();
    final rnd = Random((g.time * 60).floor());
    if (g.shake > 0) canvas.translate((rnd.nextDouble() - 0.5) * g.shake * 14, (rnd.nextDouble() - 0.5) * g.shake * 14);
    final rollA = g.roll > 0 ? (1 - g.roll) * (1 - g.roll) * (3 - 2 * (1 - g.roll)) * 2 * pi : 0.0;
    final tilt = (g.px - laneX(g.lane)) * 0.015 + rollA;
    if (tilt != 0) {
      canvas.translate(_cx, _h / 2);
      canvas.rotate(tilt);
      canvas.translate(-_cx, -_h / 2);
    }
    // oversize the sky so the corners stay filled while the camera tilts or rolls
    final big = Rect.fromCenter(center: Offset(_cx, _h / 2), width: _h * 1.6, height: _h * 1.6);
    _p.shader = ui.Gradient.linear(Offset(0, big.top), Offset(0, _cy + _h * 0.05), [Color(th.skyTop), Color(th.skyBottom)]);
    canvas.drawRect(big, _p);
    _p.shader = null;
    _clouds(canvas);

    _ground(canvas, th, big);
    _drawWorld(canvas);
    canvas.restore();

    _speedLines(canvas);
    if (g.flashT > 0) {
      final col = Color(g.flashColor);
      _p.shader = ui.Gradient.radial(Offset(_cx, _h / 2), _h * 0.75,
          [col.withValues(alpha: 0), col.withValues(alpha: 0.55 * g.flashT)], [0.35, 1]);
      canvas.drawRect(Offset.zero & size, _p);
      _p.shader = null;
    }
    if (g.stumbleT > 0) {
      // red vignette while the father is chasing
      final a = 0.25 + 0.15 * sin(g.time * 10);
      _p.shader = ui.Gradient.radial(Offset(_cx, _h / 2), _h * 0.7,
          [const Color(0x00ff0000), Color.fromRGBO(255, 0, 0, a)], [0.5, 1]);
      canvas.drawRect(Offset.zero & size, _p);
      _p.shader = null;
    }
  }

  void _clouds(Canvas c) {
    _p.color = const Color(0xccffffff);
    for (var i = 0; i < 6; i++) {
      final x = ((i * 0.37 + 0.13 - g.s * 0.0004 * (1 + i % 3)) % 1.3 - 0.15) * _w;
      final y = _h * (0.06 + (i * 0.11) % 0.22);
      final r = _w * (0.06 + (i % 3) * 0.025);
      for (var k = 0; k < 3; k++) {
        c.drawCircle(Offset(x + k * r * 0.9, y + (k == 1 ? -r * 0.35 : 0)), r * (k == 1 ? 1.1 : 0.8), _p);
      }
    }
  }

  void _ground(Canvas c, WorldTheme th, Rect big) {
    final zn = _camZ + _near + 0.2, zf = g.s + 210;
    final ground = Color(th.ground);
    // ground plane as bands so it fades into the fog
    for (var i = 0; i < 6; i++) {
      final a = zn + (zf - zn) * pow(i / 6, 1.6), b = zn + (zf - zn) * pow((i + 1) / 6, 1.6);
      _quad(c, [_proj(-60, 0, a), _proj(60, 0, a), _proj(60, 0, b), _proj(-60, 0, b)], _fogged(ground.toARGB32(), a));
    }
    for (final l in [-1, 0, 1]) {
      final x = laneX(l);
      _quad(c, [_proj(x - 1.25, 0.01, zn), _proj(x + 1.25, 0.01, zn), _proj(x + 1.25, 0.01, zf), _proj(x - 1.25, 0.01, zf)],
          _fogged(0xffb7a99a, zn));
    }
    // sleepers
    const tie = 2.4;
    final first = (zn / tie).ceil() * tie;
    for (var z = first; z < g.s + 120; z += tie) {
      final col = _fogged(0xff8a5a3c, z);
      for (final l in [-1, 0, 1]) {
        final x = laneX(l);
        _quad(c, [_proj(x - 0.95, 0.02, z), _proj(x + 0.95, 0.02, z), _proj(x + 0.95, 0.02, z + 0.35), _proj(x - 0.95, 0.02, z + 0.35)], col);
      }
    }
    // rails, colour-cycling like the original
    final railCol = HSVColor.fromAHSV(1, (g.time * 40) % 360, 0.5, 1).toColor();
    for (final l in [-1, 0, 1]) {
      for (final o in [-0.62, 0.62]) {
        final x = laneX(l) + o;
        _quad(c, [_proj(x - 0.07, 0.06, zn), _proj(x + 0.07, 0.06, zn), _proj(x + 0.07, 0.06, zf), _proj(x - 0.07, 0.06, zf)], railCol);
      }
    }
  }

  void _drawWorld(Canvas c) {
    final items = <(double, void Function())>[];
    for (final b in g.buildings) {
      if (b.s0 > g.s + 220) continue;
      items.add((b.s0, () => _building(c, b)));
    }
    for (final o in g.obstacles) {
      if (o.dead || o.s0 - kRampLen > g.s + 200) continue;
      if (o.kind != ObKind.train && o.s1 < g.s - 0.5) continue; // passed barriers would fill the screen
      items.add((o.s0, () => _obstacle(c, o)));
    }
    for (final cm in g.cameos) {
      if (cm.s > g.s + 200) continue;
      items.add((cm.s, () => _billboard(c, cm.glyph, cm.x, cm.size / 2, cm.s, cm.size, outline: false)));
    }
    for (final p in g.pickups) {
      if (p.s > g.s + 120) continue;
      items.add((p.s, () => _pickup(c, p)));
    }
    for (final p in g.particles) {
      items.add((p.s, () => _particle(c, p)));
    }
    items.add((g.s, () => _player(c)));
    if (g.stumbleT > 0) items.add((g.s - 2.6, () => _father(c)));
    items.sort((a, b) => b.$1.compareTo(a.$1));
    for (final it in items) {
      it.$2();
    }
  }

  // ---------------------------------------------------------------- scenery
  void _building(Canvas c, Building b) {
    final z1 = b.s0 + b.len;
    final r = _box(c, b.x0, b.x1, 0, b.h, b.s0, z1, b.color, sideK: 0.86);
    final dz = b.s0 - g.s;
    if (dz > 110) return;
    // windows on the side facing the track
    final xs = b.x1 < 0 ? b.x1 : b.x0;
    final win = _fogged(themes[g.themeNow].ohio ? 0xffffd23f : 0xff8fb4ff, b.s0);
    for (var y = 2.0; y < b.h - 1; y += 3) {
      for (var z = b.s0 + 1.2; z < z1 - 1; z += 3) {
        _quad(c, [_proj(xs, y, z), _proj(xs, y + 1.4, z), _proj(xs, y + 1.4, z + 1.6), _proj(xs, y, z + 1.6)], win);
      }
    }
    if (r != null && r.width > 8) {
      _p.color = win;
      for (var y = 0.15; y < 0.9; y += 0.18) {
        for (var x = 0.12; x < 0.85; x += 0.25) {
          c.drawRect(Rect.fromLTWH(r.left + r.width * x, r.top + r.height * y, r.width * 0.14, r.height * 0.09), _p);
        }
      }
    }
  }

  void _obstacle(Canvas c, Obstacle o) {
    final x0 = o.x - kObHalfW, x1 = o.x + kObHalfW;
    switch (o.kind) {
      case ObKind.train:
        final r = _box(c, x0, x1, 0, kTrainH, o.s0, o.s1, o.color, top: 0xff8d96aa, front: 0xfff4f6ff);
        // coloured stripe along the visible side
        final xs = g.camX < x0 ? x0 : g.camX > x1 ? x1 : null;
        if (xs != null) {
          final za = max(o.s0, _camZ + _near + 0.2);
          _quad(c, [_proj(xs, 0.7, za), _proj(xs, 1.0, za), _proj(xs, 1.0, o.s1), _proj(xs, 0.7, o.s1)], _fogged(0xffffd23f, za));
          for (var z = o.s0 + 1.2; z < o.s1 - 1.5; z += 3.2) {
            if (z < za) continue;
            _quad(c, [_proj(xs, 1.5, z), _proj(xs, 2.4, z), _proj(xs, 2.4, z + 2.2), _proj(xs, 1.5, z + 2.2)], _fogged(0xffd9f3ff, z));
          }
        }
        if (r != null) {
          _p.color = _fogged(0xff2a3f7a, o.s0);
          c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(r.left + r.width * 0.12, r.top + r.height * 0.1, r.right - r.width * 0.12, r.top + r.height * 0.42), Radius.circular(r.width * 0.05)), _p);
          _p.color = _fogged(o.color, o.s0);
          c.drawRect(Rect.fromLTRB(r.left, r.top + r.height * 0.55, r.right, r.top + r.height * 0.66), _p);
          _p.color = const Color(0xfffff6c4);
          for (final fx in [0.22, 0.78]) {
            c.drawCircle(Offset(r.left + r.width * fx, r.top + r.height * 0.8), r.width * 0.08, _p);
          }
        }
        if (o.ramp) {
          final a = o.s0 - kRampLen;
          final col = _fogged(0xffffd23f, a);
          _quad(c, [_proj(x0, 0.02, a), _proj(x1, 0.02, a), _proj(x1, kTrainH, o.s0), _proj(x0, kTrainH, o.s0)], col);
          // stripes on the ramp
          for (var k = 1; k < 8; k += 2) {
            final za = a + kRampLen * k / 8, zb = a + kRampLen * (k + 1) / 8;
            final ya = kTrainH * k / 8, yb = kTrainH * (k + 1) / 8;
            _quad(c, [_proj(x0, ya + 0.01, za), _proj(x1, ya + 0.01, za), _proj(x1, yb + 0.01, zb), _proj(x0, yb + 0.01, zb)], _fogged(0xff2a145f, za));
          }
        }
      case ObKind.low:
        _box(c, x0 + 0.05, x0 + 0.2, 0, 1.0, o.s0, o.s1, 0xffffffff);
        _box(c, x1 - 0.2, x1 - 0.05, 0, 1.0, o.s0, o.s1, 0xffffffff);
        final r = _box(c, x0, x1, 0.35, 1.0, o.s0, o.s1, 0xffff3d6e);
        if (r != null) _stripes(c, r, o.s0);
      case ObKind.high:
        _box(c, x0, x0 + 0.16, 0, 2.6, o.s0, o.s1, 0xffffffff);
        _box(c, x1 - 0.16, x1, 0, 2.6, o.s0, o.s1, 0xffffffff);
        final r = _box(c, x0, x1, 1.3, 2.6, o.s0, o.s1, 0xffff3d6e);
        if (r != null) _stripes(c, r, o.s0);
    }
  }

  void _stripes(Canvas c, Rect r, double z) {
    _p.color = _fogged(0xffffffff, z);
    final n = 5;
    final w = r.width / n;
    c.save();
    c.clipRect(r);
    for (var i = 0; i < n; i += 1) {
      if (i.isEven) continue;
      final path = Path()
        ..moveTo(r.left + i * w, r.bottom)
        ..lineTo(r.left + i * w + w * 0.6, r.top)
        ..lineTo(r.left + (i + 1) * w + w * 0.6, r.top)
        ..lineTo(r.left + (i + 1) * w, r.bottom)
        ..close();
      c.drawPath(path, _p);
    }
    c.restore();
  }

  void _billboard(Canvas c, String glyph, double x, double y, double z, double size,
      {bool outline = true, int color = 0xffffd23f, double depth = 0}) {
    final o = _proj(x, y, z);
    if (o == null) return;
    final px = size * _scaleAt(y, z);
    if (px > _h * 2) return;
    _drawText(c, glyph, o, px, outline: outline, color: color, depth: depth * px);
  }

  void _pickup(Canvas c, Pickup p) {
    final bob = sin(g.time * 4 + p.s) * 0.12;
    switch (p.kind) {
      case PickKind.letter:
        _billboard(c, p.glyph, p.x, p.y + bob, p.s, 1.15);
      case PickKind.bonus:
        _billboard(c, p.glyph, p.x, p.y + bob, p.s, 1.0, outline: false);
      case PickKind.power:
        final o = _proj(p.x, p.y + bob, p.s);
        if (o == null) return;
        final r = 0.6 * _scaleAt(p.y, p.s);
        _p.color = Colors.white;
        c.drawCircle(o, r * 1.12, _p);
        _p.color = const Color(0xff8338ec);
        c.drawCircle(o, r, _p);
        _drawText(c, p.glyph, o, r * 1.3, outline: false);
      case PickKind.meme:
        final o = _proj(p.x, p.y + bob, p.s);
        if (o == null) return;
        final k = _scaleAt(p.y, p.s);
        // spinning rainbow halo
        final word = p.glyph.length > 2 && p.glyph.contains(RegExp('[A-Z0-9]'));
        final rw = (word ? 1.9 : 1.05) * k, rh = 1.05 * k;
        _p
          ..style = PaintingStyle.stroke
          ..strokeWidth = max(2, 0.1 * k)
          ..color = HSVColor.fromAHSV(1, (g.time * 220 + p.s * 10) % 360, 0.8, 1).toColor();
        c.drawOval(Rect.fromCenter(center: o, width: rw * 2 * (0.75 + 0.25 * cos(g.time * 3)), height: rh * 2), _p);
        _p.style = PaintingStyle.fill;
        _drawText(c, p.glyph, o, (word ? 1.1 : 1.6) * k,
            color: _memeColor(p.glyph), outline: word, depth: word ? 0.12 : 0.06);
    }
  }

  int _memeColor(String t) => switch (t) {
        'OHIO' => 0xffff4040,
        'SIGMA' => 0xffcfe6ff,
        'SKIBIDI' => 0xff55e8f0,
        'AURA' => 0xffd38bff,
        'RIZZ' => 0xffff5cb8,
        _ => 0xffffd23f,
      };

  void _particle(Canvas c, Particle p) {
    final a = (p.life / p.max).clamp(0.0, 1.0);
    if (p.emoji != null) {
      final o = _proj(p.x, p.y, p.s);
      if (o == null) return;
      final px = min(p.size * _scaleAt(p.y, p.s), _h * 0.18);
      _drawText(c, p.emoji!, o, px, outline: false, opacity: min(1, a * 2));
      return;
    }
    final o = _proj(p.x, p.y, p.s);
    if (o == null) return;
    final r = p.size * _scaleAt(p.y, p.s) * (0.3 + 0.7 * a);
    _p.color = Color(p.color);
    c.drawRect(Rect.fromCenter(center: o, width: r, height: r), _p);
  }

  // ---------------------------------------------------------------- characters
  void _player(Canvas c) {
    final gs = g.has(Meme.sigma) ? 2.0 : 1.0;
    final z = g.s, x = g.px, y = g.py;
    // shadow
    final gy = g.groundAt(x, z) + 0.03;
    final so = _proj(x, gy, z);
    if (so != null) {
      final r = 0.6 * gs * _scaleAt(gy, z) * max(0.3, 1 - (y - gy) * 0.12);
      _p.color = const Color(0x40000000);
      c.drawOval(Rect.fromCenter(center: so, width: r * 2, height: r * 0.7), _p);
    }
    if (g.beetle) {
      _beetle(c, x, y, z);
    } else {
      _runner(c, x, y, z, gs);
    }
    if (g.shield) {
      final o = _proj(x, y + 1.0 * gs, z);
      if (o != null) {
        final r = 1.3 * gs * _scaleAt(y + 1, z);
        _p.color = Color.fromRGBO(120, 200, 255, 0.22 + 0.06 * sin(g.time * 8));
        c.drawCircle(o, r, _p);
      }
    }
    if (g.has(Meme.fire)) {
      final o = _proj(x, y + 2.6 * gs, z);
      if (o != null) _drawText(c, '🔥', o, 1.0 * _scaleAt(y + 2.6, z), outline: false);
    }
    if (g.graceT > 0 && ((g.time * 12).floor().isEven)) {
      final o = _proj(x, y + 1, z);
      if (o != null) {
        _p.color = const Color(0x55ffffff);
        c.drawCircle(o, 1.1 * _scaleAt(y + 1, z), _p);
      }
    }
  }

  void _runner(Canvas c, double x, double y, double z, double gs) {
    final sl = g.sliding;
    final hy = sl ? 0.5 : 1.0; // squash while rolling
    final air = !g.onGround;
    final run = g.runPhase;
    final sw = air || sl ? 0.0 : sin(run) * 0.35;
    final hoodie = HSVColor.fromAHSV(1, (g.time * 18) % 360, 0.8, 1).toColor().toARGB32();
    double Y(double v) => y + v * hy * gs;
    double X(double v) => x + v * gs;
    double Z(double v) => z + v * gs;
    // legs (alternate front/back)
    for (final side in [-1, 1]) {
      final o = side * sw;
      final lift = air ? 0.25 : max(0.0, -o) * 0.4;
      _box(c, X(side * 0.29), X(side * 0.05), Y(lift), Y(0.75), Z(-0.12 + o), Z(0.12 + o), 0xff3a86ff);
      _box(c, X(side * 0.31), X(side * 0.03), Y(lift), Y(lift + 0.14), Z(-0.14 + o), Z(0.2 + o), 0xffffffff);
    }
    // torso + backpack (or jetpack)
    _box(c, X(-0.36), X(0.36), Y(0.75), Y(1.45), Z(-0.22), Z(0.22), hoodie);
    if (g.hasPower(Power.jetpack)) {
      _box(c, X(-0.34), X(-0.06), Y(0.8), Y(1.5), Z(-0.5), Z(-0.22), 0xffdfe6f2);
      _box(c, X(0.06), X(0.34), Y(0.8), Y(1.5), Z(-0.5), Z(-0.22), 0xffdfe6f2);
      for (final fx in [-0.2, 0.2]) {
        final o = _proj(X(fx), Y(0.6), Z(-0.36));
        if (o != null) _drawText(c, '🔥', o, 0.55 * _scaleAt(y, z), outline: false);
      }
    } else {
      _box(c, X(-0.25), X(0.25), Y(0.85), Y(1.38), Z(-0.36), Z(-0.22), 0xff8338ec);
    }
    // arms: swinging, raised in the air, or the 6-7 juggle
    for (final side in [-1, 1]) {
      double up, o;
      if (g.has(Meme.sixSeven)) {
        up = 0.5 + sin(g.time * 16) * side * 0.35;
        o = 0.25;
      } else if (air && !g.flying) {
        up = 0.6;
        o = 0;
      } else {
        up = 0;
        o = -side * sw;
      }
      _box(c, X(side * 0.56), X(side * 0.37), Y(0.8 + up), Y(1.42 + up), Z(-0.1 + o), Z(0.1 + o), hoodie, sideK: 0.7);
    }
    // head, giant when 🧠
    final hs = g.has(Meme.brain) ? 1.7 : 1.0;
    final hc = 1.75;
    _box(c, X(-0.31 * hs), X(0.31 * hs), Y(1.45), Y(1.45 + 0.6 * hs), Z(-0.29 * hs), Z(0.29 * hs), 0xffffc9a3);
    _box(c, X(-0.33 * hs), X(0.33 * hs), Y(1.45 + 0.58 * hs), Y(1.45 + 0.75 * hs), Z(-0.32 * hs), Z(0.32 * hs), 0xffffd23f);
    if (g.has(Meme.brain)) {
      final o = _proj(x, Y(hc + 0.9 * hs), z);
      if (o != null) _drawText(c, '🧠', o, 0.6 * hs * _scaleAt(y + 2.5, z), outline: false);
    }
    if (g.hasPower(Power.x2) || g.has(Meme.sigma) || g.flying) {
      final o = _proj(X(0.75), Y(2.4), z);
      if (o != null) _drawText(c, '😎', o, 0.6 * gs * _scaleAt(y + 2.4, z), outline: false);
    }
  }

  void _beetle(Canvas c, double x, double y, double z) {
    // Gregor, verwandelt: a big brown beetle scuttling along (still wearing the cap)
    final ph = g.time * 30;
    for (final side in [-1, 1]) {
      for (var j = 0; j < 3; j++) {
        final o = sin(ph + j * 2 + (side > 0 ? 1 : 0)) * 0.18;
        _box(c, x + side * 0.55, x + side * 1.05, y, y + 0.12, z - 0.6 + j * 0.55 + o, z - 0.5 + j * 0.55 + o, 0xff24140a);
      }
    }
    _box(c, x - 0.75, x + 0.75, y + 0.15, y + 0.7, z - 0.9, z + 0.9, 0xff4a2c14, top: 0xff6b4423);
    _box(c, x - 0.04, x + 0.04, y + 0.7, y + 0.74, z - 0.9, z + 0.9, 0xff24140a);
    _box(c, x - 0.38, x + 0.38, y + 0.2, y + 0.65, z + 0.9, z + 1.4, 0xff24140a);
    _box(c, x - 0.22, x + 0.22, y + 0.65, y + 0.78, z + 1.0, z + 1.35, 0xffffd23f);
  }

  void _father(Canvas c) {
    // Herr Samsa, apple in hand, right behind you
    final z = g.s - 2.6, x = g.px - 1.0;
    final run = sin(g.runPhase) * 0.3;
    for (final side in [-1, 1]) {
      _box(c, x + side * 0.28, x + side * 0.05, 0, 0.85, z - 0.12 + side * run, z + 0.12 + side * run, 0xff2b2b3a);
    }
    _box(c, x - 0.4, x + 0.4, 0.85, 1.7, z - 0.25, z + 0.25, 0xff2f4f3f);
    _box(c, x - 0.3, x + 0.3, 1.7, 2.3, z - 0.28, z + 0.28, 0xfff0c8a0);
    _box(c, x - 0.32, x + 0.32, 2.2, 2.35, z - 0.3, z + 0.3, 0xffd8d8d8);
    final o = _proj(x + 0.6, 2.3 + sin(g.time * 9) * 0.25, z);
    if (o != null) _drawText(c, '🍎', o, 0.6 * _scaleAt(2.3, z), outline: false);
  }

  void _speedLines(Canvas c) {
    final k = max(0.0, (g.speed - 24) / 16) + (g.flying ? 0.5 : 0) + (g.has(Meme.fire) ? 0.8 : 0);
    if (k <= 0.02 || !g.alive) return;
    final rnd = Random(7);
    final cy = _h * 0.42, rr = sqrt(_w * _w + _h * _h) * 0.6;
    _p
      ..style = PaintingStyle.stroke
      ..strokeWidth = max(2, _w / 300);
    for (var i = 0; i < 60; i++) {
      final a = rnd.nextDouble() * 2 * pi;
      final r = ((rnd.nextDouble() + g.time * (0.8 + rnd.nextDouble())) % 1) * 0.75 + 0.25;
      _p.color = HSVColor.fromAHSV(min(0.55, k * 0.5), (i * 37 + g.time * 120) % 360, 0.5, 1).toColor();
      final r1 = r * rr, r2 = r1 + rr * 0.12;
      c.drawLine(Offset(_cx + cos(a) * r1, cy + sin(a) * r1), Offset(_cx + cos(a) * r2, cy + sin(a) * r2), _p);
    }
    _p.style = PaintingStyle.fill;
  }

  @override
  bool shouldRepaint(covariant GamePainter old) => true;
}
