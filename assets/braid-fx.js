/* =========================================================
   BRAID FX — the site's interactive material layer.
   · ambient WebGL glow (page background, scroll-synced color)
   · Lenis smooth scroll + direction-aware hero snap
   · liquid sheen layer (hero drag ripples + intro screen)
   · GL hero carousel — photos as living material:
     displacement dissolves, Ken Burns drift, ripple-bent
     imagery, hold-to-pause lens, luminance unveil, grain
   · lantern spotlight + column depth parallax (desktop wall)
   · choreographed unveil (photos develop, headline rises)
   · magnetic CTA + gesture-teaching cursor chip
   Colors from the Braid design system (tokens.css):
   Lavender #C8BCF6 · Deep Violet #5A199B · Warm Amber #FF9033
   ========================================================= */
(function () {
  'use strict';

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DESKTOP = window.matchMedia('(min-width: 768px)').matches;
  const FINE_POINTER = window.matchMedia('(pointer: fine)').matches;

  /* ---------- tiny helpers ---------- */
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const expoOut = (t) => 1 - Math.pow(1 - t, 4);
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  // piecewise-linear color ramp: stops = [[t, '#hex'], ...]
  function rampColor(stops, t) {
    if (t <= stops[0][0]) return hexToRgb(stops[0][1]);
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
        const k = (t - t0) / (t1 - t0), a = hexToRgb(c0), b = hexToRgb(c1);
        return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
      }
    }
    return hexToRgb(stops[stops.length - 1][1]);
  }

  const VERT = 'attribute vec2 a_pos; void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }';

  function buildProgram(gl, fragSrc) {
    function shader(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
      return s;
    }
    const vs = shader(gl.VERTEX_SHADER, VERT), fs = shader(gl.FRAGMENT_SHADER, fragSrc);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    return prog;
  }

  const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  function fitCanvas(canvas, host, gl) {
    const w = Math.floor(host.clientWidth * DPR), h = Math.floor(host.clientHeight * DPR);
    if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  const GLSL_NOISE = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}`;

  /* ---------- WebGL ambient glow layer (page background) ---------- */
  const GLOW_FRAG = `
precision highp float;
uniform vec2  u_res;
uniform float u_time;
uniform vec3  u_bg;
uniform vec2  u_mouse;
uniform float u_energy;
uniform float u_pulse;

