import 'package:shared_preferences/shared_preferences.dart';

/// Highscore and settings, kept on the device.
class Prefs {
  Prefs._(this._sp);
  final SharedPreferences _sp;

  static Future<Prefs> load() async => Prefs._(await SharedPreferences.getInstance());

  int get highscore => _sp.getInt('highscore') ?? 0;
  set highscore(int v) => _sp.setInt('highscore', v);

  int get bestLetters => _sp.getInt('bestLetters') ?? 0;
  set bestLetters(int v) => _sp.setInt('bestLetters', v);

  bool get sound => _sp.getBool('sound') ?? true;
  set sound(bool v) => _sp.setBool('sound', v);

  bool get bookLine => _sp.getBool('bookLine') ?? true;
  set bookLine(bool v) => _sp.setBool('bookLine', v);
}
