// Designs a custom narrator voice with ElevenLabs Voice Design.
//   node tts/design-voice.js              -> three previews in tts/voice-previews/ (speaking the hook)
//   node tts/design-voice.js --save=2     -> stores preview 2 as a voice and writes its id to .env
// Options: --description="..." --name="..." --model=eleven_multilingual_ttv_v2
import './_proxy.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { scenes } from '../timeline.src.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'tts', 'voice-previews');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) { console.error('ELEVENLABS_API_KEY fehlt in .env'); process.exit(2); }
const API = 'https://api.elevenlabs.io/v1';
const DESCRIPTION = args.description || 'A native German male documentary narrator in his mid-forties. Deep, calm and measured, with a serious, slightly ominous undertone. Standard High German without any regional accent. Unhurried pace, very clear articulation, restrained and intimate, close microphone, clean studio sound. Sounds like the narrator of a science thriller documentary.';
const NAME = args.name || 'Die Uhr läuft – Erzähler';
const post = async (url, body) => {
  const r = await fetch(url, { method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) {
    const body = await r.text();
    if (body.includes('voice_limit_reached')) { console.error('Das Stimmen-Limit des ElevenLabs-Kontos ist erreicht. Bitte dort Stimmen löschen oder den Tarif erweitern, dann erneut ausführen.\n' + body.slice(0, 300)); process.exit(3); }
    throw new Error(`ElevenLabs ${r.status}: ${body.slice(0, 600)}`);
  }
  return r.json();
};
fs.mkdirSync(dir, { recursive: true });
const meta = path.join(dir, 'previews.json');

if (args.save) {
  const list = JSON.parse(fs.readFileSync(meta, 'utf8'));
  const p = list.previews[+args.save - 1];
  if (!p) throw new Error(`Vorschau ${args.save} gibt es nicht.`);
  const j = await post(`${API}/text-to-voice`, { voice_name: NAME, voice_description: list.description, generated_voice_id: p.generated_voice_id });
  const env = path.join(root, '.env');
  let txt = fs.existsSync(env) ? fs.readFileSync(env, 'utf8') : '';
  txt = txt.replace(/^ELEVENLABS_VOICE_ID=.*\n?/m, '').replace(/\n*$/, '\n') + `ELEVENLABS_VOICE_ID=${j.voice_id}\n`;
  fs.writeFileSync(env, txt);
  console.log(`Stimme gespeichert: ${j.voice_id} („${NAME}“). In .env als ELEVENLABS_VOICE_ID eingetragen.`);
} else {
  const text = scenes[0].lines.filter((l) => typeof l === 'string').join(' '); // the hook
  const j = await post(`${API}/text-to-voice/design`, { voice_description: DESCRIPTION, text, model_id: args.model || 'eleven_multilingual_ttv_v2', seed: 2026 });
  const previews = j.previews.map((p, i) => {
    const file = `preview_${i + 1}.mp3`;
    fs.writeFileSync(path.join(dir, file), Buffer.from(p.audio_base_64, 'base64'));
    return { n: i + 1, file, generated_voice_id: p.generated_voice_id, duration: p.duration_secs };
  });
  fs.writeFileSync(meta, JSON.stringify({ description: DESCRIPTION, text, previews }, null, 1));
  for (const p of previews) console.log(`Vorschau ${p.n}: tts/voice-previews/${p.file}  ${p.duration?.toFixed?.(1) ?? '?'}s`);
}