vec3 glow(vec2 p, vec2 pos, vec3 color, float radius, float intensity) {
  float d = length(p - pos);
  return color * intensity * exp(-d * d / (radius * radius));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = u_time * 0.06;

  vec3 col = u_bg;
  float e = 1.0 + u_energy * 1.2;

  vec2 b1 = vec2((0.24 + 0.18 * sin(t * 1.3)) * aspect,        0.74 + 0.12 * cos(t * 1.1));
  vec2 b2 = vec2((0.78 + 0.15 * cos(t * 0.9)) * aspect,        0.28 + 0.16 * sin(t * 1.7));
  vec2 b3 = vec2((0.55 + 0.24 * sin(t * 0.7 + 2.0)) * aspect,  0.88 + 0.10 * cos(t * 1.4 + 1.0));

  col += glow(p, b1, vec3(0.784, 0.737, 0.965), 0.44 * e, 0.14);
  col += glow(p, b2, vec3(0.353, 0.098, 0.608), 0.58 * e, 0.30);
  col += glow(p, b3, vec3(1.000, 0.565, 0.200), 0.30,     0.045 + u_energy * 0.05);

  vec2 m = vec2(u_mouse.x * aspect, u_mouse.y);
  col += glow(p, m, vec3(0.85, 0.80, 1.0), 0.20 + u_pulse * 0.16, 0.10 + u_pulse * 0.28);

  float vig = smoothstep(1.25, 0.35, distance(uv, vec2(0.5)));
  col *= mix(0.85, 1.0, vig);

  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (n - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}`;

  function createGlow(host, stops) {
    const canvas = document.createElement('canvas');
    canvas.className = 'braid-fx-canvas';
    canvas.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;';
    host.insertBefore(canvas, host.firstChild);

    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) { canvas.remove(); return null; }
    const prog = buildProgram(gl, GLOW_FRAG);
    if (!prog) { canvas.remove(); return null; }

    const U = {};
    ['u_res', 'u_time', 'u_bg', 'u_mouse', 'u_energy', 'u_pulse'].forEach(
      (n) => (U[n] = gl.getUniformLocation(prog, n))
    );

    const state = {
      mouse: [0.5, 0.5], mouseTarget: [0.5, 0.5],
      energy: 0, energyTarget: 0, pulse: 0,
      bg: hexToRgb(stops[0][1]), bgTarget: hexToRgb(stops[0][1]),
      stops,
    };

    fitCanvas(canvas, host, gl);
    window.addEventListener('resize', () => fitCanvas(canvas, host, gl));

    window.addEventListener('pointermove', (e) => {
      const r = host.getBoundingClientRect();
      state.mouseTarget = [
        clamp((e.clientX - r.left) / r.width, 0, 1),
        clamp(1 - (e.clientY - r.top) / r.height, 0, 1),
      ];
    }, { passive: true });
    window.addEventListener('pointerdown', () => { state.pulse = 1; }, { passive: true });

    function frame(timeMs) {
      fitCanvas(canvas, host, gl);
      state.mouse[0] = lerp(state.mouse[0], state.mouseTarget[0], 0.06);
      state.mouse[1] = lerp(state.mouse[1], state.mouseTarget[1], 0.06);
      state.energy = lerp(state.energy, state.energyTarget, 0.08);
      state.energyTarget *= 0.92;
      state.pulse = Math.max(0, state.pulse - 0.02);
      for (let i = 0; i < 3; i++) state.bg[i] = lerp(state.bg[i], state.bgTarget[i], 0.10);

      gl.useProgram(prog);
      gl.uniform2f(U.u_res, canvas.width, canvas.height);
      gl.uniform1f(U.u_time, timeMs / 1000);
      gl.uniform3f(U.u_bg, state.bg[0], state.bg[1], state.bg[2]);
      gl.uniform2f(U.u_mouse, state.mouse[0], state.mouse[1]);
      gl.uniform1f(U.u_energy, clamp(state.energy, 0, 1));
      gl.uniform1f(U.u_pulse, state.pulse);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    return {
      frame, state,
      setProgress(t) { state.bgTarget = rampColor(state.stops, clamp(t, 0, 1)); },
      kick(v) { state.energyTarget = clamp(Math.max(state.energyTarget, Math.abs(v) / 60), 0, 1); },
    };
  }

  /* ---------- liquid layer (hero swipe sheen + intro screen) ---------- */
  const TRAIL = 12;
  const LIQUID_FRAG = `
precision highp float;
uniform vec2  u_res;
uniform float u_time;
uniform float u_alpha;
uniform vec3  u_cursor;   /* x, y (bottom-up uv), intensity */
uniform vec4  u_trail[${TRAIL}];
${GLSL_NOISE}
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = u_time * 0.06;

  vec2 disp = vec2(0.0);
  float hl = 0.0;
  for (int i = 0; i < ${TRAIL}; i++) {
    vec4 tr = u_trail[i];
    if (tr.w <= 0.001) continue;
    vec2 tp = vec2(tr.x * aspect, tr.y);
    float d = distance(p, tp);
    float wave = sin(d * 36.0 - tr.z * 5.0) * exp(-d * 5.0) * exp(-tr.z * 1.6) * tr.w;
    disp += normalize(p - tp + vec2(1e-4)) * wave * 0.022;
    hl += abs(wave);
  }
  hl = min(hl, 1.0);
  float n1 = fbm(p * 2.6 + disp * 9.0 + vec2(t * 0.8, -t * 0.5));
  float n2 = fbm(p * 5.2 - vec2(t * 0.4, t * 0.7) + disp * 12.0 + n1 * 0.6);
  float sheen = smoothstep(0.42, 0.78, n1 * 0.55 + n2 * 0.45);

  vec3 col = mix(vec3(0.353, 0.098, 0.608), vec3(0.784, 0.737, 0.965), sheen);
  col += vec3(0.88, 0.84, 1.0) * hl * 0.10;

  float a = (0.055 + sheen * 0.11 + hl * 0.09) * u_alpha;

  /* liquid cursor — a soft droplet of light with a noise-wobbled meniscus
     edge; pure light (screen blend), never bends what's underneath */
  if (u_cursor.z > 0.005) {
    vec2 cp = vec2(u_cursor.x * aspect, u_cursor.y);
    float cd = distance(p, cp);
    float wob = 1.0 + (fbm(p * 5.0 + vec2(t * 2.2, -t * 1.6)) - 0.5) * 0.55;
    float body = exp(-(cd * cd) / (0.006 * wob)) * u_cursor.z;
    float halo = exp(-(cd * cd) / (0.030 * wob)) * u_cursor.z;
    col += vec3(0.88, 0.85, 1.0) * body * 0.55 + vec3(0.62, 0.45, 0.90) * halo * 0.22;
    a += (body * 0.42 + halo * 0.16) * u_alpha;
  }

  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}`;

  function createLiquid(host, opts) {
    opts = opts || {};
    const canvas = document.createElement('canvas');
    canvas.className = 'braid-fx-liquid';
    canvas.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;' +
      'mix-blend-mode:screen;z-index:' + (opts.z != null ? opts.z : 3) + ';';
    host.appendChild(canvas);

    const gl = canvas.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: false, powerPreference: 'low-power' });
    if (!gl) { canvas.remove(); return null; }
    const prog = buildProgram(gl, LIQUID_FRAG);
    if (!prog) { canvas.remove(); return null; }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    const U = {
      u_res: gl.getUniformLocation(prog, 'u_res'),
      u_time: gl.getUniformLocation(prog, 'u_time'),
      u_alpha: gl.getUniformLocation(prog, 'u_alpha'),
      u_cursor: gl.getUniformLocation(prog, 'u_cursor'),
      u_trail: gl.getUniformLocation(prog, 'u_trail'),
    };

    const trail = new Float32Array(TRAIL * 4); // x, y(bottom-up), age, strength
    let head = 0;
    function pour(x, y, strength) {
      const i = head * 4;
      trail[i] = x; trail[i + 1] = y; trail[i + 2] = 0; trail[i + 3] = strength;
      head = (head + 1) % TRAIL;
    }

    // cursor droplet state — trails the pointer like liquid, fades on leave
    const cur = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, on: 0, onTarget: 0 };

    // interactivity — the cursor is liquid: hovering stirs the water gently,
    // dragging leaves a stronger rippling wake
    if (opts.interactive) {
      let dragging = false, lastX = 0, lastY = 0, hoverX = 0, hoverY = 0;
      const toUV = (e) => {
        const r = host.getBoundingClientRect();
        return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp(1 - (e.clientY - r.top) / r.height, 0, 1)];
      };
      host.addEventListener('pointerenter', (e) => {
        cur.onTarget = 1;
        const [x, y] = toUV(e);
        cur.x = cur.tx = x; cur.y = cur.ty = y; // appear in place, no fly-in
        hoverX = e.clientX; hoverY = e.clientY;
      }, { passive: true });
      host.addEventListener('pointerleave', () => { cur.onTarget = 0; }, { passive: true });
      host.addEventListener('pointermove', (e) => {
        const [x, y] = toUV(e);
        cur.tx = x; cur.ty = y;
        cur.onTarget = 1;
        // gentle stir while just moving (no press) — quiet, watery
        const hx = e.clientX - hoverX, hy = e.clientY - hoverY;
        if (!dragging && hx * hx + hy * hy > 1400) {
          hoverX = e.clientX; hoverY = e.clientY;
          pour(x, y, 0.10);
        }
      }, { passive: true });
      host.addEventListener('pointerdown', (e) => {
        dragging = true;
        const [x, y] = toUV(e); lastX = e.clientX; lastY = e.clientY;
        pour(x, y, 0.30);
      }, { passive: true });
      window.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        if (dx * dx + dy * dy < 220) return; // throttle by travel distance
        lastX = e.clientX; lastY = e.clientY;
        const [x, y] = toUV(e);
        pour(x, y, 0.24);
      }, { passive: true });
      window.addEventListener('pointerup', () => { dragging = false; }, { passive: true });
    }

    fitCanvas(canvas, host, gl);
    window.addEventListener('resize', () => fitCanvas(canvas, host, gl));

    let lastT = null;
    function frame(timeMs) {
      fitCanvas(canvas, host, gl);
      if (canvas.width === 0) return;
      const dt = lastT == null ? 0.016 : Math.min(0.05, (timeMs - lastT) / 1000);
      lastT = timeMs;
      for (let i = 0; i < TRAIL; i++) {
        if (trail[i * 4 + 3] > 0.001) trail[i * 4 + 2] += dt; // age
      }
      // droplet trails the pointer with liquid lag
      cur.x = lerp(cur.x, cur.tx, 0.11);
      cur.y = lerp(cur.y, cur.ty, 0.11);
      cur.on = lerp(cur.on, cur.onTarget, 0.08);
      gl.useProgram(prog);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(U.u_res, canvas.width, canvas.height);
      gl.uniform1f(U.u_time, timeMs / 1000);
      gl.uniform1f(U.u_alpha, opts.alpha != null ? opts.alpha : 1.0);
      gl.uniform3f(U.u_cursor, cur.x, cur.y, FINE_POINTER ? cur.on : 0);
      gl.uniform4fv(U.u_trail, trail);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    return { frame, pour, trail, canvas, destroy() { canvas.remove(); } };
  }

  /* ---------- GL hero carousel — the photographs become material ----------
     Displacement dissolves between slides, slow Ken Burns drift, ripples
     from the liquid trail bend the actual photo, hold-to-pause lens bulge,
     luminance-ordered unveil, film grain + vignette. Mobile hero only. */
  const CAROUSEL_FRAG = `
