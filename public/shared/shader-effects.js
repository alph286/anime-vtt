// Vertex shader condiviso da ogni effetto: un solo triangolo che copre
// l'intero viewport (trucco standard "fullscreen triangle"), nessun
// vertex buffer necessario -- le posizioni sono nel array `positions`,
// indicizzato da gl_VertexID.
const SHADER_VERTEX_SRC = `#version 300 es
const vec2 positions[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2(3.0, -1.0),
  vec2(-1.0, 3.0)
);
void main() {
  gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
}
`;

// Corpo GLSL condiviso dalle varianti colore del Portale -- l'unica
// differenza tra le varianti e' la palette in `col`, parametrizzata qui
// per non duplicare ~100 righe di shader identiche.
function portalFragmentSrc(colorGlsl) {
  return `#version 300 es
precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_viewportOrigin;
uniform sampler2D u_noise;

out vec4 fragColor;

// Noise animation - Electric
// by nimitz (stormoid.com) (twitter: @stormoid)
// modified to look like a portal by Pleh
// fbm tweaks by foxes
#define time u_time*0.15
#define tau 6.2831853

mat2 makem2(in float theta){float c = cos(theta);float s = sin(theta);return mat2(c,-s,s,c);}
float noise( in vec2 x ){return texture(u_noise, x*.01).x;}

float fbm(in vec2 p)
{
vec4 tt=fract(vec4(time*2.)+vec4(0.0,0.25,0.5,0.75));
vec2 p1=p-normalize(p)*tt.x;
vec2 p2=vec2(1.0)+p-normalize(p)*tt.y;
vec2 p3=vec2(2.0)+p-normalize(p)*tt.z;
vec2 p4=vec2(3.0)+p-normalize(p)*tt.w;
vec4 tr=vec4(1.0)-abs(tt-vec4(0.5))*2.0;
float z=2.;
vec4 rz = vec4(0.);
for (float i= 1.;i < 4.;i++)
{
rz+= abs((vec4(noise(p1),noise(p2),noise(p3),noise(p4))-vec4(0.5))*2.)/z;
z = z*2.;
p1 = p1*2.;
p2 = p2*2.;
p3 = p3*2.;
p4 = p4*2.;
}
return dot(rz,tr)*0.25;
}

float dualfbm(in vec2 p)
{
vec2 p2 = p*.7;
vec2 basis = vec2(fbm(p2-time*1.6),fbm(p2+time*1.7));
basis = (basis-.5)*.2;
p += basis;
return fbm(p);
}

float circ(vec2 p)
{
float r = length(p);
r = log(sqrt(r));
return abs(mod(r*2.,tau)-4.54)*3.+.5;
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
vec2 p = fragCoord.xy / u_resolution.xy-0.5;
// Niente correzione di aspect-ratio qui: la decorazione e' un
// rettangolo che il DM ridimensiona liberamente in larghezza/altezza
// indipendenti, quindi l'effetto deve adattarsi/allungarsi seguendo
// quella forma invece di restare sempre proporzionato "fisicamente".
p*=4.;

float rz = dualfbm(p);
rz *= abs((-circ(vec2(p.x / 4.2, p.y / 7.0))));
rz *= abs((-circ(vec2(p.x / 4.2, p.y / 7.0))));
rz *= abs((-circ(vec2(p.x / 4.2, p.y / 7.0))));

vec3 col = ${colorGlsl}/rz;
col=pow(abs(col),vec3(.99));
fragColor = vec4(col,1.);
}

void main() {
  // gl_FragCoord e' relativo all'intero framebuffer/canvas, non al
  // rettangolo passato a gl.viewport() per questa decorazione -- va
  // riportato a coordinate locali sottraendo l'origine del viewport,
  // altrimenti l'effetto (centrato vicino a p=0) non cade mai dentro
  // decorazioni piccole o non allineate all'origine del canvas.
  vec2 fragCoord = gl_FragCoord.xy - u_viewportOrigin;
  vec4 col;
  mainImage(col, fragCoord);

  // Lo sfondo scuro dell'effetto diventa trasparente (si vede la mappa
  // sotto) invece di nero opaco; la luminosita' stessa del colore guida
  // l'alpha. Vicino al bordo del rettangolo l'effetto si spegne
  // gradualmente (fade), cosi' non si vede tagliato netto sul confine
  // della decorazione.
  vec2 uv = fragCoord / u_resolution - 0.5;
  float edgeFade = 1.0 - smoothstep(0.32, 0.5, max(abs(uv.x), abs(uv.y)));
  float alpha = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0) * edgeFade;
  // Il canvas usa alpha premoltiplicato (default WebGL): rgb va scalato
  // per l'alpha finale, non solo per il fade, altrimenti i bordi
  // risultano piu' chiari del dovuto durante la composizione.
  fragColor = vec4(col.rgb * alpha, alpha);
}
`;
}

