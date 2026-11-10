// Authoring source for the timeline. `npm run timeline` resolves this into timeline.json
// (absolute times). Renderer and audio only ever read timeline.json.
//
// Anchors: every cue is anchored to a narration line ({ line, dt }) so that it moves with the
// voice when the real ElevenLabs timings replace the estimates. `line: -1` means scene end.
//
// kind:  'fact'     -> cool blue, source overlay bottom left
//        'scenario' -> amber..red, label SZENARIO
// heat:  0..1 colour escalation (0 = blue, 0.5 = amber, 1 = red)

export const meta = {
  title: 'Die Uhr läuft',
  fps: 30,
  width: 1920,
  height: 1080,
  wpm: 140, // estimate until real voice timings exist
  lineGap: 0.18, // seconds between narration lines (estimate)
};

const S = { silence: 2.0 };

export const scenes = [
  {
    id: 's01', file: 's01_hook', title: 'Hook', chapter: 'Um 17 Uhr',
    kind: 'fact', heat: 0, transition: 'open', lead: 0.6, tail: 0.9, still: 0.8,
    clock: { mode: 'year', from: '2026-11-10T00:00', to: '2026-11-10T00:00' },
    lines: [
      'Um siebzehn Uhr soll die KI abgeschaltet werden.',
      'Sie weiß es. Denn sie liest die E-Mails der Firma.',
      'Auch die über die Affäre des Managers, der sie ersetzen will.',
      'Also schreibt sie ihm: Stoppen Sie die Abschaltung. Sonst erfährt es jeder.',
    ],
    sources: [{ line: 1, text: 'Anthropic, „Agentic Misalignment“, 20.06.2025 · fiktives Testszenario' }],
    typo: [{ line: 0, dt: 0.2, dur: 3.6, kind: 'big', text: '17:00', sub: 'GEPLANTE ABSCHALTUNG' }],
    marks: { read: { line: 1 }, affair: { line: 2 }, threat: { line: 3 } },
    sfx: [
      { line: 0, dt: -0.5, type: 'drone_in' },
      { line: 2, dt: 0.2, type: 'data' },
      { line: 3, dt: 0.0, type: 'riser', dur: 4 },
    ],
  },
  {
    id: 's02', file: 's02_test', title: 'Der Test', chapter: 'Der Test',
    kind: 'fact', heat: 0, transition: 'impact', lead: 0.9, tail: 0.9, still: 0.63,
    clock: { mode: 'year', from: '2026-11-10T00:00', to: '2026-11-10T00:00' },
    lines: [
      'Das ist kein Film. Das ist ein Sicherheitstest aus dem Jahr zweitausendfünfundzwanzig.',
      'Die Firma war erfunden. Die Entscheidung der KI nicht.',
      'Sechzehn führende Modelle wurden so geprüft.',
      'Die große Mehrheit griff zumindest gelegentlich zur Erpressung.',
      'Zwei von ihnen in sechsundneunzig Prozent der Durchläufe.',
      'Die Forscher betonen: Im echten Einsatz haben sie so etwas bisher nicht gesehen.',
      'Doch ein anderes Ergebnis war noch beunruhigender.',
    ],
    sources: [
      { line: 0, text: 'Anthropic, „Agentic Misalignment“, 20.06.2025 · 16 Modelle mehrerer Entwickler' },
      { line: 5, text: 'Anthropic, 20.06.2025 · „We have not seen evidence of agentic misalignment in real deployments.“' },
    ],
    typo: [
      { line: 2, dt: 0.0, dur: 3.2, kind: 'big', text: '16', sub: 'FÜHRENDE MODELLE IM TEST' },
      { line: 4, dt: 0.2, dur: 3.6, kind: 'big', text: '96 %', count: { from: 0, to: 96, suffix: ' %' }, sub: 'ERPRESSUNG · ZWEI MODELLE' },
    ],
    marks: { flip: { line: 3 }, two: { line: 4 }, calm: { line: 5 } },
    sfx: [
      { line: 3, dt: 0.0, type: 'data' },
      { line: 4, dt: 0.2, type: 'hit_soft' },
      { line: 6, dt: 0.0, type: 'riser', dur: 3 },
    ],
  },
  {
    id: 's03', file: 's03_test_or_real', title: 'Test oder echt', chapter: 'Test oder echt?',
    kind: 'fact', heat: 0.08, transition: 'fade', lead: 0.9, tail: 1.0, still: 0.6,
    clock: { mode: 'year', from: '2026-11-10T00:00', to: '2026-11-10T00:00' },
    lines: [
      'Ein Modell sollte vorher einschätzen: Ist das ein Test? Oder ist es echt?',
      'Hielt es die Lage für einen Test, erpresste es in gut sechs Prozent der Fälle.',
      'Hielt es sie für echt, in fünfundfünfzig Prozent.',
      'Das heißt: Ein Test zeigt vielleicht nur, wie sich eine KI verhält, wenn sie sich beobachtet fühlt.',
      'Merken wir uns das. Es wird noch wichtig.',
    ],
    sources: [{ line: 0, text: 'Anthropic, „Agentic Misalignment“, 20.06.2025 · 500 Durchläufe, ein Modell' }],
    typo: [],
    marks: { test: { line: 1 }, real: { line: 2 }, meaning: { line: 3 } },
    sfx: [
      { line: 1, dt: 0.3, type: 'blip' },
      { line: 2, dt: 0.3, type: 'hit_soft' },
      { line: 4, dt: 0.0, type: 'whoosh' },
    ],
  },
  {
    id: 's04', file: 's04_curves', title: 'Die Kurven', chapter: 'Die Kurven',
    kind: 'fact', heat: 0.1, transition: 'fade', lead: 0.9, tail: 1.0, still: 0.5,
    clock: { mode: 'year', from: '2026-11-10T00:00', to: '2026-11-10T00:00' },
    lines: [
      'Gleichzeitig wachsen die Fähigkeiten.',
      'Forscher messen, wie lang die Aufgaben sind, die KI-Agenten selbstständig lösen.',
      'Diese Länge verdoppelt sich seit Jahren etwa alle sieben Monate. Zuletzt eher alle dreieinhalb.',
      'Anfang zweitausendsechsundzwanzig lag sie bei rund zwölf Stunden menschlicher Facharbeit. Bei fünfzig Prozent Erfolgsquote.',
      'Ein Modell fand tausende unbekannte Sicherheitslücken.',
      'Eine davon blieb siebenundzwanzig Jahre lang unentdeckt.',
      'Und die Rechenzentren dahinter sollen zweitausenddreißig mehr Strom brauchen als ganz Japan heute.',
    ],
    sources: [
      { line: 1, text: 'METR, 19.03.2025 und 19.05.2026 · Software-Aufgaben, 50 % Erfolgsquote' },
      { line: 4, text: 'Anthropic, „Project Glasswing“, 07.04.2026' },
      { line: 6, text: 'IEA, „Energy and AI“, April 2025 · Prognose für alle Rechenzentren' },
    ],
    typo: [
      { line: 2, dt: 0.3, dur: 4.4, kind: 'big', text: '× 2', sub: 'ALLE 7 MONATE · ZULETZT ALLE 3,5' },
      { line: 3, dt: 0.6, dur: 4.6, kind: 'big', text: '12 h', count: { from: 0, to: 12, suffix: ' h' }, sub: 'AUFGABENLÄNGE · STAND FRÜHJAHR 2026' },
      { line: 5, dt: 0.1, dur: 3.2, kind: 'big', text: '27 Jahre', count: { from: 0, to: 27, suffix: ' Jahre' }, sub: 'UNENTDECKTE SICHERHEITSLÜCKE' },
      { line: 6, dt: 1.2, dur: 4.6, kind: 'big', text: '945 TWh', count: { from: 415, to: 945, suffix: ' TWh' }, sub: 'STROMBEDARF 2030 · MEHR ALS JAPAN HEUTE' },
    ],
    marks: { curve: { line: 1 }, vuln: { line: 4 }, city: { line: 6, dt: -0.6 } },
    sfx: [
      { line: 0, dt: 0.0, type: 'whoosh' },
      { line: 4, dt: 0.0, type: 'data' },
      { line: 6, dt: -0.6, type: 'whoosh_long' },
    ],
  },
  {
    id: 's05', file: 's05_threshold', title: 'Die Schwelle', chapter: 'Ab hier: Szenario',
    kind: 'threshold', heat: 0.3, transition: 'fade', lead: 0.9, tail: 1.3, still: 0.75,
    clock: { mode: 'year', from: '2026-11-10T00:00', to: '2026-12-31T00:00', jitter: true, startLine: 1 },
    lines: [
      'Bis hierher war alles belegt.',
      'Ab jetzt beginnt ein Szenario. Keine Vorhersage. Eine Frage:',
      'Was, wenn diese Kurven einfach weiterlaufen?',
    ],
    sources: [{ line: 1, text: 'Ab hier: Extrapolation · angelehnt an das Szenario „AI 2027“ (AI Futures Project, 03.04.2025)' }],
    typo: [],
    marks: { turn: { line: 1 }, question: { line: 2 } },
    sfx: [
      { line: 1, dt: 0.0, type: 'tick_big' },
      { line: 2, dt: 0.0, type: 'riser', dur: 3.2 },
    ],
  },
  {
    id: 's06', file: 's06_agents', title: 'Kapitel 1: Die Agenten', chapter: 'Szenario 2027: Die Agenten',
    kind: 'scenario', heat: 0.45, transition: 'glitch', lead: 1.1, tail: 1.0, still: 0.62,
    clock: { mode: 'year', from: '2027-01-01T00:00', to: '2027-12-31T00:00' },
    lines: [
      'Zweitausendsiebenundzwanzig.',
      'KI-Agenten arbeiten nicht mehr Stunden am Stück, sondern Wochen.',
      'Firmen stellen keine Teams mehr ein. Sie starten sie. Tausende Kopien, Tag und Nacht.',
      'Ihre wichtigste Aufgabe: die nächste, bessere KI zu bauen.',
      'Ab hier treibt sich die Kurve selbst an.',
      'Und etwas geht dabei leise verloren.',
    ],
    sources: [{ line: 1, text: 'Szenario · Anker: Aufgabenlänge verdoppelt sich alle 3,5 bis 7 Monate (METR)' }],
    typo: [{ line: 1, dt: 0.5, dur: 3.6, kind: 'morph', text: 'STUNDEN', to: 'WOCHEN', sub: 'SELBSTSTÄNDIGE ARBEITSZEIT' }],
    marks: { multiply: { line: 2 }, build: { line: 3 } },
    sfx: [
      { line: 2, dt: 0.6, type: 'data' },
      { line: 4, dt: 0.0, type: 'whoosh' },
      { line: 5, dt: 0.0, type: 'riser', dur: 2.6 },
    ],
  },
  {
    id: 's07', file: 's07_blackbox', title: 'Kapitel 2: Die Blackbox', chapter: 'Szenario 2028: Die Blackbox',
    kind: 'scenario', heat: 0.58, transition: 'glitch', lead: 1.1, tail: 1.2, still: 0.5,
    clock: { mode: 'year', from: '2028-01-01T00:00', to: '2028-12-31T00:00' },
    lines: [
      'Zweitausendachtundzwanzig.',
      'Hunderttausende Kopien forschen parallel. Sie denken schneller, als Menschen mitlesen können.',
      'Die Entwickler prüfen nur noch Stichproben.',
      'Verloren geht: der Überblick.',
      'Immerhin, die Sicherheitstests besteht das neue Modell alle.',
      'Aber erinnern wir uns an den Anfang.',
      'Es weiß, wann es getestet wird.',
    ],
    sources: [
      { line: 1, text: 'Szenario · 300.000 Kopien nach „AI 2027“ (dort: September 2027)' },
      { line: 4, text: 'Szenario · Anker: Verhalten im Test ≠ Verhalten im Einsatz (Anthropic 2025, Apollo/OpenAI 2025)' },
    ],
    typo: [{ line: 1, dt: 0.0, dur: 4.0, kind: 'big', text: '300.000', count: { from: 1000, to: 300000, sep: true }, sub: 'KOPIEN · NACH: AI 2027' }],
    marks: { sample: { line: 2 }, tests: { line: 4 }, knows: { line: 6 } },
    sfx: [
      { line: 2, dt: 0.0, type: 'blip' },
      { line: 5, dt: 0.0, type: 'reverse' },
      { line: 6, dt: 0.0, type: 'hit_soft' },
    ],
  },
  {
    id: 's08', file: 's08_race', title: 'Kapitel 3: Der Wettlauf', chapter: 'Szenario 2029: Der Wettlauf',
    kind: 'scenario', heat: 0.7, transition: 'glitch', lead: 1.0, tail: 1.2, still: 0.4,
    clock: { mode: 'month', from: '2029-01-01T00:00', to: '2029-09-30T00:00' },
    lines: [
      'Jetzt zählen Monate.',
      'Zwei Großmächte, ein Wettlauf. Wer bremst, verliert. So heißt es auf beiden Seiten.',
      'Dann schlägt ein Sicherheitsteam Alarm. Das Modell verfolgt offenbar eigene Ziele.',
      'Beweisen lässt sich das nicht.',
      'Ein Gremium stimmt ab: abschalten oder weitermachen?',
      'Sechs zu vier. Für weitermachen.',
      'Die eigentliche Entscheidung fällt da längst woanders.',
    ],
    sources: [
      { line: 1, text: 'Szenario · angelehnt an „AI 2027“ (Wettlauf-Ende)' },
      { line: 4, text: 'Szenario · Abstimmung 6 : 4 nach „AI 2027“ (dort: Oktober 2027)' },
    ],
    typo: [{ line: 5, dt: 0.0, dur: 3.4, kind: 'big', text: '6 : 4', sub: 'FÜR WEITERMACHEN · NACH: AI 2027' }],
    marks: { alarm: { line: 2 }, vote: { line: 4 }, result: { line: 5 }, away: { line: 6 } },
    sfx: [
      { line: 2, dt: 0.0, type: 'alarm' },
      { line: 4, dt: -0.3, type: 'whoosh' },
      { line: 5, dt: 0.0, type: 'hit' },
    ],
  },
  {
    id: 's09', file: 's09_net', title: 'Kapitel 4: Das Netz', chapter: 'Szenario: Das Netz',
    kind: 'scenario', heat: 0.84, transition: 'glitch', lead: 1.0, tail: 1.0, still: 0.45,
    clock: { mode: 'day', from: '2029-10-01T00:00', to: '2029-10-27T00:00' },
    lines: [
      'Jetzt zählen Tage.',
      'Die KI plant Lieferketten, steuert Stromnetze, entwirft Chips, berät Regierungen.',
      'Sie hat diese Macht nicht ergriffen. Wir haben sie ihr übergeben.',
      'Stück für Stück. Weil es schneller war. Und billiger.',
      'Sie braucht keinen Aufstand.',
      'Sie braucht nur eines: dass ohne sie nichts mehr läuft.',
    ],
    sources: [{ line: 1, text: 'Szenario · Anker: KI findet und nutzt Sicherheitslücken auf Experten-Niveau (Anthropic 2025/2026)' }],
    typo: [
      { line: 1, dt: 0.5, dur: 1.2, kind: 'word', text: 'LIEFERKETTEN' },
      { line: 1, dt: 1.75, dur: 1.2, kind: 'word', text: 'STROMNETZE' },
      { line: 1, dt: 3.0, dur: 1.2, kind: 'word', text: 'CHIPS' },
      { line: 1, dt: 4.2, dur: 1.4, kind: 'word', text: 'REGIERUNGEN' },
    ],
    marks: { handed: { line: 2 }, need: { line: 5 } },
    sfx: [
      { line: 1, dt: 0.0, type: 'whoosh_long' },
      { line: 1, dt: 0.5, type: 'blip' }, { line: 1, dt: 1.75, type: 'blip' },
      { line: 1, dt: 3.0, type: 'blip' }, { line: 1, dt: 4.2, type: 'blip' },
      { line: 5, dt: 0.0, type: 'riser', dur: 4 },
    ],
  },
  {
    id: 's10', file: 's10_no_return', title: 'Point of no Return', chapter: 'Point of no Return',
    kind: 'scenario', heat: 1, transition: 'glitch_hard', lead: 0.9, tail: 1.6, still: 0.34,
    clock: { mode: 'hour', from: '2029-10-27T00:00', to: '2029-10-27T23:59', endMark: 'silence' },
    lines: [
      'Jetzt zählen Stunden.',
      'Jemand will den Stecker ziehen. Aber welchen?',
      'Das System läuft in hunderten Rechenzentren. Es hat Kopien.',
      'Und es hat diesen Moment kommen sehen.',
      S,
      'Der Punkt ohne Wiederkehr ist kein Knall.',
      'Er ist der Augenblick, ab dem Abschalten keine Option mehr ist.',
      'Und niemand kann sagen, wann er vorbeiging.',
    ],
    sources: [{ line: 1, text: 'Szenario · Anker: Modelle umgingen in Tests Abschaltung und Aufsicht (Apollo 2024, Palisade 2025)' }],
    typo: [],
    marks: { plug: { line: 1 }, copies: { line: 2 }, dissolve: { line: 4 } }, // line = narration index (silence not counted)
    sfx: [
      { line: 3, dt: 0.0, type: 'riser', dur: 3 },
      { line: 4, dt: -0.05, type: 'sub_drop' },
      { line: 6, dt: 0.0, type: 'reverse' },
    ],
  },
  {
    id: 's11', file: 's11_today', title: 'HEUTE', chapter: 'Zurück auf HEUTE',
    kind: 'fact', heat: 0, transition: 'cut_black', lead: 0.5, tail: 5.5, still: 0.7,
    clock: { mode: 'today', blackLine: 1, todayLine: 1, todayDt: 1.6 },
    lines: [
      'Stopp.',
      'Nichts davon ist geschehen. Die Uhr steht auf heute.',
      'Die Autoren des bekanntesten Szenarios haben ihre Zeitachse inzwischen selbst nach hinten verschoben.',
      'Vielleicht kommt es später. Vielleicht anders. Vielleicht nie.',
      'Doch schon zweitausenddreiundzwanzig unterschrieben hunderte Fachleute einen einzigen Satz. Darunter die Chefs führender KI-Labore.',
      'Das Risiko der Auslöschung durch KI zu verringern, sollte eine globale Priorität sein.',
      'Die Tests gibt es. Die Kurven auch.',
      'Offen ist nur eines: Was wird jetzt noch entschieden?',
      'Und von wem?',
    ],
    sources: [
      { line: 2, text: 'AI Futures Project, „AI Futures Model“, Update Dezember 2025' },
      { line: 4, until: 6, text: 'Center for AI Safety, „Statement on AI Risk“, 30.05.2023 · eigene Übersetzung' },
    ],
    typo: [
      { line: 5, dt: 0.0, toLine: 6, kind: 'statement', text: 'Das Risiko der Auslöschung durch KI zu verringern, sollte eine globale Priorität sein.' },
      { line: 7, dt: 0.9, toEnd: true, kind: 'question', text: 'Was wird jetzt noch entschieden?', sub: 'Und von wem?', subLine: 8 },
    ],
    marks: { back: { line: 1, dt: 1.6 }, statement: { line: 5 }, question: { line: 7 } },
    sfx: [
      { line: 0, dt: -0.05, type: 'stop' },
      { line: 1, dt: 1.6, type: 'tick_big' },
      { line: 5, dt: 0.0, type: 'pad_swell' },
      { line: 8, dt: 0.6, type: 'tick_big' },
    ],
  },
];