precision highp float;
uniform vec2  u_res;
uniform float u_time;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;
uniform float u_aspect0;
uniform float u_aspect1;
uniform float u_progress;  /* dissolve 0..1 */
uniform float u_kb0;       /* ken burns scale current */
uniform float u_kb1;       /* ken burns scale next */
uniform vec4  u_trail[${TRAIL}];
uniform vec3  u_bulge;     /* x, y (top-down uv), amount */
uniform float u_reveal;    /* luminance unveil 0..1.3 */
${GLSL_NOISE}
vec2 cover(vec2 uv, float imgAspect, float canvasAspect, float scale) {
  vec2 p = uv - 0.5;
  if (imgAspect > canvasAspect) p.x *= canvasAspect / imgAspect;
  else p.y *= imgAspect / canvasAspect;
  p /= scale;
  return p + 0.5;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  uv.y = 1.0 - uv.y;                 /* top-down, image space */
  float ca = u_res.x / u_res.y;

  /* ripple bend from the shared liquid trail (trail y is bottom-up) */
  vec2 p = vec2(uv.x * ca, 1.0 - uv.y);
  vec2 disp = vec2(0.0);
  for (int i = 0; i < ${TRAIL}; i++) {
    vec4 tr = u_trail[i];
    if (tr.w <= 0.001) continue;
    vec2 tp = vec2(tr.x * ca, tr.y);
    float d = distance(p, tp);
    float wave = sin(d * 30.0 - tr.z * 5.0) * exp(-d * 4.5) * exp(-tr.z * 1.6) * tr.w;
    disp += normalize(p - tp + vec2(1e-4)) * wave * 0.012;
  }
  vec2 buv = uv + disp;

  /* hold lens — gentle magnification around the held point */
  if (u_bulge.z > 0.001) {
    vec2 bp = u_bulge.xy;
    vec2 d2 = vec2((buv.x - bp.x) * ca, buv.y - bp.y);
    float fall = exp(-dot(d2, d2) / 0.09);
    buv = bp + (buv - bp) * (1.0 - u_bulge.z * fall);
  }

  /* displacement dissolve */
  float n = fbm(buv * 3.0 + u_time * 0.04);
  float pr = u_progress;
  float m = smoothstep(0.06, 0.94, pr);
  vec2 uvA = cover(buv, u_aspect0, ca, u_kb0) + n * 0.085 * pr;
  vec2 uvB = cover(buv, u_aspect1, ca, u_kb1) - n * 0.085 * (1.0 - pr);
  vec3 colA = texture2D(u_tex0, uvA).rgb;
  vec3 colB = texture2D(u_tex1, uvB).rgb;
  vec3 col = mix(colA, colB, m);

  /* luminance-ordered unveil — dark tones of the photo surface first */
  float alpha = 1.0;
  if (u_reveal < 1.25) {
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    alpha = smoothstep(u_reveal - 0.22, u_reveal, (1.0 - lum * 0.8) * 1.05);
  }

  /* film grain + vignette */
  float g = fract(sin(dot(gl_FragCoord.xy + u_time * 60.0, vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * 0.045;
  col *= mix(0.88, 1.0, smoothstep(1.30, 0.40, distance(uv, vec2(0.5))));

  gl_FragColor = vec4(col, alpha);
}`;

  function createHeroCarousel(host, imageUrls, sharedTrail) {
    const canvas = document.createElement('canvas');
    canvas.className = 'braid-fx-hero';
    canvas.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none;' +
      'opacity:0;transition:opacity 600ms ease;';
    host.insertBefore(canvas, host.firstChild);

    const gl = canvas.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: false, powerPreference: 'low-power' });
    if (!gl) { canvas.remove(); return null; }
    const prog = buildProgram(gl, CAROUSEL_FRAG);
    if (!prog) { canvas.remove(); return null; }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    const U = {};
    ['u_res', 'u_time', 'u_tex0', 'u_tex1', 'u_aspect0', 'u_aspect1', 'u_progress',
     'u_kb0', 'u_kb1', 'u_trail', 'u_bulge', 'u_reveal'].forEach(
      (n) => (U[n] = gl.getUniformLocation(prog, n))
    );

    const textures = [], aspects = [];
    let loaded = 0, ready = false;
    imageUrls.forEach((url, i) => {
      const img = new Image();
      img.onload = () => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        textures[i] = tex;
        aspects[i] = img.naturalWidth / img.naturalHeight;
        if (++loaded === imageUrls.length) activate();
      };
      img.src = url;
    });

    const state = {
      current: 0, next: 0,
      transStart: null,
      slideStart: performance.now(),
      bulge: [0.5, 0.5, 0], bulgeTarget: 0,
      reveal: 1.3, revealAnimating: false,
      pendingReveal: false,
    };

    function activate() {
      ready = true;
      canvas.style.opacity = '1';
      // DOM slides stay in the tree (fallback + a11y) but hand pixels to GL
      const track = host.querySelector('#reels-track');
      if (track) track.style.opacity = '0';
      if (state.pendingReveal) { state.pendingReveal = false; beginReveal(); }
    }

    function beginReveal() {
      if (!ready) { state.pendingReveal = true; state.reveal = 0; return; }
      state.reveal = 0; state.revealAnimating = true;
    }

    const TRANS_MS = 1100;
    function goTo(idx) {
      if (!ready || idx === state.current) return;
      // if mid-transition, land the previous one instantly
      if (state.transStart != null) { state.current = state.next; }
      state.next = idx;
      state.transStart = performance.now();
      state.slideStart = performance.now();
    }

    fitCanvas(canvas, host, gl);
    window.addEventListener('resize', () => fitCanvas(canvas, host, gl));

    const emptyTrail = new Float32Array(TRAIL * 4);
    function frame(timeMs) {
      if (!ready) return;
      fitCanvas(canvas, host, gl);
      if (canvas.width === 0) return;

      // dissolve progress
      let pr = 0;
      if (state.transStart != null) {
        const t = (timeMs - state.transStart) / TRANS_MS;
        if (t >= 1) { state.current = state.next; state.transStart = null; pr = 0; }
        else pr = expoOut(t);
      }

      // ken burns: slow settle-in, capped; constant overscan hides ripple pull
      const kbT = clamp((timeMs - state.slideStart) / 9000, 0, 1);
      const kb0 = 1.045 + 0.05 * kbT;
      const kb1 = 1.045;

      // hold lens spring
      state.bulge[2] = lerp(state.bulge[2], state.bulgeTarget, 0.10);

      // unveil sweep (~1.4s)
      if (state.revealAnimating) {
        state.reveal = Math.min(1.3, state.reveal + 0.0155);
        if (state.reveal >= 1.3) state.revealAnimating = false;
      }

      gl.useProgram(prog);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(U.u_res, canvas.width, canvas.height);
      gl.uniform1f(U.u_time, timeMs / 1000);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textures[state.current]);
      gl.uniform1i(U.u_tex0, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, textures[state.next]);
      gl.uniform1i(U.u_tex1, 1);
      gl.uniform1f(U.u_aspect0, aspects[state.current] || 1);
      gl.uniform1f(U.u_aspect1, aspects[state.next] || 1);
      gl.uniform1f(U.u_progress, pr);
      gl.uniform1f(U.u_kb0, kb0);
      gl.uniform1f(U.u_kb1, kb1);
      gl.uniform4fv(U.u_trail, sharedTrail || emptyTrail);
      gl.uniform3f(U.u_bulge, state.bulge[0], state.bulge[1], state.bulge[2]);
      gl.uniform1f(U.u_reveal, state.reveal);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    return {
      frame, goTo, beginReveal,
      holdAt(x, y) { state.bulge[0] = x; state.bulge[1] = y; state.bulgeTarget = 0.07; },
      release() { state.bulgeTarget = 0; },
    };
  }

  /* ---------- column depth parallax (desktop wall) ---------- */
  function setupWallDepth(hero) {
    const cols = hero.querySelectorAll('.mosaic-col');
    const depths = [7, -11, 13, -8];

    const st = { py: 0.5, pty: 0.5 };
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      st.pty = (e.clientY - r.top) / r.height;
    }, { passive: true });

    return {
      frame() {
        st.py = lerp(st.py, st.pty, 0.06);
        // shallow depth: columns drift a few px against cursor Y
        cols.forEach((col, i) => {
          col.style.transform = `translateY(${((st.py - 0.5) * (depths[i] || 8) * 2).toFixed(2)}px)`;
        });
      },
    };
  }

  /* ---------- choreographed unveil (photos develop, headline rises) ---------- */
  function setupUnveil(hero, quick) {
    const style = document.createElement('style');
    style.id = 'braid-unveil-style';
    const dur = quick ? 0.5 : 0.95;
    style.textContent = `
.braid-preveal .mosaic-tile { opacity: 0; transform: translateY(26px) scale(0.97); }
.braid-unveiled .mosaic-tile {
  opacity: 1; transform: none;
  transition: opacity ${dur}s cubic-bezier(0.19, 1, 0.22, 1), transform ${dur}s cubic-bezier(0.19, 1, 0.22, 1);
  transition-delay: var(--uv-d, 0ms);
}
.dh-line { display: block; overflow: hidden; padding: 0 0.08em 0.05em 0; margin: 0 -0.08em -0.05em 0; }
.dh-inner { display: inline-block; }
.braid-preveal .dh-inner { transform: translateY(112%) rotate(2deg); }
.braid-unveiled .dh-inner {
  transform: none;
  transition: transform 1.0s cubic-bezier(0.19, 1, 0.22, 1);
  transition-delay: var(--uv-d, 0ms);
}
.braid-preveal .live-dot, .braid-preveal .subline, .braid-preveal #scroll-cue { opacity: 0; }
.braid-unveiled .live-dot, .braid-unveiled .subline, .braid-unveiled #scroll-cue {
  opacity: 1;
  transition: opacity 0.9s ease;
  transition-delay: var(--uv-d, 0ms);
}`;
    document.head.appendChild(style);

    // split the headline into masked lines
    const h = hero.querySelector('.display-headline');
    if (h && !h.querySelector('.dh-line')) {
      const lines = [];
      let cur = '';
      h.childNodes.forEach((n) => {
        if (n.nodeName === 'BR') { lines.push(cur); cur = ''; }
        else cur += n.textContent;
      });
      if (cur.trim()) lines.push(cur);
      h.innerHTML = lines.map((l, i) =>
        `<span class="dh-line"><span class="dh-inner" style="--uv-d:${(quick ? 60 : 140) + i * (quick ? 60 : 110)}ms">${l.trim()}</span></span>`
      ).join('');
    }

    // stagger the wall in a loose diagonal sweep
    hero.querySelectorAll('.mosaic-col').forEach((col, c) => {
      col.querySelectorAll('.mosaic-tile').forEach((tile, i) => {
        tile.style.setProperty('--uv-d', `${(c * (quick ? 40 : 90) + (i % 6) * (quick ? 30 : 70))}ms`);
      });
    });
    const sub = hero.querySelector('.subline');
    if (sub) sub.style.setProperty('--uv-d', quick ? '160ms' : '420ms');
    const dot = hero.querySelector('.live-dot');
    if (dot) dot.style.setProperty('--uv-d', quick ? '100ms' : '260ms');
    const cue = hero.querySelector('#scroll-cue');
    if (cue) cue.style.setProperty('--uv-d', quick ? '260ms' : '760ms');

    hero.classList.add('braid-preveal');
    return {
      go() {
        hero.classList.add('braid-unveiled');
        // release the hidden state once the sweep completes
        setTimeout(() => hero.classList.remove('braid-preveal'), quick ? 1200 : 2600);
      },
    };
  }

  /* ---------- magnetic CTA (leans toward the cursor, settles home) ---------- */
  function setupMagnetic(selectors) {
    const magnets = [];
    selectors.forEach((sel) => {
      const el = document.querySelector(sel);
      if (!el) return;
      el.style.animation = 'none'; // suspend any CSS bounce; magnetism owns transform
      magnets.push({ el, tx: 0, ty: 0, cx: 0, cy: 0 });
    });
    if (!magnets.length) return null;

    const REACH = 150, MAX_PULL = 22;
    window.addEventListener('pointermove', (e) => {
      magnets.forEach((m) => {
        const r = m.el.getBoundingClientRect();
        const cx = r.left + r.width / 2 - m.cx, cy = r.top + r.height / 2 - m.cy;
        const dx = e.clientX - cx, dy = e.clientY - cy;
        if (dx * dx + dy * dy < REACH * REACH) {
          m.tx = clamp(dx * 0.30, -MAX_PULL, MAX_PULL);
          m.ty = clamp(dy * 0.30, -MAX_PULL, MAX_PULL);
        } else { m.tx = 0; m.ty = 0; }
      });
    }, { passive: true });

    return {
      frame() {
        magnets.forEach((m) => {
          m.cx = lerp(m.cx, m.tx, 0.12);
          m.cy = lerp(m.cy, m.ty, 0.12);
          m.el.style.transform = `translate(${m.cx.toFixed(2)}px, ${m.cy.toFixed(2)}px)`;
        });
      },
    };
  }

  /* ---------- gesture-teaching cursor chip ("Drag" over the hero) ---------- */
  function setupChip(hero, screen) {
    let learned = false;
    try { learned = !!sessionStorage.getItem('braid_drag_done'); } catch (e) {}
    if (learned) return null;

    const chip = document.createElement('div');
    chip.className = 'braid-chip';
    chip.textContent = 'Drag';
    chip.style.cssText =
      'position:absolute;z-index:95;pointer-events:none;padding:7px 14px;border-radius:999px;' +
      'background:rgba(24,23,44,0.55);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);' +
      'border:1px solid rgba(200,188,246,0.4);color:#C8BCF6;font:500 10px/1 Inter,sans-serif;' +
      'letter-spacing:0.18em;text-transform:uppercase;opacity:0;transition:opacity 300ms ease;' +
      'transform:translate(-50%,-50%);left:0;top:0;';
    screen.appendChild(chip);

    const st = { x: 0, y: 0, tx: 0, ty: 0, show: false, dead: false };
    let downX = 0, downY = 0, down = false;

    hero.addEventListener('pointermove', (e) => {
      const r = screen.getBoundingClientRect();
      st.tx = e.clientX - r.left + 18;
      st.ty = e.clientY - r.top + 22;
      const overUi = e.target.closest && e.target.closest('.reels-nav, #scroll-cue, .glass-circle, .glass-pill, .hero-text');
      st.show = !overUi;
    }, { passive: true });
    hero.addEventListener('pointerleave', () => { st.show = false; });
    hero.addEventListener('pointerdown', (e) => { down = true; downX = e.clientX; downY = e.clientY; }, { passive: true });
    window.addEventListener('pointermove', (e) => {
      if (!down || st.dead) return;
      const dx = e.clientX - downX, dy = e.clientY - downY;
      if (dx * dx + dy * dy > 2500) { // a real drag happened — lesson over
        down = false; st.dead = true;
        try { sessionStorage.setItem('braid_drag_done', '1'); } catch (err) {}
        chip.style.opacity = '0';
        setTimeout(() => chip.remove(), 400);
      }
    }, { passive: true });
    window.addEventListener('pointerup', () => { down = false; }, { passive: true });

    return {
      frame() {
        if (st.dead) return;
        st.x = lerp(st.x, st.tx, 0.16);
        st.y = lerp(st.y, st.ty, 0.16);
        chip.style.left = st.x + 'px';
        chip.style.top = st.y + 'px';
        chip.style.opacity = st.show ? '1' : '0';
      },
    };
  }

  /* ---------- first-load intro screen (glowing logo over liquid) ---------- */
  function showIntro(screen, opts, onRelease) {
    let seen = false;
    try {
      seen = !!sessionStorage.getItem('braid_intro_seen');
      if (!seen) sessionStorage.setItem('braid_intro_seen', '1');
    } catch (e) { /* private mode — still show once */ }
    if (seen) { if (onRelease) onRelease(true); return null; }

    if (!document.getElementById('braid-intro-style')) {
      const st = document.createElement('style');
      st.id = 'braid-intro-style';
      st.textContent =
        '.braid-intro{position:absolute;inset:0;z-index:300;background:#18172C;' +
        'display:flex;align-items:center;justify-content:center;overflow:hidden;' +
        'transition:opacity 750ms ease;}' +
        '.braid-intro img{height:72px;position:relative;z-index:2;' +
        'animation:braidIntroGlow 1.7s ease-in-out infinite alternate;}' +
        '@keyframes braidIntroGlow{' +
        'from{filter:drop-shadow(0 0 10px rgba(200,188,246,0.40)) drop-shadow(0 0 30px rgba(90,25,155,0.30));transform:scale(1);}' +
        'to{filter:drop-shadow(0 0 22px rgba(226,197,255,0.95)) drop-shadow(0 0 54px rgba(90,25,155,0.55));transform:scale(1.04);}}' +
        '@media (prefers-reduced-motion: reduce){.braid-intro img{animation:none;' +
        'filter:drop-shadow(0 0 16px rgba(200,188,246,0.7));}}';
      document.head.appendChild(st);
    }

    const overlay = document.createElement('div');
    overlay.className = 'braid-intro';
    const img = document.createElement('img');
    img.src = opts.logo; img.alt = 'Braid';
    overlay.appendChild(img);
    screen.appendChild(overlay);

    const liquid = REDUCED ? null : createLiquid(overlay, { z: 1, alpha: 0.85, interactive: false });

    let done = false;
    const hold = REDUCED ? 900 : 2400;
    setTimeout(() => {
      overlay.style.opacity = '0';
      if (onRelease) onRelease(false); // the hero develops beneath the fading overlay
    }, hold);
    setTimeout(() => { done = true; overlay.remove(); if (liquid) liquid.destroy(); }, hold + 800);

    // slow synthetic swirl so the liquid moves on its own
    let lastPour = 0;
    return {
      frame(time) {
        if (done) return true;
        if (liquid) {
          if (time - lastPour > 420) {
            lastPour = time;
            const t = time / 1000;
            liquid.pour(
              0.5 + 0.30 * Math.sin(t * 0.55),
              0.5 + 0.24 * Math.sin(t * 0.83 + 1.7),
              0.5
            );
          }
          liquid.frame(time);
        }
        return false;
      },
    };
  }

  /* ---------- scroll-synced reveals & parallax ---------- */
  function collectReveals(config) {
    const items = [];
    (config.reveal || []).forEach((group) => {
      document.querySelectorAll(group.selector).forEach((el, i) => {
        el.style.willChange = 'transform, opacity';
        items.push({ el, offset: i * (group.stagger || 0) });
      });
    });
    return items;
  }

  function applyReveals(items, vh) {
    for (const it of items) {
      const rect = it.el.getBoundingClientRect();
      const start = vh * 0.96 - it.offset;
      const p = clamp((start - rect.top) / (vh * 0.30), 0, 1);
      const e = 1 - Math.pow(1 - p, 3);
      if (e >= 0.999) {
        // fully revealed — release inline styles so CSS hover states work
        if (!it.done) { it.el.style.opacity = ''; it.el.style.transform = ''; it.done = true; }
      } else {
        it.done = false;
        it.el.style.opacity = e.toFixed(3);
        it.el.style.transform = `translateY(${((1 - e) * 34).toFixed(2)}px) scale(${(0.975 + 0.025 * e).toFixed(4)})`;
      }
    }
  }

  function applyParallax(config, scrollY) {
    for (const par of config._parallax) {
      par.el.style.transform = `translateY(${(scrollY * par.speed).toFixed(2)}px)`;
    }
  }

  /* ---------- public init ---------- */
  window.BraidFX = {
    lenis: null,
    heroSlide: null,
    init(config) {
      const wrapper = document.querySelector(config.wrapper || '#scroll-container');
      const screen = document.querySelector(config.host || '.screen');
      if (!wrapper || !screen) return;

      // layer content above the glow canvas
      wrapper.style.position = 'relative';
      wrapper.style.zIndex = '1';

      const stops = config.colorStops || [[0, '#18172C'], [1, '#100F22']];
      const glow = createGlow(screen, stops);

      // liquid swipe layer — hero only, never the product area
      let liquid = null;
      const heroEl = config.liquid ? document.querySelector(config.liquid.host) : null;
      if (heroEl && !REDUCED) {
        liquid = createLiquid(heroEl, { z: config.liquid.z != null ? config.liquid.z : 3, alpha: 1.0, interactive: true });
      }

      // GL hero carousel — mobile hero photos become living material
      let heroCar = null;
      if (config.heroCarousel && heroEl && !REDUCED && !DESKTOP) {
        heroCar = createHeroCarousel(heroEl, config.heroCarousel.images, liquid ? liquid.trail : null);
        if (heroCar) {
          this.heroSlide = (idx) => heroCar.goTo(idx);
          // press-and-hold: pause the reel, gently swell the photo under the touch
          let holdTimer = null, holdOrigin = null;
          heroEl.addEventListener('pointerdown', (e) => {
            const r = heroEl.getBoundingClientRect();
            holdOrigin = [e.clientX, e.clientY];
            clearTimeout(holdTimer);
            holdTimer = setTimeout(() => {
              heroCar.holdAt((holdOrigin[0] - r.left) / r.width, (holdOrigin[1] - r.top) / r.height);
              if (window.__braidHero) window.__braidHero.pause();
            }, 260);
          }, { passive: true });
          const endHold = () => {
            clearTimeout(holdTimer);
            holdOrigin = null;
            heroCar.release();
            if (window.__braidHero) window.__braidHero.resume();
          };
          window.addEventListener('pointerup', endHold, { passive: true });
          window.addEventListener('pointercancel', endHold, { passive: true });
          window.addEventListener('pointermove', (e) => {
            if (!holdOrigin) return;
            const dx = e.clientX - holdOrigin[0], dy = e.clientY - holdOrigin[1];
            if (dx * dx + dy * dy > 900) clearTimeout(holdTimer); // moved — it's a swipe, not a hold
          }, { passive: true });
        }
      }

      // column depth parallax — desktop wall with a fine pointer
      let wallDepth = null;
      if (config.wallDepth && heroEl && DESKTOP && FINE_POINTER && !REDUCED) {
        wallDepth = setupWallDepth(heroEl);
      }

      // magnetic CTA + gesture chip — desktop only
      let magnetic = null, chip = null;
      if (FINE_POINTER && !REDUCED) {
        if (config.magnetic) magnetic = setupMagnetic(config.magnetic);
        if (config.chip && heroEl && DESKTOP) chip = setupChip(heroEl, screen);
      }

      // choreographed unveil — full sweep on first visit, quick on repeats
      let unveil = null, firstVisit = true;
      try { firstVisit = !sessionStorage.getItem('braid_intro_seen'); } catch (e) {}
      if (config.unveil && heroEl && !REDUCED) {
        unveil = setupUnveil(heroEl, !firstVisit);
      }

      // first-open load screen; the hero develops as the overlay fades
      let intro = null;
      const releaseUnveil = () => {
        if (unveil) unveil.go();
        if (heroCar) heroCar.beginReveal();
      };
      if (config.intro) {
        intro = showIntro(screen, config.intro, (skipped) => {
          if (skipped) setTimeout(releaseUnveil, 250);
          else releaseUnveil();
        });
      } else if (unveil || heroCar) {
        setTimeout(releaseUnveil, 300);
      }

      // wrap children so Lenis can measure a single content element
      let content = wrapper.querySelector(':scope > .braid-fx-content');
      if (!content) {
        content = document.createElement('div');
        content.className = 'braid-fx-content';
        while (wrapper.firstChild) content.appendChild(wrapper.firstChild);
        wrapper.appendChild(content);
      }

      if (!REDUCED && window.Lenis) {
        this.lenis = new Lenis({
          wrapper, content,
          lerp: 0.09,
          smoothWheel: true,
          syncTouch: false,
        });
        this.lenis.on('scroll', (e) => { if (glow) glow.kick(e.velocity); });
      }

      const reveals = REDUCED ? [] : collectReveals(config);
      config._parallax = [];
      if (!REDUCED) {
        (config.parallax || []).forEach((g) => {
          document.querySelectorAll(g.selector).forEach((el) => {
            el.style.willChange = 'transform';
            config._parallax.push({ el, speed: g.speed });
          });
        });
      }

      // direction-aware snap between hero and the grid: commit to whichever
      // side the user is heading toward; never interferes inside the grid.
      // Desktop-only — touch devices use native CSS scroll snap instead
      // (iOS momentum sends pointercancel + reverse deltas that misfire this).
      const snapHero = (config.heroSnap && FINE_POINTER) ? document.querySelector(config.heroSnap) : null;
      if (snapHero && this.lenis) {
        let snapTimer = null, snapping = false, lastY = wrapper.scrollTop, dirDown = true, pointerHeld = false;
        wrapper.addEventListener('pointerdown', () => { pointerHeld = true; }, { passive: true });
        window.addEventListener('pointerup', () => { pointerHeld = false; }, { passive: true });
        window.addEventListener('pointercancel', () => { pointerHeld = false; }, { passive: true });
        const trySnap = () => {
          if (snapping || pointerHeld) return;
          const y = wrapper.scrollTop, hh = snapHero.offsetHeight;
          if (y <= 2 || y >= hh - 2) return; // settled — nothing to do
          const target = dirDown
            ? (y > hh * 0.12 ? hh : 0)
            : (y < hh * 0.88 ? 0 : hh);
          snapping = true;
          this.lenis.scrollTo(target, {
            duration: 0.9,
            easing: (t) => 1 - Math.pow(1 - t, 3),
            onComplete: () => { snapping = false; },
          });
          setTimeout(() => { snapping = false; }, 1200); // safety net if interrupted
        };
        wrapper.addEventListener('scroll', () => {
          const y = wrapper.scrollTop;
          if (Math.abs(y - lastY) > 0.5) dirDown = y > lastY;
          lastY = y;
          if (snapping) return;
          clearTimeout(snapTimer);
          snapTimer = setTimeout(trySnap, 160);
        }, { passive: true });
      }

      const raf = (time) => {
        if (this.lenis) this.lenis.raf(time);
        const max = Math.max(1, wrapper.scrollHeight - wrapper.clientHeight);
        const y = wrapper.scrollTop;
        if (glow) {
          glow.setProgress(y / max);
          glow.frame(time);
        }
        if (heroCar) heroCar.frame(time);
        if (liquid) liquid.frame(time);
        if (wallDepth) wallDepth.frame();
        if (magnetic) magnetic.frame();
        if (chip) chip.frame();
        if (intro && intro.frame(time)) intro = null;
        if (reveals.length) applyReveals(reveals, wrapper.clientHeight);
        if (config._parallax.length) applyParallax(config, y);
        requestAnimationFrame(raf);
      };
      requestAnimationFrame(raf);
    },
  };
})();
