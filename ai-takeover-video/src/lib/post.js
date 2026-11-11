// Post-processing chain: RenderPass -> UnrealBloomPass -> final pass.
// The final pass tone-maps the scene, composites the HUD, and adds chromatic aberration,
// glitch displacement, vignette and film grain. All noise is seeded by the frame number.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null }, tHud: { value: null },
    uSeed: { value: 0 }, uGlitch: { value: 0 }, uCA: { value: 0.0015 }, uGrain: { value: 0.07 },
    uVignette: { value: 0.9 }, uFade: { value: 1 }, uFlash: { value: 0 }, uExposure: { value: 1 },
    uTint: { value: new THREE.Color(1, 1, 1) }, uHudGlitch: { value: 0 }, uRes: { value: new THREE.Vector2(1920, 1080) },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse, tHud;
    uniform float uSeed, uGlitch, uCA, uGrain, uVignette, uFade, uFlash, uExposure, uHudGlitch;
    uniform vec3 uTint;
    uniform vec2 uRes;
    varying vec2 vUv;
    float h11(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
    float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
    vec3 scene(vec2 uv) { return aces(texture2D(tDiffuse, uv).rgb * uExposure * uTint); }
    vec4 hud(vec2 uv) { return texture2D(tHud, uv); }
    void main() {
      vec2 uv = vUv;
      float g = uGlitch;
      vec2 huv = uv;
      if (g > 0.001) {
        float bands = mix(14.0, 70.0, h11(uSeed * 1.31));
        float band = floor(uv.y * bands);
        float on = step(1.0 - g * 0.85, h21(vec2(band * 1.7, uSeed + 3.0)));
        float shift = (h21(vec2(band, uSeed)) - 0.5) * 0.22 * g * on;
        uv.x += shift;
        uv.y += (h11(uSeed * 2.7) - 0.5) * 0.05 * g * step(0.72, h11(uSeed * 3.3));
        huv = mix(vUv, uv, 0.75);
      }
      if (uHudGlitch > 0.001) {
        float band = floor(vUv.y * 90.0);
        huv.x += (h21(vec2(band, uSeed * 1.9)) - 0.5) * 0.02 * uHudGlitch * step(0.8, h21(vec2(band * 2.3, uSeed)));
      }
      vec2 dir = uv - 0.5;
      float ca = uCA * (0.35 + 2.4 * dot(dir, dir)) + g * 0.02;
      vec3 col = vec3(scene(uv + dir * ca).r, scene(uv).g, scene(uv - dir * ca).b);
      // vignette
      float v = smoothstep(1.25, 0.25, length(dir * vec2(1.0, 0.82)) * 1.55);
      col *= mix(1.0, v, uVignette);
      // HUD with its own, smaller aberration
      float hca = 0.00022 + g * 0.012 + uHudGlitch * 0.004;
      vec4 hr = hud(huv + vec2(hca, 0.0)), hg = hud(huv), hb = hud(huv - vec2(hca, 0.0));
      vec3 hcol = vec3(hr.r * hr.a, hg.g * hg.a, hb.b * hb.a);
      float ha = max(hg.a, max(hr.a, hb.a));
      col = col * (1.0 - ha * 0.82) + hcol;
      // glitch artefacts: noise blocks, scanlines, flash
      if (g > 0.001) {
        // blocks show displaced, channel-rotated copies of the picture (datamosh look)
        vec2 blk = floor(vUv * vec2(32.0, 18.0));
        float n = h21(blk + uSeed);
        if (n > 1.0 - g * 0.16) {
          vec2 o = vec2(h21(blk * 1.3 + uSeed) - 0.5, h21(blk * 2.1 + uSeed) - 0.5) * 0.3;
          col = scene(vUv + o).gbr * 1.7 + 0.03;
        }
        col *= 1.0 - 0.25 * g * step(0.5, fract(vUv.y * uRes.y * 0.5));
      }
      col = col * (1.0 + 2.4 * uFlash) + uFlash * vec3(0.10, 0.09, 0.08);
      col *= uFade;
      // display encoding + grain
      col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
      float n = h21(gl_FragCoord.xy + vec2(uSeed * 17.0, uSeed * 29.0)) - 0.5;
      col += n * uGrain * (0.55 + 0.45 * (1.0 - dot(col, vec3(0.333))));
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createPost(renderer, W, H, hudTexture) {
  const target = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 0 });
  const composer = new EffectComposer(renderer, target);
  const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
  renderPass.clearColor = new THREE.Color(0, 0, 0);
  renderPass.clearAlpha = 1;
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.9, 0.6, 0.12);
  const final = new ShaderPass(FinalShader);
  final.uniforms.tHud.value = hudTexture;
  final.uniforms.uRes.value.set(W, H);
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(final);
  return { composer, renderPass, bloom, final };
}
