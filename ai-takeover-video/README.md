# Die Uhr läuft – KI-Szenario als Erklärvideo, komplett aus Code

Bild (Three.js), Musik und Soundeffekte (Node-Synthese) und Schnitt (ffmpeg) entstehen aus
einer einzigen Timeline. Die Stimme kommt von ElevenLabs.

## Voraussetzungen

- Node.js 20 oder neuer
- ffmpeg und ffprobe im PATH
- Google Chrome, Chromium oder Edge (wird automatisch gefunden, sonst `CHROME_PATH` setzen)

```bash
npm install
cp .env.example .env      # ELEVENLABS_API_KEY eintragen
```

## Befehle

| Befehl | Ergebnis |
|---|---|
| `npm run preview` | `render/preview.mp4` – 720p, 15 fps, schnell |
| `npm run final` | `render/final.mp4` – 1080p, 30 fps, H.264 + AAC, −14 LUFS, dazu Thumbnails |
| `npm run voice:design` | drei Stimm-Vorschauen in `tts/voice-previews/` |
| `npm run voice:design -- --save=1` | speichert Vorschau 1 als Stimme und trägt sie in `.env` ein |
| `npm run voice` | Sprecherton pro Szene nach `tts/`, mit Zeitstempeln (nur geänderte Takes kosten Guthaben) |
| `npm run styleframes` | ein Standbild pro Szene |
| `npm run thumbnails` | drei Thumbnail-Kandidaten |

`npm run final` macht alles in einem Lauf: Stimme erzeugen → echte Audiolängen messen →
`timeline.json` anpassen → Musik und Effekte neu erzeugen → Mix mit Ducking → Video rendern →
zusammenbauen. Liegt die Gesamtlänge außerhalb von 3:00 bis 5:00, bricht der Lauf ab.

### Schneller rendern mit Grafikkarte

Standard ist Software-Rendering, das überall gleich läuft. Auf einem Rechner mit Grafikkarte:

```bash
npm run final -- --gpu              # optional: --workers=6
```

## Aufbau

| Pfad | Inhalt |
|---|---|
| `research/facts.md` | Faktenbasis mit Quelle, Datum, Link und Prüfstatus |
| `script/script.md` | Drehbuch |
| `timeline.src.js` | Quelle der Timeline: Szenen, Sprechertext, Uhr, Einblendungen, SFX-Cues |
| `timeline.json` | aufgelöste Timeline (wird erzeugt) – einzige Zeitquelle für Bild und Ton |
| `scenes/` | eine Datei pro Szene |
| `src/` | Render-Engine, HUD (Uhr, Labels, Typografie), Post-Processing |
| `audio/synth.js` | Musik und Soundeffekte |
| `tts/` | ElevenLabs: Stimme entwerfen, Takes erzeugen, auf die Timeline legen |
| `scripts/` | Timeline-Build, Frame-Export, Mix, Thumbnails, Pipeline |
| `render/` | Ergebnisse: Video, Untertitel, Kapitelmarken, Standbilder, Thumbnails |

Die Zeit kommt ausschließlich aus der Timeline, nie aus der Echtzeit. Gleiche Eingaben ergeben
dieselben Bilder und denselben Ton.