const SHADER_EFFECTS = {
  portal: {
    label: 'Portale',
    usesNoiseTexture: true,
    fragmentSrc: portalFragmentSrc('vec3(.1,0.1,0.4)')
  },
  portal_red: {
    label: 'Portale (rosso)',
    usesNoiseTexture: true,
    fragmentSrc: portalFragmentSrc('vec3(.4,0.1,0.1)')
  }
};

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Errore di compilazione shader: ${info}`);
  }
  return shader;
}

function linkProgram(gl, vertexSrc, fragmentSrc) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSrc);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSrc);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Errore di link shader: ${info}`);
  }
  return program;
}

// Renderizza le decorazioni shader di una location su un <canvas> dedicato,
// riusato identico da /editor (anteprima live), /control e /display. Se
// WebGL2 non è disponibile `available` è false e `render()` è un no-op
// silenzioso -- non ci aspettiamo che capiti sull'hardware reale (Raspberry
// Pi 4 + Chromium, già verificato dall'utente), ma niente pagina bianca se
// succede.
class ShaderLayer {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.gl = canvasEl.getContext('webgl2');
    this.programs = new Map(); // shaderId -> WebGLProgram
    this.noiseTexture = null;
    this.lastCssW = 0;
    this.lastCssH = 0;
  }

  get available() {
    return Boolean(this.gl);
  }

  getProgram(shaderId) {
    if (this.programs.has(shaderId)) return this.programs.get(shaderId);
    const def = SHADER_EFFECTS[shaderId];
    if (!def) return null;
    try {
      const program = linkProgram(this.gl, SHADER_VERTEX_SRC, def.fragmentSrc);
      this.programs.set(shaderId, program);
      return program;
    } catch (err) {
      console.warn(`ShaderLayer: impossibile compilare/linkare lo shader "${shaderId}": ${err.message}`);
      this.programs.set(shaderId, null);
      return null;
    }
  }

  ensureNoiseTexture() {
    if (this.noiseTexture) return this.noiseTexture;
    const gl = this.gl;
    const size = 256;
    const data = new Uint8Array(size * size);
    for (let i = 0; i < data.length; i++) data[i] = Math.floor(Math.random() * 256);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, size, size, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.noiseTexture = texture;
    return texture;
  }

  // Va richiamato a ogni render, non solo alla creazione: ridimensiona il
  // buffer interno del canvas alla sua dimensione CSS reale (moltiplicata
  // per devicePixelRatio, per non sfocare su schermi ad alta densità).
  // Senza questo il canvas resta bloccato alla prima misura presa, anche se
  // il contenitore cambia dimensione dopo.
  syncCanvasSize() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(1, Math.round(this.canvas.clientWidth));
    const cssH = Math.max(1, Math.round(this.canvas.clientHeight));
    if (cssW === this.lastCssW && cssH === this.lastCssH) return;
    this.lastCssW = cssW;
    this.lastCssH = cssH;
    this.canvas.width = Math.max(1, Math.round(cssW * dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * dpr));
  }

  // `decorations`: array di `{ id, shaderId, x, y, widthM, heightM }`.
  render(decorations, grid, naturalW, naturalH) {
    if (!this.available || !naturalW || !naturalH) return;
    const gl = this.gl;
    this.syncCanvasSize();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!decorations.length) return;

    const time = performance.now() / 1000;

    decorations.forEach((deco) => {
      const def = SHADER_EFFECTS[deco.shaderId];
      if (!def) return;
      const program = this.getProgram(deco.shaderId);
      if (!program) return;
      const rectPct = shaderDecorationRectPercent(deco, grid, naturalW, naturalH);

      const xPx = (rectPct.leftPct / 100) * this.canvas.width;
      const topPx = (rectPct.topPct / 100) * this.canvas.height;
      const wPx = Math.max(1, Math.round((rectPct.widthPct / 100) * this.canvas.width));
      const hPx = Math.max(1, Math.round((rectPct.heightPct / 100) * this.canvas.height));
      // gl.viewport usa origine in basso a sinistra, la nostra percentuale
      // è in alto a sinistra (come il DOM/CSS): l'asse Y va invertito.
      const yPx = Math.round(this.canvas.height - topPx - hPx);

      const originXPx = Math.round(xPx);
      gl.viewport(originXPx, yPx, wPx, hPx);
      gl.useProgram(program);
      gl.uniform1f(gl.getUniformLocation(program, 'u_time'), time);
      gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), wPx, hPx);
      gl.uniform2f(gl.getUniformLocation(program, 'u_viewportOrigin'), originXPx, yPx);
      if (def.usesNoiseTexture) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.ensureNoiseTexture());
        gl.uniform1i(gl.getUniformLocation(program, 'u_noise'), 0);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
  }
}
