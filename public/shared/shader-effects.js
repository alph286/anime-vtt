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

// Avvolge un mainImage "autosufficiente" (alpha già calcolato nel colore
// finale premoltiplicato -- stesso stile dei fuochi già portati per le
// AoE in AOE_SHADER_EFFECTS più sotto, dove `fragColor = vec4(col*alpha,
// alpha)` arriva già scritto dentro il mainImage stesso) per una
// decorazione rettangolare piazzata da /editor. Più semplice di
// portalFragmentSrc: niente texture di rumore, niente edge-fade
// aggiuntivo -- la dissolvenza radiale del fuoco stesso arriva già vicino
// a zero prima del bordo del rettangolo, quindi non serve nasconderlo di
// nuovo. Stesso adattamento "si allunga seguendo la forma" già scelto per
// il Portale: un rettangolo non quadrato stira il cerchio invece di
// restare sempre circolare, comportamento voluto (vedi commento in
// portalFragmentSrc).
function decorationFragmentSrc(mainImageGlsl) {
  return `#version 300 es
precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_viewportOrigin;

out vec4 fragColor;

${mainImageGlsl}

void main() {
  vec2 fragCoord = gl_FragCoord.xy - u_viewportOrigin;
  vec4 col;
  mainImage(col, fragCoord);
  fragColor = col;
}
`;
}

// Cerchi magici, portati da github.com/alph286/shaders (magic-circle-*.html):
// un solo pass, le tre varianti differiscono solo per la tinta.
function magicCircleFragmentSrc(tintGlsl) {
  return decorationFragmentSrc(`
#define PI 3.14159265359

// Tinta dell'intero cerchio (unica differenza tra le tre varianti).
const vec3 TINT = ${tintGlsl};



vec2 rotate(vec2 p, float rad) {
    mat2 m = mat2(cos(rad), sin(rad), -sin(rad), cos(rad));
    return m * p;
}

vec2 translate(vec2 p, vec2 diff) {
    return p - diff;
}

vec2 scale(vec2 p, float r) {
    return p*r;
}

float circle(float pre, vec2 p, float r1, float r2, float power) {
    float leng = length(p);
    float d = min(abs(leng-r1), abs(leng-r2));
    if (r1<leng && leng<r2) pre /= exp(d)/r2;
    float res = power / d;
    return clamp(pre + res, 0.0, 1.0);
}

float rectangle(float pre, vec2 p, vec2 half1, vec2 half2, float power) {
    p = abs(p);
    if ((half1.x<p.x || half1.y<p.y) && (p.x<half2.x && p.y<half2.y)) {
        pre = max(0.01, pre);
    }
    float dx1 = (p.y < half1.y) ? abs(half1.x-p.x) : length(p-half1);
    float dx2 = (p.y < half2.y) ? abs(half2.x-p.x) : length(p-half2);
    float dy1 = (p.x < half1.x) ? abs(half1.y-p.y) : length(p-half1);
    float dy2 = (p.x < half2.x) ? abs(half2.y-p.y) : length(p-half2);
    float d = min(min(dx1, dx2), min(dy1, dy2));
    float res = power / d;
    return clamp(pre + res, 0.0, 1.0);
}

float radiation(float pre, vec2 p, float r1, float r2, int num, float power) {
    float angle = 2.0*PI/float(num);
    float d = 1e10;
    for(int i=0; i<360; i++) {
        if (i>=num) break;
        float _d = (r1<p.y && p.y<r2) ?
            abs(p.x) :
            min(length(p-vec2(0.0, r1)), length(p-vec2(0.0, r2)));
        d = min(d, _d);
        p = rotate(p, angle);
    }
    float res = power / d;
    return clamp(pre + res, 0.0, 1.0);
}

float calc(vec2 p) {
    float dst = 0.0;
    p = scale(p, sin(PI*u_time/1.0)*0.02+1.1);
    {
        vec2 q = p;
        q = rotate(q, u_time * PI / 6.0);
        dst = circle(dst, q, 0.85, 0.9, 0.006);
        dst = radiation(dst, q, 0.87, 0.88, 36, 0.0008);
    }
    {
        vec2 q = p;
        q = rotate(q, u_time * PI / 6.0);
        const int n = 6;
        float angle = PI / float(n);
        q = rotate(q, floor(atan(q.x, q.y)/angle + 0.5) * angle);
        for(int i=0; i<n; i++) {
            dst = rectangle(dst, q, vec2(0.85/sqrt(2.0)), vec2(0.85/sqrt(2.0)), 0.0015);
            q = rotate(q, angle);
        }
    }
    {
        vec2 q = p;
        q = rotate(q, u_time * PI / 6.0);
        const int n = 12;
        q = rotate(q, 2.0*PI/float(n)/2.0);
        float angle = 2.0*PI / float(n);
        for(int i=0; i<n; i++) {
            dst = circle(dst, q-vec2(0.0, 0.875), 0.001, 0.05, 0.004);
            dst = circle(dst, q-vec2(0.0, 0.875), 0.001, 0.001, 0.008);
            q = rotate(q, angle);
        }
    }
    {
        vec2 q = p;
        dst = circle(dst, q, 0.5, 0.55, 0.002);
    }
    {
        vec2 q = p;
        q = rotate(q, -u_time * PI / 6.0);
        const int n = 3;
        float angle = PI / float(n);
        q = rotate(q, floor(atan(q.x, q.y)/angle + 0.5) * angle);
        for(int i=0; i<n; i++) {
            dst = rectangle(dst, q, vec2(0.36, 0.36), vec2(0.36, 0.36), 0.0015);
            q = rotate(q, angle);
        }
    }
    {
        vec2 q = p;
        q = rotate(q, -u_time * PI / 6.0);
        const int n = 12;
        q = rotate(q, 2.0*PI/float(n)/2.0);
        float angle = 2.0*PI / float(n);
        for(int i=0; i<n; i++) {
            dst = circle(dst, q-vec2(0.0, 0.53), 0.001, 0.035, 0.004);
            dst = circle(dst, q-vec2(0.0, 0.53), 0.001, 0.001, 0.001);
            q = rotate(q, angle);
        }
    }
    {
        vec2 q = p;
        q = rotate(q, u_time * PI / 6.0);
        dst = radiation(dst, q, 0.25, 0.3, 12, 0.005);
    }
    {
        vec2 q = p;
        q = scale(q, sin(PI*u_time/1.0)*0.04+1.1);
        q = rotate(q, -u_time * PI / 6.0);
        for(float i=0.0; i<6.0; i++) {
            float r = 0.13-i*0.01;
            q = translate(q, vec2(0.1, 0.0));
            dst = circle(dst, q, r, r, 0.002);
            q = translate(q, -vec2(0.1, 0.0));
            q = rotate(q, -u_time * PI / 12.0);
        }
        dst = circle(dst, q, 0.04, 0.04, 0.004);
    }
    return pow(dst, 2.5);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    // Coordinate normalizzate sul lato corto, come nell'originale: il cerchio
    // resta circolare anche in un rettangolo non quadrato (a differenza del
    // Portale, che si stira). Lo sfondo nero e' alpha 0, la luminosita' guida
    // l'alpha.
    vec2 uv = (u_resolution.xy - fragCoord.xy*2.0) / min(u_resolution.x, u_resolution.y);
    float a = calc(uv);
    fragColor = vec4(TINT * a, a);
}
`);
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
  },
  magic_circle_red: { label: 'Cerchio magico (rosso)', fragmentSrc: magicCircleFragmentSrc('vec3(1.0, 0.18, 0.12)') },
  magic_circle_blue: { label: 'Cerchio magico (blu)', fragmentSrc: magicCircleFragmentSrc('vec3(0.15, 0.45, 1.0)') },
  magic_circle_green: { label: 'Cerchio magico (verde)', fragmentSrc: magicCircleFragmentSrc('vec3(0.2, 1.0, 0.35)') },
  // Stesso mainImage del fuoco verde già portato per le AoE (vedi
  // AOE_SHADER_EFFECTS.green_fire più sotto) -- qui wrappato per una
  // decorazione rettangolare fissa invece che per una sagoma AoE
  // ritagliata, richiesta esplicita dell'utente per riusare uno shader
  // già fatto invece di portarne uno nuovo dal repo sorgente.
  green_fire: {
    label: 'Fuoco verde',
    fragmentSrc: decorationFragmentSrc(`
// ---- Hash / Noise (procedural-noise technique) ----
float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 x) {
    vec2 p = floor(x);
    vec2 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(p + vec2(0.0, 0.0));
    float b = hash(p + vec2(1.0, 0.0));
    float c = hash(p + vec2(0.0, 1.0));
    float d = hash(p + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

const mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p) {
    float f = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
        f += a * noise(p);
        p = m * p;
        a *= 0.5;
    }
    return f;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 p = (2.0 * fragCoord - u_resolution.xy) / u_resolution.y;
    float t = u_time;

    float rad = length(p);

    // cartesian domain warp for organic turbulence — built only from p
    // and time (no angle, no radial-line sampling), so it never seams
    // and never collapses into a "sunburst"/pinwheel near the center
    vec2 q = p * 2.4;
    vec2 warpA = vec2(fbm(q + vec2(0.0, -t * 0.35)), fbm(q + vec2(5.1, t * 0.28)));
    vec2 warped = q + (warpA - 0.5) * 1.6;

    float flame = fbm(warped * 1.7);
    flame = mix(flame, fbm(warped * 3.0 + warpA * 1.8), 0.35);
    flame = clamp(flame * 1.15, 0.0, 1.0);

    // traveling ring wave: phase depends on (radius - time), so rings of
    // brightness continuously expand from the center outward — this is
    // what actually reads as "flames flowing from the center to the rim"
    float ring = 0.5 + 0.5 * sin(rad * 10.0 - t * 3.0 + flame * 4.0);
    flame = mix(flame, clamp(flame * 0.6 + ring * 0.7, 0.0, 1.0), 0.6);

    // soft, feathered falloff instead of a hard circle edge — the shape
    // dissolves gradually into transparency (top-down brazier glow).
    // Opacity comes mostly from this shape term, only lightly touched by
    // the flame noise, so the fire never breaks up into dark "holes".
    float baseRadius = 0.48;
    float feather = 0.4;
    float radialFalloff = 1.0 - smoothstep(baseRadius - feather, baseRadius + feather, rad);
    float density = radialFalloff * (0.75 + 0.25 * flame);
    density = clamp(density, 0.0, 1.0);

    // brightness never drops to black — it only ranges from a dim green
    // glow up to a hot flare, so it always reads as fire, never as smoke
    float heat = mix(0.3, 0.85, flame);

    // small, soft ember glow right at the center — a brightness boost,
    // not a flat white disc, so the flame texture stays visible
    float core = smoothstep(0.24, 0.0, rad);
    heat = clamp(heat + core * core * 0.35, 0.0, 1.0);

    // green fire palette: deep green base -> vivid green -> pale yellow-green hot spots
    vec3 col;
    col.r = pow(heat, 2.2) * 0.45;
    col.g = 0.26 + heat * 0.85;
    col.b = pow(heat, 3.2) * 0.22;
    col = clamp(col, 0.0, 1.0);

    float alpha = density;
    fragColor = vec4(col * alpha, alpha);
}
`)
  }
};

// Avvolge uno shader "ad area" portato da github.com/alph286/shaders (fuoco/
// fumo/luce/ecc, ognuno autosufficiente: hash/noise/fbm propri, mai in
// collisione tra loro perché ogni voce del registry compila come programma
// WebGL indipendente -- vedi AoeShaderLayer.getProgram) con due aggiunte
// comuni a tutti: la convenzione u_viewportOrigin già usata dal Portale
// (gl_FragCoord è relativo all'intero framebuffer, non al rettangolo
// passato a gl.viewport() per questa singola AoE) e un RITAGLIO sulla vera
// sagoma dell'AoE (vedi aoeMaskContains sotto) -- senza il ritaglio, un
// cono o una linea ruotata mostrerebbero lo shader riempire l'intero
// bounding box rettangolare invece della sagoma triangolare/rettangolare
// vera. Ogni shader porta la propria `mainImage(out vec4, in vec2)`
// (stessa firma Shadertoy-style già usata dal file originale), invariata:
// il ritaglio avviene DOPO, sul colore finale, non dentro la logica di
// ciascun effetto -- non serve ritoccare le costanti/i raggi che ciascun
// autore ha calibrato per il proprio shader.
// Dove, in "unità p" (vedi u_fillScale in aoeEffectFragmentSrc), la
// dissolvenza di questi shader (tutti della forma
// `1-smoothstep(base-feather, base+feather, rad)`) è arrivata solo a MEZZA
// intensità, non dove tocca zero -- `base+feather` (dove la densità è già
// invisibile) non va bene come bersaglio: il punto più lontano della
// sagoma vera finirebbe comunque nero. "A mezza intensità" lascia invece
// il punto più lontano ancora visibilmente acceso (non al massimo, ma
// riconoscibile), con una dissolvenza morbida verso quel bordo invece di
// un buco nero -- media dei `base` calibrati dai vari autori (0.48 per i
// 4 fuochi, 0.5 moonbeam, 0.42 luce divina, 0.55 fumo).
const AOE_FILL_TARGET_REACH = 0.55;

function aoeEffectFragmentSrc(mainImageGlsl) {
  return `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_viewportOrigin;
uniform vec2 u_maskPoints[32];
uniform int u_maskCount;
uniform float u_fillScale;
// Sistema di coordinate "srotolato" per Cono/Linea (vedi
// aoeShapeWarpParams in questo stesso file) -- u_shapeWarp a 0 su
// Cubo/Sfera, che non ne hanno bisogno.
uniform int u_shapeWarp;
uniform vec2 u_shapeOrigin;
uniform vec2 u_shapeAxis;
uniform float u_shapeLength;
uniform float u_shapeNearHalfWidth;
uniform float u_shapeFarHalfWidth;

out vec4 fragColor;

${mainImageGlsl}

// Ray-casting pari/dispari in pixel reali locali al rettangolo, stesso
// sistema top-down di u_maskPoints (vedi aoeShaderMaskRect in media.js).
// u_maskCount a 0 significa "nessuna sagoma nota" (rete di sicurezza):
// meglio mostrare l'intero rettangolo che niente.
bool aoeMaskContains(vec2 p) {
  if (u_maskCount == 0) return true;
  bool inside = false;
  int j = u_maskCount - 1;
  for (int i = 0; i < 32; i++) {
    if (i >= u_maskCount) break;
    vec2 pi = u_maskPoints[i];
    vec2 pj = u_maskPoints[j];
    if (((pi.y > p.y) != (pj.y > p.y)) &&
        (p.x < (pj.x - pi.x) * (p.y - pi.y) / (pj.y - pi.y) + pi.x)) {
      inside = !inside;
    }
    j = i;
  }
  return inside;
}

void main() {
  vec2 fragCoord = gl_FragCoord.xy - u_viewportOrigin;

  // Cono/Linea: "srotola" la posizione fisica in un sistema locale alla
  // forma invece di usare la distanza dal centro del rettangolo --
  // along è quanto avanti lungo l'asse principale (vertice->base per il
  // Cono, vicino->lontano per la Linea), across è lo scarto laterale
  // diviso per la semi-larghezza A QUELLA ALTEZZA (mix tra vicina e
  // lontana: 0 e la base per il Cono, costante per la Linea). Il
  // risultato (warped) vale esattamente ±1 sul bordo vero della sagoma,
  // su TUTTA la sua lunghezza -- non solo vicino al centro del bbox come
  // con la sola distanza euclidea, che per un Cono/una Linea lascia gran
  // parte dell'area (es. gli angoli della base) ben oltre il raggio dove
  // il bagliore originale è già spento (segnalato dall'utente: "quasi
  // nessuno occupano tutto lo spazio delle aoe"). Cubo/Sfera (u_shapeWarp
  // 0) restano nella distanza dal centro di sempre, già un buon
  // adattamento naturale per quelle forme.
  vec2 center = u_resolution * 0.5;
  vec2 warped;
  if (u_shapeWarp == 1) {
    vec2 rel = fragCoord - u_shapeOrigin;
    float along = dot(rel, u_shapeAxis);
    vec2 perp = vec2(-u_shapeAxis.y, u_shapeAxis.x);
    float across = dot(rel, perp);
    float t = clamp(along / max(u_shapeLength, 0.001), 0.0, 1.0);
    float halfWidth = mix(u_shapeNearHalfWidth, u_shapeFarHalfWidth, t);
    warped = vec2(across / max(halfWidth, 0.001), t * 2.0 - 1.0);
  } else {
    warped = (fragCoord - center) * 2.0 / u_resolution.y;
  }
  // u_fillScale riscala warped prima di passarlo a mainImage (1.0 =
  // nessun cambiamento): questi shader sono stati scritti per un bagliore
  // radiale che si spegne ben prima di raggiungere ±1, quindi senza
  // questo riscalo anche la parte "srotolata" della sagoma (o, su
  // Cubo/Sfera, la sagoma reale) resterebbe scura vicino al proprio
  // bordo. Vedi AoeShaderLayer.render per come viene calcolato, e il
  // commento su fillScale:false di web_area per l'unica eccezione.
  vec2 scaledFragCoord = center + warped * u_fillScale * u_resolution.y * 0.5;
  vec4 col;
  mainImage(col, scaledFragCoord);
  // gl_FragCoord ha origine in basso a sinistra (y cresce verso l'alto);
  // u_maskPoints è top-down (y cresce verso il basso, stesso sistema di
  // aoeShapePointsPx/aoeOutlinePoints) -- va invertito solo per il test di
  // ritaglio, mai per mainImage che resta nella convenzione originale di
  // ciascun autore. Il ritaglio usa sempre la posizione FISICA reale
  // (fragCoord, non scaledFragCoord): è la sagoma vera dell'AoE, non deve
  // scalare con fillScale.
  vec2 topDown = vec2(fragCoord.x, u_resolution.y - fragCoord.y);
  fragColor = aoeMaskContains(topDown) ? col : vec4(0.0);
}
`;
}

// Registro degli shader "ad area" selezionabili per un'AoE lanciata (vedi
// aoe.cast in control.js) -- 4 abbinati 1:1 a un colore della palette
// esistente (AOE_COLOR_TO_SHADER in media.js: rosso/verde/bianco/giallo)
// più 3 extra nel menu "···" (AOE_SHADER_OVERRIDE_IDS: zona ragnatela,
// fumo circolare, Viola Cornelia, e i 3 cerchi d'evocazione). Dei cerchi
// d'evocazione due sono a un pass; quello con la scia ha `multipass` e
// passa dalla simulazione di AoeShaderLayer (vedi EvocationSim).
// Anello di rune del «cerchio d'evocazione», portato da
// github.com/alph286/shaders (summoning-circle*.html, a sua volta da
// "Summoning Circle" di Sam Gates, Shadertoy wllfR4): Buffer A
// dell'originale, funzione pura di posizione e tempo. Il chiamante dichiara
// `u_time` e `u_resolution`. `spinGlsl` è quanto ruota l'anello al secondo
// ('2.0' nell'originale, '0.0' nella variante statica, dove le rune
// cambiano solo per il termine MORPH di rand). Unica modifica: iDate.w
// (secondi dalla mezzanotte) diventa u_time, come negli altri shader.
// Espone `vec3 summoningRing(vec2 p)`, p = (2*fragCoord - res)/res.y,
// vignettatura compresa (anello tra ~0.6 e ~0.95, spento oltre 1.15). Le
// macro dell'originale sono tolte alla fine (#undef) per non toccare il
// codice che segue.
function summoningRuneGlsl(spinGlsl) {
  return `
#define R u_resolution.xy
#define PI 3.1415927
#define m vec2(5. + 2. * 4., 10.)
#define PX (40. / R.y)
#define SS(U) smoothstep(PX, 0., U)
#define MORPH

float rand(vec2 p) {
    float d = u_time;
#ifdef MORPH
    vec2 pp = p / 20.0;
    d = floor(d * pp.x * pp.y) / 30.;
#endif
    return fract(sin(dot(p.xy, vec2(12389.1283, 8941.1283))) * (12893.128933) + cos(floor(d)));
}

mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }

// https://www.shadertoy.com/view/4llXD7
float B(vec2 p, vec2 b, vec4 r) {
    r.xy = p.x > 0.0 ? r.xy : r.zw;
    r.x = p.y > 0.0 ? r.x : r.y;
    vec2 q = abs(p) - b + r.x;
    return SS(min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r.x);
}

bool removedTile(float h, vec2 p) {
    vec2 lp = mod(p, m);
    float h2 = rand(vec2(20. + h * (floor(p.y)) + 10.84));
    if (lp.x >= 4. && lp.x < 11. || lp.y >= 6.) return true;
    return h * dot(h, h2) * 5. <= .5;
}

float C(vec2 p) { return SS(length(p - .5) - .4); }

float CL(vec2 p, float a) {
    vec2 bp = (p - .5);
    bp *= rot(PI / 4. * a);
    bp.x += .5;
    return B(bp, vec2(.6, .345), vec4(.3));
}

float CE(vec2 p, vec2 o) {
    return B((p + o) * rot(PI / 4.), vec2(.5), vec4(0));
}

float EL(vec2 p, float t) {
    vec2 b = vec2(.5, .4 - PX);
    p -= vec2(.5, .5);
    p *= rot(PI / 2. * t);
    p.x += PX;
    vec4 r = vec4(b.x - b.x / 2., b.x - b.x / 2., 0, 0);
    return B(p, b, r);
}

float D(vec2 p, float r) {
    p -= .5;
    p *= rot(PI / 2. * r);
    p += .13;
    float b1 = B(p, vec2(.5), vec4(.5, 0, 0, 0));
    p += .77;
    float b2 = B(p, vec2(.5), vec4(0, 0, 0, .025));
    return b1 - b2;
}

float T(vec2 p, float r) {
    p -= .5;
    p *= rot(PI / 2. * r);
    return B(p, vec2(.4 - PX, .6), vec4(0));
}

float render(vec2 p, float h) {
    bool neighbors[9];
    int ul = 6, u = 7, ur = 8, l = 3, me = 4, r = 5, dl = 0, d = 1, dr = 2;
    int n = 0;

    for (float y = -1.; y <= 1.; y++) {
        for (float x = -1.; x <= 1.; x++) {
            int i = int((x + 1.) + (y + 1.) * 3.);
            vec2 pos = floor(p + vec2(x, y));
            neighbors[i] = !removedTile(rand(pos), pos);
            if (i != me && neighbors[i]) n++;
        }
    }

    p = fract(p);

    if (neighbors[me]) {
        if (n == 0) return C(fract(p));

        if (neighbors[u] && neighbors[d]) {
            float o = T(p, 0.);
            if (neighbors[l]) o += EL(p + vec2(.175, 0), 0.);
            if (neighbors[r]) o += EL(p - vec2(.175, 0), 2.);
            return o;
        }
        if (neighbors[l] && neighbors[r]) {
            float o = T(p, 1.);
            if (neighbors[u]) o += EL(p - vec2(0, .25), 1.);
            if (neighbors[d]) o += EL(p + vec2(0, .25), 3.);
            return o;
        }
        if (neighbors[u] && !neighbors[d] && !neighbors[l] && !neighbors[r]) {
            float o = EL(p - vec2(0, .3), 1.);
            if (neighbors[dl]) o += CL(p - vec2(.175), 7.);
            if (neighbors[dr]) o += CL(p - vec2(-.175, .175), 5.);
            return o;
        }
        if (neighbors[d] && !neighbors[u] && !neighbors[l] && !neighbors[r]) {
            float o = EL(p + vec2(0, .3), 3.);
            if (neighbors[ul]) o += CL(p + vec2(-.175, .175), 1.);
            if (neighbors[ur]) o += CL(p + vec2(.175), 3.);
            return o;
        }
        if (neighbors[l] && !neighbors[r] && !neighbors[d] && !neighbors[u]) {
            float o = EL(p + vec2(.3, 0), 0.);
            if (neighbors[ur]) o += CL(p + vec2(.175, .175), 3.);
            if (neighbors[dr]) o += CL(p - vec2(-.175, .175), 5.);
            return o;
        }
        if (neighbors[r] && !neighbors[l] && !neighbors[d] && !neighbors[u]) {
            float o = EL(p - vec2(.3, 0), 2.);
            if (neighbors[ul]) o += CL(p + vec2(-.175, .175), 1.);
            if (neighbors[dl]) o += CL(p - vec2(.175), 7.);
            return o;
        }

        float j = 0.0;
        if (!neighbors[u] && neighbors[r] && !neighbors[l] && neighbors[d]) j += D(p, 3.);
        if (neighbors[u] && neighbors[r] && !neighbors[l] && !neighbors[d]) j += D(p, 2.);
        if (!neighbors[u] && !neighbors[r] && neighbors[l] && neighbors[d]) j += D(p, 0.);
        if (neighbors[u] && !neighbors[r] && neighbors[l] && !neighbors[d]) j += D(p, 1.);
        if (neighbors[ul] && !neighbors[l] && !neighbors[u]) j += CL(p + vec2(-.175, .175), 1.);
        if (neighbors[dl] && !neighbors[l] && !neighbors[d]) j += CL(p - vec2(.175), 7.);
        if (neighbors[ur] && !neighbors[r] && !neighbors[u]) j += CL(p + vec2(.175, .175), 3.);
        if (neighbors[dr] && !neighbors[r] && !neighbors[d]) j += CL(p - vec2(-.175, .175), 5.);
        return j;
    } else {
        float o = 0.0;
        if (!neighbors[ul] && neighbors[u] && neighbors[l]) o += CE(p, vec2(.07, -1.15));
        if (!neighbors[ur] && neighbors[u] && neighbors[r]) o += CE(p, vec2(-1.11));
        if (!neighbors[dl] && neighbors[d] && neighbors[l]) o += CE(p, vec2(.11));
        if (!neighbors[dr] && neighbors[d] && neighbors[r]) o += CE(p, vec2(-1.11, .11));
        return o;
    }
}

vec3 summoningCircleRaw(vec2 u) {
    vec2 p = vec2(log(length(u.xy)), atan(u.y, u.x));
    p *= (6.0 / PI) * 10.85;
    p += vec2(5., 3.);
    p.y += u_time * ${spinGlsl};
    p.y = mod(p.y, 10.015 * 13.0) - .2;
    vec2 lp = p;
    p = floor(p);
    float hash = rand(p);

    vec3 col = vec3(0.0);
    if (p.x >= -5. && p.x <= 4.)
        col = vec3(clamp(render(lp, hash), 0., 1.)) * min(length(u) * 4., 1.);
    return col;
}

vec3 summoningRing(vec2 p) {
    float vign = 1.0 - smoothstep(0.85, 1.15, length(p));
    return summoningCircleRaw(p) * vign;
}

#undef R
#undef PI
#undef m
#undef PX
#undef SS
#undef MORPH
`;
}

// Dissolvenza d'entrata dell'originale (FADE_START 0.3 s, FADE_LEN 2 s),
// contata da quando l'area è stata vista lanciata (u_age, vedi
// AoeShaderLayer.render) invece che dal caricamento della pagina.
const SUMMONING_FADE_GLSL = `
uniform float u_age;
float summoningFade() { return clamp((u_age - 0.3) / 2.0, 0.0, 1.0); }
`;

// Composizione della variante con scia (summoning-circle-trail.html, pass
// "Image"): rune nitide calcolate qui a piena risoluzione, più la scia letta
// dalla texture piccola della simulazione (EvocationSim), ingrandita col
// filtro lineare. L'originale sfoca la scia con 25 letture (5x5); qui ne
// bastano 4 in diagonale, l'ingrandimento sfoca già. u_hasDye 0 (niente
// render target float, o simulazione non pronta): solo le rune.
function summoningTrailCompositeSrc() {
  return aoeEffectFragmentSrc(summoningRuneGlsl('2.0') + SUMMONING_FADE_GLSL + `
uniform sampler2D u_dye;
uniform int u_hasDye;
uniform vec2 u_dyeTexel;

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 p = (2.0 * fragCoord - u_resolution.xy) / u_resolution.y;
    vec3 rune = summoningRing(p);
    vec3 dye = vec3(0.0);
    if (u_hasDye == 1) {
        vec2 uv = fragCoord / u_resolution.xy;
        vec2 o = u_dyeTexel * 0.75;
        dye = 0.25 * (texture(u_dye, uv + vec2(o.x, o.y)).rgb + texture(u_dye, uv + vec2(-o.x, o.y)).rgb
                    + texture(u_dye, uv + vec2(o.x, -o.y)).rgb + texture(u_dye, uv - o).rgb);
    }
    vec3 col = clamp(rune + dye * 1.6, 0.0, 1.0) * summoningFade();
    float alpha = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
    fragColor = vec4(col, alpha);
}
`);
}

// Le due varianti a un pass: rune bianche, alpha = luminosità (colore già
// premoltiplicato, come gli altri shader AOE).
function summoningSinglePassSrc(spinGlsl) {
  return aoeEffectFragmentSrc(summoningRuneGlsl(spinGlsl) + SUMMONING_FADE_GLSL + `
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 p = (2.0 * fragCoord - u_resolution.xy) / u_resolution.y;
    vec3 col = summoningRing(p) * summoningFade();
    float alpha = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
    fragColor = vec4(col, alpha);
}
`);
}

const AOE_SHADER_EFFECTS = {
  red_fire: {
    label: 'Cerchio di fuoco (rosso)',
    fragmentSrc: aoeEffectFragmentSrc(`
// ---- Hash / Noise (procedural-noise technique) ----
float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 x) {
    vec2 p = floor(x);
    vec2 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(p + vec2(0.0, 0.0));
    float b = hash(p + vec2(1.0, 0.0));
    float c = hash(p + vec2(0.0, 1.0));
    float d = hash(p + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

const mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p) {
    float f = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
        f += a * noise(p);
        p = m * p;
        a *= 0.5;
    }
    return f;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 p = (2.0 * fragCoord - u_resolution.xy) / u_resolution.y;
    float t = u_time;

    float rad = length(p);

    // cartesian domain warp for organic turbulence — built only from p
    // and time (no angle, no radial-line sampling), so it never seams
    // and never collapses into a "sunburst"/pinwheel near the center
    vec2 q = p * 2.4;
    vec2 warpA = vec2(fbm(q + vec2(0.0, -t * 0.35)), fbm(q + vec2(5.1, t * 0.28)));
    vec2 warped = q + (warpA - 0.5) * 1.6;

    float flame = fbm(warped * 1.7);
    flame = mix(flame, fbm(warped * 3.0 + warpA * 1.8), 0.35);
    flame = clamp(flame * 1.15, 0.0, 1.0);

    // traveling ring wave: phase depends on (radius - time), so rings of
    // brightness continuously expand from the center outward — this is
    // what actually reads as "flames flowing from the center to the rim"
    float ring = 0.5 + 0.5 * sin(rad * 10.0 - t * 3.0 + flame * 4.0);
    flame = mix(flame, clamp(flame * 0.6 + ring * 0.7, 0.0, 1.0), 0.6);

    // soft, feathered falloff instead of a hard circle edge — the shape
    // dissolves gradually into transparency (top-down brazier glow).
    // Opacity comes mostly from this shape term, only lightly touched by
    // the flame noise, so the fire never breaks up into dark "holes".
    float baseRadius = 0.48;
    float feather = 0.4;
    float radialFalloff = 1.0 - smoothstep(baseRadius - feather, baseRadius + feather, rad);
    float density = radialFalloff * (0.75 + 0.25 * flame);
    density = clamp(density, 0.0, 1.0);

    // brightness never drops to black — it only ranges from a dim green
    // glow up to a hot flare, so it always reads as fire, never as smoke
    float heat = mix(0.3, 0.85, flame);

    // small, soft ember glow right at the center — a brightness boost,
    // not a flat white disc, so the flame texture stays visible
    float core = smoothstep(0.24, 0.0, rad);
    heat = clamp(heat + core * core * 0.35, 0.0, 1.0);

    // red fire palette: deep red base -> vivid red-orange -> pale yellow hot spots
    vec3 col;
    col.r = 0.32 + heat * 0.68;
    col.g = pow(heat, 2.4) * 0.55;
    col.b = pow(heat, 4.0) * 0.16;
    col = clamp(col, 0.0, 1.0);

    float alpha = density;
    fragColor = vec4(col * alpha, alpha);
}
`)
  },
  green_fire: {
    label: 'Cerchio di fuoco (verde)',
    fragmentSrc: aoeEffectFragmentSrc(`
// ---- Hash / Noise (procedural-noise technique) ----
float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 x) {
    vec2 p = floor(x);
    vec2 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(p + vec2(0.0, 0.0));
    float b = hash(p + vec2(1.0, 0.0));
    float c = hash(p + vec2(0.0, 1.0));
    float d = hash(p + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

const mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p) {
    float f = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
        f += a * noise(p);
        p = m * p;
        a *= 0.5;
    }
    return f;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 p = (2.0 * fragCoord - u_resolution.xy) / u_resolution.y;
    float t = u_time;

    float rad = length(p);

    // cartesian domain warp for organic turbulence — built only from p
    // and time (no angle, no radial-line sampling), so it never seams
    // and never collapses into a "sunburst"/pinwheel near the center
    vec2 q = p * 2.4;
    vec2 warpA = vec2(fbm(q + vec2(0.0, -t * 0.35)), fbm(q + vec2(5.1, t * 0.28)));
    vec2 warped = q + (warpA - 0.5) * 1.6;

    float flame = fbm(warped * 1.7);
    flame = mix(flame, fbm(warped * 3.0 + warpA * 1.8), 0.35);
    flame = clamp(flame * 1.15, 0.0, 1.0);

    // traveling ring wave: phase depends on (radius - time), so rings of
    // brightness continuously expand from the center outward — this is
    // what actually reads as "flames flowing from the center to the rim"
    float ring = 0.5 + 0.5 * sin(rad * 10.0 - t * 3.0 + flame * 4.0);
    flame = mix(flame, clamp(flame * 0.6 + ring * 0.7, 0.0, 1.0), 0.6);

    // soft, feathered falloff instead of a hard circle edge — the shape
    // dissolves gradually into transparency (top-down brazier glow).
    // Opacity comes mostly from this shape term, only lightly touched by
    // the flame noise, so the fire never breaks up into dark "holes".
    float baseRadius = 0.48;
    float feather = 0.4;
    float radialFalloff = 1.0 - smoothstep(baseRadius - feather, baseRadius + feather, rad);
    float density = radialFalloff * (0.75 + 0.25 * flame);
    density = clamp(density, 0.0, 1.0);

    // brightness never drops to black — it only ranges from a dim green
    // glow up to a hot flare, so it always reads as fire, never as smoke
    float heat = mix(0.3, 0.85, flame);

    // small, soft ember glow right at the center — a brightness boost,
    // not a flat white disc, so the flame texture stays visible
    float core = smoothstep(0.24, 0.0, rad);
    heat = clamp(heat + core * core * 0.35, 0.0, 1.0);

    // green fire palette: deep green base -> vivid green -> pale yellow-green hot spots
    vec3 col;
    col.r = pow(heat, 2.2) * 0.45;
    col.g = 0.26 + heat * 0.85;
    col.b = pow(heat, 3.2) * 0.22;
    col = clamp(col, 0.0, 1.0);

    float alpha = density;
    fragColor = vec4(col * alpha, alpha);
}
`)
  },
  purple_fire: {
    label: 'Viola Cornelia',
    fragmentSrc: aoeEffectFragmentSrc(`
// ---- Hash / Noise (procedural-noise technique) ----
float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 x) {
    vec2 p = floor(x);
    vec2 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(p + vec2(0.0, 0.0));
    float b = hash(p + vec2(1.0, 0.0));
    float c = hash(p + vec2(0.0, 1.0));
    float d = hash(p + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

const mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p) {
    float f = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
        f += a * noise(p);
        p = m * p;
        a *= 0.5;
    }
    return f;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 p = (2.0 * fragCoord - u_resolution.xy) / u_resolution.y;
    float t = u_time;

    float rad = length(p);

    // cartesian domain warp for organic turbulence — built only from p
    // and time (no angle, no radial-line sampling), so it never seams
    // and never collapses into a "sunburst"/pinwheel near the center
    vec2 q = p * 2.4;
    vec2 warpA = vec2(fbm(q + vec2(0.0, -t * 0.35)), fbm(q + vec2(5.1, t * 0.28)));
    vec2 warped = q + (warpA - 0.5) * 1.6;

    float flame = fbm(warped * 1.7);
    flame = mix(flame, fbm(warped * 3.0 + warpA * 1.8), 0.35);
    flame = clamp(flame * 1.15, 0.0, 1.0);

    // traveling ring wave: phase depends on (radius - time), so rings of
    // brightness continuously expand from the center outward — this is
    // what actually reads as "flames flowing from the center to the rim"
    float ring = 0.5 + 0.5 * sin(rad * 10.0 - t * 3.0 + flame * 4.0);
    flame = mix(flame, clamp(flame * 0.6 + ring * 0.7, 0.0, 1.0), 0.6);

    // soft, feathered falloff instead of a hard circle edge — the shape
    // dissolves gradually into transparency (top-down brazier glow).
    // Opacity comes mostly from this shape term, only lightly touched by
    // the flame noise, so the fire never breaks up into dark "holes".
    float baseRadius = 0.48;
    float feather = 0.4;
    float radialFalloff = 1.0 - smoothstep(baseRadius - feather, baseRadius + feather, rad);
    float density = radialFalloff * (0.75 + 0.25 * flame);
    density = clamp(density, 0.0, 1.0);

    // brightness never drops to black — it only ranges from a dim green
    // glow up to a hot flare, so it always reads as fire, never as smoke
    float heat = mix(0.3, 0.85, flame);

    // small, soft ember glow right at the center — a brightness boost,
    // not a flat white disc, so the flame texture stays visible
    float core = smoothstep(0.24, 0.0, rad);
    heat = clamp(heat + core * core * 0.35, 0.0, 1.0);

    // Viola Cornelia palette: indaco profondo -> viola pieno -> lilla
    // chiaro nei punti caldi -- il blu resta sempre nettamente dominante
    // sul rosso (rapporto ~2:1 al picco), non paritario come nella prima
    // versione, apposta per leggersi come viola vero e non come
    // magenta/rosa (richiesta esplicita dell'utente: "più viola e meno
    // rosa").
    vec3 col;
    col.r = 0.18 + heat * 0.32;
    col.g = pow(heat, 3.6) * 0.20;
    col.b = 0.42 + heat * 0.58;
    col = clamp(col, 0.0, 1.0);

    float alpha = density;
    fragColor = vec4(col * alpha, alpha);
}
`)
  },
  moonbeam: {
    label: 'Moonbeam',
    fragmentSrc: aoeEffectFragmentSrc(`
float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// Procedural water caustics (classic "interfering sines" form). The
// magic constants here (the -250 offset, inten=0.005, 1.17/1.4/8) are a
// matched set tuned for p living at a large-magnitude offset — changing
// the coordinate scale without keeping the offset breaks the balance and
// the whole field saturates to one flat value (learned this the hard way).
float caustics(vec2 uv, float time) {
    const float TAU = 6.28318530718;
    vec2 p = mod(uv * TAU, TAU) - 250.0;
    vec2 i = p;
    float c = 1.0;
    const float inten = 0.005;
    for (int n = 0; n < 5; n++) {
        float t = time * (1.0 - (3.5 / float(n + 1)));
        i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
        vec2 denom = vec2(sin(i.x + t), cos(i.y + t)) / inten;
        c += 1.0 / length(vec2(p.x, p.y) / denom);
    }
    c /= 5.0;
    c = 1.17 - pow(c, 1.4);
    return clamp(pow(abs(c), 8.0), 0.0, 1.0);
}

// Soft round twinkling highlight per jittered cell (the photo's bokeh glints)
float bokeh(vec2 p, float scale, float time) {
    vec2 gp = p * scale;
    vec2 n = floor(gp);
    vec2 f = fract(gp);
    float best = 0.0;
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = vec2(hash(n + g), hash(n + g + 17.3));
            float twinkle = 0.5 + 0.5 * sin(time * 2.2 + hash(n + g + 4.1) * 30.0);
            float d = length(f - g - o);
            float spot = smoothstep(0.22, 0.0, d) * pow(twinkle, 3.0);
            best = max(best, spot);
        }
    }
    return best;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 p = (2.0 * fragCoord - u_resolution.xy) / u_resolution.y;
    float t = u_time;
    float rad = length(p);

    // gentle wave distortion so the whole caustic field drifts like a
    // real water surface instead of just cycling in place
    vec2 wp = p * 2.6 + vec2(sin(t * 0.15), cos(t * 0.12)) * 0.3;
    float causticPattern = caustics(wp, t * 0.6);
    causticPattern = pow(causticPattern, 0.7); // widen the bright filaments

    float glints = max(bokeh(p, 3.2, t), bokeh(p + 5.3, 6.5, t * 1.3) * 0.8);

    float pattern = clamp(causticPattern * 1.1 + glints * 0.9, 0.0, 1.0);

    // soft circular falloff, brightest toward the center
    float baseRadius = 0.5;
    float feather = 0.42;
    float falloff = 1.0 - smoothstep(baseRadius - feather, baseRadius + feather, rad);

    // white & silver only — a cool light-grey base rising to pure white
    // at the brightest caustic filaments/glints, no blue tint
    vec3 col = mix(vec3(0.62, 0.63, 0.66), vec3(1.0), pattern);

    float baseGlow = 0.68;
    float alpha = clamp((baseGlow + pattern * 0.45) * falloff, 0.0, 0.95);
    fragColor = vec4(col * alpha, alpha);
}
`)
  },
  web_area: {
    label: 'Zona ragnatela',
    // Unico shader ad area che già riempie da solo tutta la sagoma (la
    // propria areaMask interna arriva fino a edgeDist 0.95, vedi
    // `main()` qui sotto): il riscalo generico di AoeShaderLayer.render
    // (vedi fillScale) andrebbe a tagliarlo via il mascheramento poligonale
    // prima ancora che la sua dissolvenza morbida entri in azione, quindi
    // resta escluso -- unico shader con questo flag a false.
    fillScale: false,
    fragmentSrc: aoeEffectFragmentSrc(`
vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}

// F1/F2 Voronoi — jittered cell centers, gently swaying over time
vec2 voronoiF1F2(vec2 p, float t, float swaySpeed) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float f1 = 8.0, f2 = 8.0;

    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = hash22(n + g);
            o = 0.5 + 0.4 * sin(t * swaySpeed + 6.2831 * o);
            vec2 r = g + o - f;
            float d = dot(r, r);
            if (d < f1) { f2 = f1; f1 = d; }
            else if (d < f2) { f2 = d; }
        }
    }
    return vec2(sqrt(f1), sqrt(f2));
}

float strands(vec2 p, float scale, float thickness, float t, float swaySpeed) {
    vec2 fg = voronoiF1F2(p * scale, t, swaySpeed);
    float edge = fg.y - fg.x;
    return exp(-edge * thickness);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 p = (2.0 * fragCoord - u_resolution.xy) / u_resolution.y;
    float t = u_time;

    // three overlaid scales (coarse/medium/fine) so the webbing reads as a
    // dense tangled mass rather than a few sparse lines
    float coarse = strands(p, 2.4, 9.0, t, 0.2);
    float main = strands(p, 4.5, 11.0, t, 0.25) * 0.85;
    float fine = strands(p, 9.0, 16.0, t, 0.4) * 0.6;
    float mesh = clamp(coarse + main + fine, 0.0, 1.0);

    // faint translucent haze everywhere in the area — the spell also
    // "lightly obscures" the space, not just the strands themselves.
    // No per-block density modulation here: that created visible darker
    // patches instead of a uniformly opaque web.
    mesh = clamp(mesh + 0.16, 0.0, 1.0);

    // square-ish area (the spell fills a cube), soft feathered edge
    vec2 ap = abs(p);
    float edgeDist = max(ap.x, ap.y);
    float areaMask = 1.0 - smoothstep(0.72, 0.95, edgeDist);

    // pale, slightly grey-blue sticky webbing color
    vec3 col = vec3(0.90, 0.93, 0.95);

    float alpha = clamp(mesh * areaMask, 0.0, 1.0);
    fragColor = vec4(col * alpha, alpha);
}
`)
  },
  circular_smoke: {
    label: 'Fumo circolare',
    fragmentSrc: aoeEffectFragmentSrc(`
float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 x) {
    vec2 p = floor(x);
    vec2 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(p + vec2(0.0, 0.0));
    float b = hash(p + vec2(1.0, 0.0));
    float c = hash(p + vec2(0.0, 1.0));
    float d = hash(p + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

const mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p) {
    float f = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
        f += a * noise(p);
        p = m * p;
        a *= 0.5;
    }
    return f;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 p = (2.0 * fragCoord - u_resolution.xy) / u_resolution.y;
    float t = u_time;

    float rad = length(p);

    // gentle cartesian domain warp — much slower/softer than the fire
    // shaders, for a misty, drifting moonlight feel instead of flicker
    vec2 q = p * 1.6;
    vec2 warpA = vec2(fbm(q + vec2(0.0, -t * 0.12)), fbm(q + vec2(5.1, t * 0.1)));
    vec2 warped = q + (warpA - 0.5) * 0.8;

    float mist = fbm(warped * 1.3);
    mist = mix(mist, fbm(warped * 2.2 + warpA), 0.3);
    mist = clamp(mist * 1.1, 0.0, 1.0);

    // faint "ghostly flame" flicker: a slow traveling ring wave, much
    // subtler than the fire variants' pulse
    float ring = 0.5 + 0.5 * sin(rad * 7.0 - t * 0.9 + mist * 1.8);
    mist = mix(mist, clamp(mist * 0.7 + ring * 0.5, 0.0, 1.0), 0.35);

    // soft, wide, feathered falloff — dim light, no hard edge
    float baseRadius = 0.55;
    float feather = 0.4;
    float radialFalloff = 1.0 - smoothstep(baseRadius - feather, baseRadius + feather, rad);

    // "dim light" is a lore cue, not a rendering target — a VTT overlay
    // still needs to read clearly, so brightness stays pale/soft but visible
    float glow = mix(0.5, 0.9, mist);
    float core = smoothstep(0.4, 0.0, rad);
    glow = clamp(glow + core * core * 0.4, 0.0, 1.0);

    // cool silvery-lavender moonlight palette
    vec3 col;
    col.r = 0.68 + glow * 0.30;
    col.g = 0.72 + glow * 0.26;
    col.b = 0.85 + glow * 0.15;
    col = clamp(col, 0.0, 1.0);

    // translucent but clearly visible — soft light, not a solid disc
    float alpha = radialFalloff * (0.55 + 0.4 * mist);
    alpha = clamp(alpha, 0.0, 0.92);

    fragColor = vec4(col * alpha, alpha);
}
`)
  },
  gold_divine_light: {
    label: 'Luce divina dorata',
    fragmentSrc: aoeEffectFragmentSrc(`
// ---- Hash / Noise (procedural-noise technique) ----
float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 x) {
    vec2 p = floor(x);
    vec2 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(p + vec2(0.0, 0.0));
    float b = hash(p + vec2(1.0, 0.0));
    float c = hash(p + vec2(0.0, 1.0));
    float d = hash(p + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

const mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p) {
    float f = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
        f += a * noise(p);
        p = m * p;
        a *= 0.5;
    }
    return f;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 p = (2.0 * fragCoord - u_resolution.xy) / u_resolution.y;
    float t = u_time;

    float rad = length(p);
    float ang = atan(p.y, p.x);

    // cartesian domain warp for organic turbulence — gentler and slower
    // than the fire variants, for a calm radiant glow instead of chaotic flame
    vec2 q = p * 1.8;
    vec2 warpA = vec2(fbm(q + vec2(0.0, -t * 0.18)), fbm(q + vec2(5.1, t * 0.14)));
    vec2 warped = q + (warpA - 0.5) * 0.9;

    float flame = fbm(warped * 1.4);
    flame = mix(flame, fbm(warped * 2.4 + warpA * 1.2), 0.3);
    flame = clamp(flame * 1.1, 0.0, 1.0);

    // traveling ring wave: soft pulses of light breathing outward from
    // the center, slower and gentler than a fire flicker
    float ring = 0.5 + 0.5 * sin(rad * 8.0 - t * 1.6 + flame * 2.5);
    flame = mix(flame, clamp(flame * 0.65 + ring * 0.55, 0.0, 1.0), 0.5);

    // holy rays: an integer number of beams radiating from the center,
    // but twisted into a spiral — the twist grows with radius and drifts
    // over time, and the flame noise adds an organic, tangled wobble.
    // The twist depends only on rad/t/flame (never on ang itself), so
    // cos(N*(ang+twist)) is still exactly 2*pi periodic in ang — the
    // beams coil around each other with zero seam/discontinuity.
    float twist = rad * 7.0 - t * 0.7 + (flame - 0.5) * 2.5;
    float rays = pow(0.5 + 0.5 * cos((ang + twist) * 8.0), 3.0);
    rays *= smoothstep(0.85, 0.1, rad);

    // soft, feathered falloff instead of a hard circle edge — the shape
    // dissolves gradually into transparency. Wider than the fire variants
    // so the divine light reads as a broad radiant glow.
    float baseRadius = 0.42;
    float feather = 0.5;
    float radialFalloff = 1.0 - smoothstep(baseRadius - feather, baseRadius + feather, rad);
    float density = radialFalloff * (0.7 + 0.3 * flame) + rays * radialFalloff * 0.35;
    density = clamp(density, 0.0, 1.0);

    // brightness never drops low — divine light stays luminous throughout,
    // only brightening further toward the core and along the rays
    float heat = mix(0.55, 0.95, flame);
    heat = clamp(heat + rays * 0.4, 0.0, 1.2);

    // radiant white-gold core
    float core = smoothstep(0.32, 0.0, rad);
    heat = clamp(heat + core * core * 0.7, 0.0, 1.4);

    // golden divine palette: warm gold base -> radiant amber -> white-gold hot core
    vec3 col;
    col.r = 0.45 + heat * 0.55;
    col.g = 0.32 + heat * 0.58;
    col.b = pow(heat, 2.6) * 0.42;
    col = clamp(col, 0.0, 1.0);

    float alpha = density;
    fragColor = vec4(col * alpha, alpha);
}
`)
  },
  // Cerchio d'evocazione (vedi summoningRuneGlsl). fillScale:false come
  // web_area: l'anello sta tra 0.6 e 0.95 in unità p, il riscalo lo
  // porterebbe fuori dalla sagoma.
  summoning_circle: {
    label: "Cerchio d'evocazione",
    fillScale: false,
    fragmentSrc: summoningSinglePassSrc('2.0')
  },
  summoning_circle_static: {
    label: "Cerchio d'evocazione (fermo)",
    fillScale: false,
    fragmentSrc: summoningSinglePassSrc('0.0')
  },
  // Multi-pass: prima della composizione AoeShaderLayer fa un passo della
  // simulazione (EvocationSim) nei framebuffer dell'area.
  summoning_circle_trail: {
    label: "Cerchio d'evocazione (scia)",
    fillScale: false,
    multipass: 'summoningTrail',
    fragmentSrc: summoningTrailCompositeSrc()
  }
};

// Pass della simulazione della scia (summoning-circle-trail.html), in pixel
// della texture piccola (gl_FragCoord, nessun u_viewportOrigin: si disegna
// sempre l'intero framebuffer). Cambia solo il passo di tempo: l'originale
// fa un passo per frame a 60 fps, qui u_stepScale (frame da 60 fps passati,
// vedi evocationStepParams) riscala spostamento, decadimento (u_decay) e
// colore aggiunto (u_inject); u_force riporta la spinta, pensata in pixel di
// uno schermo alto ~1080, alla risoluzione della simulazione. B e C
// dell'originale restano fusi in un solo pass, come nel file sorgente.
const EVOCATION_SIM_PROGRAMS = {
  rune: `#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
out vec4 fragColor;
${summoningRuneGlsl('2.0')}
void main() {
    vec2 p = (2.0 * gl_FragCoord.xy - u_resolution.xy) / u_resolution.y;
    fragColor = vec4(summoningRing(p), 1.0);
}
`,
  fluid: `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform sampler2D u_fluid;
uniform sampler2D u_rune;
uniform float u_stepScale;
uniform float u_decay;
uniform float u_force;
out vec4 fragColor;

#define R u_resolution.xy

vec4 texFluid(vec2 p) { return texture(u_fluid, p / R); }

void F(vec2 p, vec2 offset, vec4 s, inout vec2 v, inout float pr, inout float d, inout float n) {
    vec2 neighborPos = p + offset;
    vec2 backtraced = neighborPos - texFluid(neighborPos).xy * u_stepScale;
    vec4 target = texFluid(backtraced);
    vec2 o = normalize(offset);
    v += o * (target.w - s.w);
    pr += target.w;
    d += dot(o, target.xy);
    n += 1.0;
}

void main() {
    vec2 p = gl_FragCoord.xy;
    vec4 s = texFluid(p - texFluid(p).xy * u_stepScale);

    vec2 v = vec2(0.0);
    float d = 0.0, pr = 0.0, n = 0.0;
    F(p, vec2(0, 1), s, v, pr, d, n);
    F(p, vec2(0, -1), s, v, pr, d, n);
    F(p, vec2(1, 0), s, v, pr, d, n);
    F(p, vec2(-1, 0), s, v, pr, d, n);
    d /= n; pr /= n; v /= n;

    s.w = pr - d;
    s.xy -= v;
    s.z = d;
    s.xy *= u_decay;

    float mask = texture(u_rune, p / R).r;
    vec2 centerVec = (2.0 * p - R) / R.y;
    if (mask > 0.15) {
        s.xy = -centerVec * 0.3 * u_force;
    }

    if (p.x < 1. || p.y < 1. || R.x - p.x < 1. || R.y - p.y < 1.) s.xy *= 0.0;

    fragColor = s;
}
`,
  dye: `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform sampler2D u_dye;
uniform sampler2D u_fluid;
uniform sampler2D u_rune;
uniform vec3 u_trailColor;
uniform float u_stepScale;
uniform float u_decay;
uniform float u_inject;
out vec4 fragColor;

#define R u_resolution.xy

void main() {
    vec2 f = gl_FragCoord.xy;
    for (int i = 0; i < 2; i++) {
        f -= texture(u_fluid, f / R).xy * u_stepScale;
    }

    vec4 state = texture(u_dye, f / R);
    state *= u_decay;

    float mask = texture(u_rune, gl_FragCoord.xy / R).r;
    if (mask > 0.1) {
        state.rgb += u_trailColor * u_inject;
    }

    fragColor = clamp(state, 0.0, 3.0);
}
`
};


// Striscia luminosa del "ping" (gesto momentaneo del DM, tap o
// trascinamento): un solo pass a schermo intero, non per-decorazione come il
// Portale -- il percorso è una polilinea di lunghezza variabile, non un
// rettangolo fisso. Un tap fermo (un solo punto) è un caso speciale: invece
// del semplice bagliore a distanza fissa usato per i segmenti della scia,
// disegna 3 anelli "radar ping" concentrici ("sonar" -- formula adattata da
// una ricerca dell'utente su Shadertoy: un cerchio che si espande da un
// raggio 0 e sfuma, invece del loop infinito `mod(iTime,...)` dell'originale
// -- qui l'"orologio" è l'età del punto, un evento singolo, non una
// scansione radar continua) con lo stesso crackle da rumore del Portale sul
// contorno, per non farli sembrare cerchi geometrici puliti. I 3 anelli
// condividono la stessa "age": non sono sfalsati nel tempo (altrimenti
// partirebbero in momenti diversi, non "ad ogni tap" come richiesto) ma
// nel RAGGIO -- ognuno segue il precedente a una distanza fissa, come
// increspature concentriche che si espandono insieme. Il trascinamento
// resta il bagliore a distanza da segmento di prima (fuori scope di
// questa modifica, su richiesta dell'utente) col colore accent; gli
// anelli del tap singolo usano invece un blu electric simile al Portale
// (richiesta esplicita, diverso dall'accent arancio usato altrove).
//
// I punti arrivano organizzati in GRUPPI (uno per gesto/"stroke": vedi
// strokeId in control.js/display.js) invece che in un'unica lista piatta --
// senza questo, due tap ravvicinati (entrambi ancora vivi, nello stesso
// u_points) venivano trattati come UN SOLO gesto di più punti, disegnando
// una scia che li collega invece di due sonar indipendenti (bug segnalato
// dall'utente). Ogni gruppo da 1 punto è un sonar, ogni gruppo con più
// punti è una scia -- indipendenti, mai collegati tra loro.
const PING_FRAGMENT_SRC = `#version 300 es
precision highp float;

#define MAX_PING_POINTS 32
#define MAX_PING_GROUPS 8
#define RING_COUNT 3

uniform vec2 u_points[MAX_PING_POINTS];
uniform float u_ages[MAX_PING_POINTS];
uniform int u_groupStart[MAX_PING_GROUPS];
uniform int u_groupCount[MAX_PING_GROUPS];
uniform int u_groupTotal;
uniform float u_lifespan;
uniform vec3 u_ringColor;
uniform vec3 u_trailColor;
uniform float u_lineWidth;
uniform float u_fadeDistance;
uniform sampler2D u_noise;
// Posizione (px, dal basso a sinistra) del canvas ridotto dentro il canvas
// "pieno" grande quanto la mappa: PingLayer disegna solo sul riquadro dei
// gruppi vivi (vedi pingGroupsBoundsPx), ma tutte le coordinate (punti,
// rumore campionato sulla posizione) restano quelle del canvas pieno.
uniform vec2 u_offset;

out vec4 fragColor;

// Spessore/spaziatura/sfrigolamento degli anelli, in frazione di
// u_fadeDistance -- così scalano insieme a lui (già in px reali, dpr
// incluso) invece di essere pixel fissi che sembrerebbero più sottili su
// schermi ad alta densità. INNER_TAIL più grande = anello più spesso
// (richiesta esplicita, erano 0.10/0.012).
const float RING_INNER_TAIL_FRAC = 0.24;
const float RING_FRONTIER_FRAC = 0.03;
const float RING_GAP_FRAC = 0.30;
const float RING_CRACKLE_FRAC = 0.04;
// Soglie di energia (ring*flicker) sopra cui il colore passa dal blu di
// base (u_ringColor) al bianco -- stesso effetto "nucleo bianco, bordo
// blu" del Portale, qui fatto con un mix esplicito invece che dividendo
// un colore per un rz piccolo (più leggibile, niente rischio di
// dividere per quasi-zero).
const float RING_WHITE_CORE_LOW = 0.55;
const float RING_WHITE_CORE_HIGH = 0.95;
// Frazione della vita (0-1) a cui inizia il fade-out finale, vedi
// lifeFade in main(): prima di questo punto l'anello resta a piena
// intensità, dopo sfuma fino a 0 entro age == u_lifespan.
const float RING_LIFE_FADE_START = 0.7;

// "Stella cometa": la scia parte spessa in testa (punti appena aggiunti,
// età vicina a 0) e si assottiglia verso la coda (punti più vecchi) --
// TRAIL_TAIL_WIDTH_FRAC è lo spessore della coda come frazione di
// u_lineWidth (che qui è quindi lo spessore della TESTA), richiesta
// esplicita dell'utente.
const float TRAIL_TAIL_WIDTH_FRAC = 0.25;
// Stesse soglie di energia del sonar (RING_WHITE_CORE_*), qui applicate
// al rosso del Portale invece che al blu: il nucleo bianco segna il
// punto di massima energia, cioè la testa della cometa.
const float TRAIL_WHITE_CORE_LOW = 0.5;
const float TRAIL_WHITE_CORE_HIGH = 0.85;
const float TRAIL_CRACKLE_FRAC = 0.35;

// Oltre queste distanze un gruppo contribuisce esattamente 0 (uscita
// anticipata, niente atan/rumore sui pixel lontani). Margini con un po' di
// gioco sul caso peggiore del crackle (crackleFbm vale al più 1.05):
// - sonar: r si accorcia al più di 0.55*RING_CRACKLE_FRAC = 0.022 di
//   u_fadeDistance, e ringAt() è 0 per r >= u_fadeDistance;
// - scia: dist si accorcia al più di 0.5*TRAIL_CRACKLE_FRAC = 0.175 di
//   width (<= u_lineWidth), e glow è 0 per dist >= width.
// Stessi valori di PING_SONAR_REACH/PING_TRAIL_REACH in JS: vanno tenuti
// uguali (il riquadro del canvas ridotto usa quelli).
const float SONAR_REACH = 1.05;
const float TRAIL_REACH = 1.2;

// .x = distanza dal segmento, .y = quanto avanti lungo a→b cade il punto
// più vicino (0 = su a, 1 = su b) -- serve a interpolare l'età tra i due
// estremi invece di scattare bruscamente da un segmento al successivo,
// per una scia che si assottiglia con continuità.
vec2 distToSegmentT(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
  return vec2(length(pa - ba * h), h);
}

// Stesso identico campionamento a texture del Portale (vedi
// portalFragmentSrc): rumore da una texture 256x256 di valori casuali,
// non da un hash -- più economico, e già coerente con l'altro effetto.
float noiseTex(vec2 x) { return texture(u_noise, x * 0.01).x; }

// 3 ottave bastano per un crepitio visibile senza costare quanto il
// dualfbm del Portale (qui serve solo a increspare un contorno, non a
// generare l'intera texture dell'effetto).
float crackleFbm(vec2 p) {
  float f = 0.0;
  float a = 0.6;
  for (int i = 0; i < 3; i++) {
    f += a * noiseTex(p);
    p = p * 2.07 + vec2(3.1, 1.7);
    a *= 0.5;
  }
  return f;
}

// Un singolo anello alla distanza "time" dal centro (stessa struttura a
// doppio smoothstep dell'originale Shadertoy: bordo interno + bordo
// esterno), poi sfumato a 0 oltre u_fadeDistance. "time" qui non è un
// istante globale ma una distanza: i 3 anelli concentrici lo chiamano con
// time meno i*gap, non con età diverse.
float ringAt(float r, float time) {
  float ring = smoothstep(time - RING_INNER_TAIL_FRAC * u_fadeDistance, time, r)
    * smoothstep(time + RING_FRONTIER_FRAC * u_fadeDistance, time, r);
  return ring * smoothstep(u_fadeDistance, 0.0, r);
}

// Un "sonar": gruppo di un solo punto fermo, i 3 anelli concentrici con
// crackle (vedi commento in cima al file). outColor è un parametro di
// uscita invece di un valore globale perché ogni gruppo nel loop di
// main() calcola il proprio colore indipendentemente dagli altri.
float sonarAlphaAt(vec2 p, vec2 center, float age, out vec3 outColor) {
  vec2 diff = center - p;
  float r = length(diff);
  outColor = u_ringColor;
  if (r > SONAR_REACH * u_fadeDistance) return 0.0;
  float angle = atan(diff.y, diff.x);

  // age*2.5 (non *6.0 come prima): crepitio più lento, stesso motivo per
  // age*3.0 nel flicker sotto.
  float crackle = crackleFbm(vec2(angle * 3.0, age * 2.5));
  r += (crackle - 0.5) * RING_CRACKLE_FRAC * u_fadeDistance;

  // "Orologio": age 0 → raggio 0, age u_lifespan → raggio u_fadeDistance
  // (completamente sfumato) per l'anello guida; i due successivi lo
  // seguono a RING_GAP_FRAC*u_fadeDistance di distanza. Easing ease-out
  // (quadratico) invece di lineare: parte veloce e decelera verso la
  // fine, richiesta esplicita.
  float t = clamp(age / u_lifespan, 0.0, 1.0);
  float eased = 1.0 - (1.0 - t) * (1.0 - t);
  float time = eased * u_fadeDistance;
  float ring = 0.0;
  for (int i = 0; i < RING_COUNT; i++) {
    ring = max(ring, ringAt(r, time - float(i) * RING_GAP_FRAC * u_fadeDistance));
  }

  // Flicker sull'intensità: stesso crackle, campionato altrove per non
  // essere correlato 1:1 col jitter del raggio.
  float flicker = 0.75 + 0.25 * crackleFbm(vec2(angle * 5.1 + 4.0, age * 3.0));
  float energy = ring * flicker;
  // Senza questo, l'unico "fade" era quello spaziale in ringAt()
  // (ring*smoothstep(u_fadeDistance,0,r)) -- che coincide quasi esattamente
  // col momento in cui l'anello guida raggiunge il raggio massimo, quindi
  // sembrava sparire di colpo invece di sfumare. Qui invece un fade
  // esplicito sull'ETÀ, indipendente dalla posizione: resta a piena
  // intensità per il 70% della vita, poi sfuma negli ultimi 30%.
  float lifeFade = 1.0 - smoothstep(RING_LIFE_FADE_START, 1.0, t);
  // Blu di base (u_ringColor) che sale a bianco dove l'energia (il
  // prodotto di anello e flicker, non solo l'anello) è più alta --
  // stesso "nucleo bianco, bordo blu" del Portale.
  outColor = mix(u_ringColor, vec3(1.0), smoothstep(RING_WHITE_CORE_LOW, RING_WHITE_CORE_HIGH, energy));
  return energy * lifeFade;
}

// Una scia a "stella cometa": bagliore a distanza dal segmento più vicino
// tra i punti [start, start+count) dello stesso gruppo -- mai con punti
// di un ALTRO gruppo, a differenza di prima (quello era il bug: un solo
// elenco piatto collegava gesti diversi). Stesso mood del Portale rosso:
// crackle da rumore sul bordo (non più un bagliore pulito) e nucleo
// bianco dove l'energia è più alta, cioè in testa alla cometa (i punti
// più recenti, età vicina a 0) -- la testa è anche la parte più spessa,
// la coda (punti più vecchi) si assottiglia.
float trailAlphaAt(vec2 p, int start, int count, out vec3 outColor) {
  float minDist = 1e6;
  float age = u_lifespan;
  for (int i = 0; i < MAX_PING_POINTS - 1; i++) {
    if (i >= count - 1) break;
    int a = start + i;
    int b = a + 1;
    vec2 dt = distToSegmentT(p, u_points[a], u_points[b]);
    if (dt.x < minDist) {
      minDist = dt.x;
      // Interpolata lungo il segmento (non un min/max secco tra i due
      // estremi): la larghezza/colore cambiano con continuità lungo
      // tutta la coda invece di "scattare" ad ogni punto della scia.
      age = mix(u_ages[a], u_ages[b], dt.y);
    }
  }
  outColor = u_trailColor;
  if (minDist > TRAIL_REACH * u_lineWidth) return 0.0;

  float t = clamp(age / u_lifespan, 0.0, 1.0);
  float eased = 1.0 - (1.0 - t) * (1.0 - t);
  // u_lineWidth è la larghezza alla TESTA (età 0); si assottiglia verso
  // TRAIL_TAIL_WIDTH_FRAC*u_lineWidth man mano che l'età cresce.
  float width = mix(u_lineWidth, u_lineWidth * TRAIL_TAIL_WIDTH_FRAC, eased);

  // Stesso crackle del sonar (crackleFbm), qui campionato sulla
  // POSIZIONE A SCHERMO del pixel (p), non sulla direzione del segmento
  // più vicino come nella prima versione: quella (segAngle) cambiava di
  // scatto esattamente nei punti dove il tracciato cambia direzione (lì
  // il segmento "più vicino" passa dall'uno all'altro), producendo uno
  // spigolo visibile proprio nelle curve -- bug segnalato dall'utente.
  // Campionare p invece di segAngle rende il rumore continuo ovunque: lo
  // stesso punto fisico ha sempre lo stesso valore, a prescindere da
  // quale segmento lo rivendica come più vicino.
  float crackle = crackleFbm(vec2(p.x * 0.08, p.y * 0.08 + age * 2.5));
  float dist = minDist + (crackle - 0.5) * width * TRAIL_CRACKLE_FRAC;

  float glow = smoothstep(width, 0.0, dist);
  // Flicker sull'intensità: stesso crackle, campionato altrove per non
  // essere correlato 1:1 col jitter del bordo.
  float flicker = 0.75 + 0.25 * crackleFbm(vec2(p.x * 0.11 + 4.0, p.y * 0.11 + age * 3.0));
  float energy = glow * flicker;
  float ageFade = 1.0 - t;
  // Il nucleo bianco deve restare SOLO in testa, non ovunque si campioni
  // esattamente il centro della scia (anche in coda glow tocca 1 sulla
  // linea centrale, pur essendo ormai sottilissima): si smorza quindi
  // l'energia usata per il mix colore con (1-eased), indipendente da
  // quella usata per l'alpha/visibilità sotto. Risultato: in coda resta
  // sempre il rosso di base, anche esattamente sul centro del tratto.
  float colorEnergy = energy * (1.0 - eased);
  // Rosso di base (u_trailColor) che sale a bianco dove l'energia è più
  // alta -- stesso "nucleo bianco, bordo colorato" del sonar/Portale.
  outColor = mix(u_trailColor, vec3(1.0), smoothstep(TRAIL_WHITE_CORE_LOW, TRAIL_WHITE_CORE_HIGH, colorEnergy));
  return energy * ageFade;
}

void main() {
  vec2 p = gl_FragCoord.xy + u_offset;
  float alpha = 0.0;
  vec3 color = vec3(0.0);

  // Ogni gruppo (un gesto: un tap fermo, o un trascinamento) contribuisce
  // in modo indipendente; si tiene il contributo più luminoso pixel per
  // pixel invece di sommarli, così due sonar che si sovrappongono non
  // bruciano a bianco pieno solo per la sovrapposizione.
  for (int g = 0; g < MAX_PING_GROUPS; g++) {
    if (g >= u_groupTotal) break;
    int start = u_groupStart[g];
    int count = u_groupCount[g];
    float groupAlpha;
    vec3 groupColor;
    if (count == 1) {
      groupAlpha = sonarAlphaAt(p, u_points[start], u_ages[start], groupColor);
    } else {
      groupAlpha = trailAlphaAt(p, start, count, groupColor);
    }
    if (groupAlpha > alpha) {
      alpha = groupAlpha;
      color = groupColor;
    }
  }

  alpha = clamp(alpha, 0.0, 1.0);
  // Stesso alpha premoltiplicato del Portale (vedi portalFragmentSrc),
  // stesso motivo: evita bordi troppo chiari in composizione.
  fragColor = vec4(color * alpha, alpha);
}
`;

const MAX_PING_POINTS = 32;
const MAX_PING_GROUPS = 8;

// Un gruppo per ogni gesto (`strokeId`, vedi control.js/display.js) --
// senza questo due tap ravvicinati finirebbero nello stesso elenco piatto
// e verrebbero disegnati come un solo trascinamento che li collega.
// L'ordine di inserimento (Map preserva l'ordine di prima apparizione)
// non ha importanza per il rendering: ogni gruppo è indipendente.
function groupPingPointsByStroke(points) {
  const groups = new Map();
  for (const pt of points) {
    let group = groups.get(pt.strokeId);
    if (!group) {
      group = [];
      groups.set(pt.strokeId, group);
    }
    group.push(pt);
  }
  return Array.from(groups.values());
}

// Colore DI BASE (bassa energia) degli anelli del tap singolo -- sale a
// bianco dove l'energia è più alta (vedi RING_WHITE_CORE_LOW/HIGH in
// PING_FRAGMENT_SRC), stesso "nucleo bianco, bordo blu" del Portale.
// Richiesta esplicita: "blu come il Portale" -- un colore fisso proprio
// di questo effetto, non l'accent/tema dell'interfaccia (come invece era
// prima: vedi PING_TRAIL_COLOR_RGB sotto per lo stesso discorso sulla
// scia).
const PING_RING_COLOR_RGB = [0.3, 0.55, 1.0];

// Colore DI BASE della scia a "stella cometa" -- stesso meccanismo del
// sonar sopra, ma rosso come il Portale rosso (richiesta esplicita,
// sostituisce il vecchio colore accent/tema usato dalla scia prima di
// questa modifica).
const PING_TRAIL_COLOR_RGB = [0.9, 0.16, 0.08];

// Raggio massimo dell'anello guida, in frazione della larghezza del
// canvas (non px fissi -- vedi il commento in PingLayer.render()).
const PING_RING_SIZE_PCT = 0.113;

// Larghezza (px, prima della compensazione zoom) della scia alla TESTA.
const PING_TRAIL_WIDTH_PX = 13;

// Raggio d'azione di un gruppo oltre il quale lo shader del ping disegna 0:
// stessi valori di SONAR_REACH/TRAIL_REACH in PING_FRAGMENT_SRC (motivati
// lì). Servono a dimensionare il canvas ridotto del ping.
const PING_SONAR_REACH = 1.05;
const PING_TRAIL_REACH = 1.2;

// Passo (px del buffer) a cui si arrotonda VERSO L'ESTERNO il riquadro dei
// canvas ridotti di ping e AOE: il buffer si rialloca solo quando il
// riquadro supera un multiplo, non a ogni pixel di spostamento della scia.
const SUBCANVAS_SNAP_PX = 32;

// Frame rate massimo delle aree AOE lanciate (AoeShaderLayer): sono animate
// di continuo e ripresentarle a ogni frame del browser costa composizione
// sul Raspberry. Fuoco/fumo/luce a 30 fps non si distinguono dai 60. Unico
// punto da cambiare (vale per /display, /control e /party).
const AOE_SHADER_MAX_FPS = 30;

// Rettangolo [x0,y0,x1,y1] (px) ritagliato al canvas pieno fullW x fullH e
// allargato ai multipli di `snap`. null se vuoto o tutto fuori.
function snapRectPx(x0, y0, x1, y1, fullW, fullH, snap = SUBCANVAS_SNAP_PX) {
  const cx0 = Math.max(0, x0);
  const cy0 = Math.max(0, y0);
  const cx1 = Math.min(fullW, x1);
  const cy1 = Math.min(fullH, y1);
  if (!(cx1 > cx0 && cy1 > cy0)) return null;
  const s = Math.max(1, snap);
  const sx0 = Math.max(0, Math.floor(cx0 / s) * s);
  const sy0 = Math.max(0, Math.floor(cy0 / s) * s);
  const sx1 = Math.min(fullW, Math.ceil(cx1 / s) * s);
  const sy1 = Math.min(fullH, Math.ceil(cy1 / s) * s);
  return { x: sx0, y: sy0, w: sx1 - sx0, h: sy1 - sy0 };
}

// Riquadro (px del canvas pieno, stessa convenzione dei punti in ingresso)
// fuori dal quale nessun gruppo del ping disegna: sonar (gruppo da 1 punto)
// = cerchio di raggio PING_SONAR_REACH*fadeDistance, scia = riquadro dei
// suoi punti allargato di PING_TRAIL_REACH*lineWidth. `groupsPx`: array di
// array di [x, y]. 2 px di margine per l'antialias. null se non resta niente.
function pingGroupsBoundsPx(groupsPx, fadeDistancePx, lineWidthPx, fullW, fullH, snap = SUBCANVAS_SNAP_PX) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const group of groupsPx) {
    if (!group || !group.length) continue;
    const reach = (group.length === 1 ? PING_SONAR_REACH * fadeDistancePx : PING_TRAIL_REACH * lineWidthPx) + 2;
    for (const [x, y] of group) {
      if (x - reach < x0) x0 = x - reach;
      if (y - reach < y0) y0 = y - reach;
      if (x + reach > x1) x1 = x + reach;
      if (y + reach > y1) y1 = y + reach;
    }
  }
  if (x0 === Infinity) return null;
  return snapRectPx(x0, y0, x1, y1, fullW, fullH, snap);
}

// Unione di rettangoli {x, y, w, h} (px), ritagliata e arrotondata come
// snapRectPx. null se la lista è vuota.
function unionRectsPx(rects, fullW, fullH, snap = SUBCANVAS_SNAP_PX) {
  if (!rects.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return snapRectPx(x0, y0, x1, y1, fullW, fullH, snap);
}

// Chiavi di `keys` (iterabile) che non compaiono in `presentIds`: lo stato
// per area da buttare quando l'area non c'è più.
function idsNotIn(keys, presentIds) {
  const present = new Set(presentIds);
  return [...keys].filter((k) => !present.has(k));
}

// true se è ora di ridisegnare un layer limitato a `maxFps`. Tolleranza del
// 15% sull'intervallo: a 60 Hz i rAF arrivano ogni ~16,7 ms, così si
// disegna un frame sì e uno no (30 fps) anche con un po' di jitter; sotto i
// 30 fps della pagina si disegna a ogni frame.
function frameDue(nowMs, lastMs, maxFps) {
  if (lastMs == null || !(maxFps > 0)) return true;
  return nowMs - lastMs >= (1000 / maxFps) * 0.85;
}

// Canvas "ridotto": invece di un canvas WebGL grande quanto la mappa
// (ripulito, ripresentato e ricomposto sopra il video a ogni frame), il
// buffer copre solo `rect` (px del canvas pieno, origine in basso a
// sinistra come gl.viewport) e il canvas è posizionato via CSS, in
// percentuale del contenitore, esattamente su quel riquadro. Il canvas
// pieno è quello che il canvas avrebbe con inset:0 (la classe CSS di
// sempre): dimensione del genitore x devicePixelRatio. `rect` null =
// niente da disegnare: canvas nascosto (display:none), non ripulito né
// ripresentato.
//
// `growOnly` (ping): finché il canvas resta visibile il buffer cresce ma non
// si restringe, e il riquadro usato è allargato alla misura del buffer.
// Cambiare canvas.width/height rialloca il buffer WebGL, e costa: misurato in
// locale 7-11 ms di CPU per resize contro 0,03 ms di un render() senza, e una
// scia in movimento ne provocava ~13 al secondo (passi di 32 px). Fuori dal
// riquadro vero lo shader del ping dà alpha 0, quindi i pixel non cambiano.
// Quando il canvas si nasconde (niente ping vivi) la misura riparte da zero.
class SubCanvas {
  constructor(canvas, { growOnly = false } = {}) {
    this.canvas = canvas;
    this.growOnly = growOnly;
    // Ultimo riquadro usato (solo growOnly): da qui si sposta il meno possibile.
    this.lastRect = null;
    this.styleKey = '';
    // Nascosto finché non c'è qualcosa da disegnare: un canvas WebGL mai
    // disegnato resta comunque un layer (trasparente) da comporre.
    this.shown = false;
    canvas.style.display = 'none';
  }

  fullSize() {
    const dpr = window.devicePixelRatio || 1;
    const parent = this.canvas.parentElement;
    const cssW = Math.max(1, Math.round(parent ? parent.clientWidth : this.canvas.clientWidth));
    const cssH = Math.max(1, Math.round(parent ? parent.clientHeight : this.canvas.clientHeight));
    return { w: Math.max(1, Math.round(cssW * dpr)), h: Math.max(1, Math.round(cssH * dpr)) };
  }

  hide() {
    this.lastRect = null;
    if (!this.shown) return;
    this.shown = false;
    this.canvas.style.display = 'none';
  }

  // Riquadro davvero usato per `rect` (vedi growOnly): uguale a `rect`, oppure
  // grande quanto il buffer attuale se più grande, posizionato in modo da
  // contenere `rect` e restare dentro il canvas pieno, spostandosi il meno
  // possibile dall'ultimo.
  grownRect(rect, full) {
    const last = this.lastRect;
    if (!this.growOnly || !last || last.fullW !== full.w || last.fullH !== full.h) return rect;
    const w = Math.min(full.w, Math.max(rect.w, last.w));
    const h = Math.min(full.h, Math.max(rect.h, last.h));
    const fit = (prev, r0, rLen, len, fullLen) => {
      const p = Math.min(Math.max(prev, r0 + rLen - len), r0);
      return Math.min(Math.max(p, 0), fullLen - len);
    };
    return { x: fit(last.x, rect.x, rect.w, w, full.w), y: fit(last.y, rect.y, rect.h, h, full.h), w, h };
  }

  // Posiziona il canvas su `rect` (o sul riquadro allargato, con growOnly) e
  // ritorna il riquadro usato: viewport e offset dello shader vanno presi da
  // qui, non da `rect`.
  place(rectIn, full) {
    const rect = this.grownRect(rectIn, full);
    if (this.growOnly) this.lastRect = { ...rect, fullW: full.w, fullH: full.h };
    if (this.canvas.width !== rect.w) this.canvas.width = rect.w;
    if (this.canvas.height !== rect.h) this.canvas.height = rect.h;
    const key = `${rect.x},${rect.y},${rect.w},${rect.h},${full.w},${full.h}`;
    if (key !== this.styleKey) {
      this.styleKey = key;
      const st = this.canvas.style;
      st.inset = 'auto';
      st.left = `${(rect.x / full.w) * 100}%`;
      st.top = `${((full.h - rect.y - rect.h) / full.h) * 100}%`;
      st.width = `${(rect.w / full.w) * 100}%`;
      st.height = `${(rect.h / full.h) * 100}%`;
    }
    if (!this.shown) {
      this.shown = true;
      this.canvas.style.display = '';
    }
    return rect;
  }
}

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
    // Nascosto (visibility: il layout resta valido per syncCanvasSize)
    // finché render() non riceve decorazioni da disegnare.
    this.hidden = true;
    canvasEl.style.visibility = 'hidden';
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
    if (!this.available) return;
    const gl = this.gl;
    // Niente da disegnare: il canvas si nasconde (visibility, così
    // clientWidth resta valido per syncCanvasSize) invece di essere
    // ripulito e ripresentato a ogni frame del loop.
    if (!decorations || !decorations.length) {
      if (!this.hidden) {
        this.hidden = true;
        this.canvas.style.visibility = 'hidden';
      }
      return;
    }
    if (!naturalW || !naturalH) return;
    if (this.hidden) {
      this.hidden = false;
      this.canvas.style.visibility = '';
    }
    this.syncCanvasSize();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

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
      gl.uniform1f(cachedUniformLocation(gl, program, 'u_time'), time);
      gl.uniform2f(cachedUniformLocation(gl, program, 'u_resolution'), wPx, hPx);
      gl.uniform2f(cachedUniformLocation(gl, program, 'u_viewportOrigin'), originXPx, yPx);
      if (def.usesNoiseTexture) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.ensureNoiseTexture());
        gl.uniform1i(cachedUniformLocation(gl, program, 'u_noise'), 0);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
  }
}

// Canvas dedicato al ping, separato da ShaderLayer: quello renderizza le
// decorazioni persistite per location (un rettangolo alla volta, dentro il
// proprio viewport); questo un gesto effimero lato client (mai salvato),
// un solo pass a schermo intero per frame. Riusato identico da /control e
// /display -- stesso canvas, stesso shader, stessa chiamata.
class PingLayer {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.gl = canvasEl.getContext('webgl2');
    this.program = null;
    this.noiseTexture = null;
    this.sub = new SubCanvas(canvasEl, { growOnly: true });
  }

  get available() {
    return Boolean(this.gl);
  }

  ensureProgram() {
    if (this.program) return this.program;
    try {
      this.program = linkProgram(this.gl, SHADER_VERTEX_SRC, PING_FRAGMENT_SRC);
    } catch (err) {
      console.warn(`PingLayer: impossibile compilare/linkare lo shader: ${err.message}`);
      this.program = null;
    }
    return this.program;
  }

  // Stessa texture di rumore di ShaderLayer.ensureNoiseTexture() -- non
  // condivisibile con quella (contesti WebGL diversi, un canvas ciascuno),
  // quindi una copia piccola invece di una dipendenza incrociata tra le
  // due classi.
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

  // `points`: array di `{x, y, age}` -- x/y in percentuale (0-100, stesso
  // spazio locale pre-rotazione di fog/aoe/grid), age in secondi da quando
  // il punto è stato aggiunto (0 = appena piazzato). `lifespanSec`: durata
  // dopo la quale un punto è completamente sfumato -- deve combaciare con
  // quella usata dal chiamante per scartare i punti troppo vecchi
  // dall'array, altrimenti un punto già scartato lì ma non qui (o
  // viceversa) produrrebbe un salto visibile invece di uno sfumato.
  // `zoomScale`: fattore di scala del transform CSS che avvolge il canvas
  // in questo momento (`localZoom.scale` su /control, lo scale condiviso
  // pan/zoom su /display) -- lo stesso motivo/stessa compensazione già
  // fatta per griglia e contorno AOE: senza dividere per questo valore,
  // la taglia dell'anello cambierebbe con lo zoom invece di restare
  // quella scelta (richiesta dell'utente: su /display appariva più
  // piccolo che su /control proprio per questo, a scale diversi).
  // `groups`: array di array di `{x, y, age}` -- un array per gesto
  // (vedi groupPingPointsByStroke), NON un'unica lista piatta: due gesti
  // non devono mai essere collegati da una scia solo perché entrambi
  // ancora vivi nello stesso frame.
  render(groups, lifespanSec, zoomScale = 1) {
    if (!this.available) return;
    const gl = this.gl;
    // Niente ping vivi: canvas nascosto, né ripulito né ripresentato.
    if (!groups || !groups.length) {
      this.sub.hide();
      return;
    }
    const program = this.ensureProgram();
    if (!program) {
      this.sub.hide();
      return;
    }
    // Coordinate nel canvas "pieno" (grande quanto la mappa, come prima):
    // il canvas vero copre solo il riquadro dei gruppi vivi (SubCanvas).
    const full = this.sub.fullSize();

    const xy = new Float32Array(MAX_PING_POINTS * 2);
    const ages = new Float32Array(MAX_PING_POINTS);
    const groupStart = new Int32Array(MAX_PING_GROUPS);
    const groupCount = new Int32Array(MAX_PING_GROUPS);
    const groupsPx = [];
    let flatIdx = 0;
    let groupIdx = 0;
    for (const group of groups) {
      if (groupIdx >= MAX_PING_GROUPS) break;
      const budget = MAX_PING_POINTS - flatIdx;
      if (budget <= 0) break;
      // Oltre il budget rimasto si tiene solo la coda più recente di
      // QUESTO gruppo: con il throttle a distanza minima lato chiamante
      // (vedi PING_MIN_POINT_DIST_PCT in control.js) e un lifespan di
      // ~1 secondo, non dovrebbe mai scattare in uso normale -- è solo
      // una rete di sicurezza, come prima.
      const count = Math.min(group.length, budget);
      const tailStart = Math.max(0, group.length - count);
      groupStart[groupIdx] = flatIdx;
      groupCount[groupIdx] = count;
      const groupPx = [];
      for (let i = 0; i < count; i++) {
        const pt = group[tailStart + i];
        const x = (pt.x / 100) * full.w;
        // gl_FragCoord ha origine in basso a sinistra, la nostra
        // percentuale in alto a sinistra (come il DOM/CSS): l'asse Y va
        // invertito, stesso motivo di ShaderLayer.render().
        const y = full.h - (pt.y / 100) * full.h;
        xy[flatIdx * 2] = x;
        xy[flatIdx * 2 + 1] = y;
        ages[flatIdx] = pt.age;
        groupPx.push([x, y]);
        flatIdx++;
      }
      groupsPx.push(groupPx);
      groupIdx++;
    }
    if (!flatIdx) {
      this.sub.hide();
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const zoomComp = Math.max(zoomScale, 0.01);
    // Larghezza alla TESTA della cometa (vedi TRAIL_TAIL_WIDTH_FRAC nello
    // shader per quella in coda): 13, non più 7 -- richiesta esplicita,
    // "più spesso tutto".
    const lineWidth = (PING_TRAIL_WIDTH_PX * dpr) / zoomComp;
    // Raggio massimo dell'anello "radar ping" del tap fermo (vedi
    // PING_FRAGMENT_SRC): PERCENTUALE della larghezza del canvas, non px
    // fissi -- /control e /display hanno canvas di risoluzione molto
    // diversa (telefono del DM vs TV/monitor dei giocatori), quindi un
    // valore fisso appariva piccolo su uno schermo grande anche a parità
    // di zoom (richiesta dell'utente: "da display lo vedo ancora
    // piccolo"). dpr è già incluso in full.w (larghezza in px del buffer
    // del canvas pieno), non va applicato una seconda volta qui.
    // Spessore/spaziatura/crackle sono tutti frazioni di questo valore
    // (vedi RING_*_FRAC nello shader), quindi scalarlo scala l'intero
    // effetto insieme -- PING_RING_SIZE_PCT include già il fattore 1,3×
    // richiesto in precedenza (prima era 45*1.3px su un canvas tipico di
    // ~516px, cioè ~0.113 della larghezza).
    const fadeDistance = (PING_RING_SIZE_PCT * full.w) / zoomComp;

    // Solo il riquadro dove almeno un gruppo può disegnare qualcosa: fuori
    // lo shader darebbe comunque alpha 0 (vedi SONAR_REACH/TRAIL_REACH).
    const bounds = pingGroupsBoundsPx(groupsPx, fadeDistance, lineWidth, full.w, full.h);
    if (!bounds) {
      this.sub.hide();
      return;
    }
    // Il buffer non si restringe finché ci sono ping vivi (SubCanvas growOnly):
    // il riquadro usato può essere più grande di `bounds`.
    const rect = this.sub.place(bounds, full);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, rect.w, rect.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    if (!this.uniforms) {
      const loc = (n) => cachedUniformLocation(gl, program, n);
      this.uniforms = {
        points: loc('u_points'),
        ages: loc('u_ages'),
        groupStart: loc('u_groupStart'),
        groupCount: loc('u_groupCount'),
        groupTotal: loc('u_groupTotal'),
        lifespan: loc('u_lifespan'),
        ringColor: loc('u_ringColor'),
        trailColor: loc('u_trailColor'),
        lineWidth: loc('u_lineWidth'),
        fadeDistance: loc('u_fadeDistance'),
        noise: loc('u_noise'),
        offset: loc('u_offset')
      };
    }
    const u = this.uniforms;
    gl.uniform2fv(u.points, xy);
    gl.uniform1fv(u.ages, ages);
    gl.uniform1iv(u.groupStart, groupStart);
    gl.uniform1iv(u.groupCount, groupCount);
    gl.uniform1i(u.groupTotal, groupIdx);
    gl.uniform1f(u.lifespan, lifespanSec);
    gl.uniform3f(u.ringColor, PING_RING_COLOR_RGB[0], PING_RING_COLOR_RGB[1], PING_RING_COLOR_RGB[2]);
    gl.uniform3f(u.trailColor, PING_TRAIL_COLOR_RGB[0], PING_TRAIL_COLOR_RGB[1], PING_TRAIL_COLOR_RGB[2]);
    gl.uniform1f(u.lineWidth, lineWidth);
    gl.uniform1f(u.fadeDistance, fadeDistance);
    gl.uniform2f(u.offset, rect.x, rect.y);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.ensureNoiseTexture());
    gl.uniform1i(u.noise, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

// Renderizza lo shader "lanciato" (vedi fulmine per pillola in control.js,
// aoe.cast) di una o più AoE piazzate, ritagliato sulla vera sagoma di
// ciascuna -- gemello di ShaderLayer per le decorazioni del Portale, ma con
// geometria diversa: qui il rettangolo di rendering è il bounding box della
// forma RUOTATA (mai allineato agli assi come le decorazioni, che non
// ruotano), e il ritaglio poligonale extra (vedi aoeEffectFragmentSrc/
// aoeShaderMaskRect) impedisce che lo shader riempia l'intero bbox invece
// della sola sagoma. Riusato identico da /control e /display.
// Lato lungo massimo (px) della simulazione della scia del cerchio
// d'evocazione: la simulazione gira su una texture piccola, mai più grande
// del riquadro dell'area. Sul Raspberry ogni pass costa ~16k pixel.
const EVOCATION_SIM_MAX_PX = 128;
// Altezza (px) dello schermo per cui la spinta dell'originale (0.3 px per
// frame) è pensata: vedi u_force.
const EVOCATION_REF_HEIGHT_PX = 1080;
// Un passo copre al massimo questi frame da 60 fps: sotto i 15 fps la scia
// rallenta invece di fare salti grandi (instabili).
const EVOCATION_MAX_STEP_SCALE = 4;
// Colore della scia (rgb 0-1), TRAIL_COLOR dell'originale.
const EVOCATION_TRAIL_RGB = [1.0, 0.1, 0.05];

// Misure (px interi >= 1) della simulazione per un riquadro wPx x hPx:
// stesse proporzioni, lato lungo al massimo maxSide, mai più grande.
function evocationSimSize(wPx, hPx, maxSide = EVOCATION_SIM_MAX_PX) {
  const w = Math.max(1, Math.round(wPx));
  const h = Math.max(1, Math.round(hPx));
  const k = Math.min(1, maxSide / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

// Parametri di un passo di simulazione dopo dtMs millisecondi (null o non
// positivo: primo passo, vale un frame da 60 fps). stepScale = frame da 60
// fps coperti, tra 0.25 e maxScale; decay e inject sono quelli
// dell'originale (0.9981 e 0.07 per frame) riportati a stepScale frame.
function evocationStepParams(dtMs, maxScale = EVOCATION_MAX_STEP_SCALE) {
  const raw = dtMs == null || !(dtMs > 0) ? 1 : dtMs / (1000 / 60);
  const stepScale = Math.min(maxScale, Math.max(0.25, raw));
  return { stepScale, decay: Math.pow(0.9981, stepScale), inject: 0.07 * stepScale };
}

// Posizioni degli uniform tenute in memoria per programma: evita ~25
// getUniformLocation a ogni frame. Chiave: il programma (WeakMap).
const uniformLocationCache = new WeakMap();
function cachedUniformLocation(gl, prog, name) {
  let m = uniformLocationCache.get(prog);
  if (!m) {
    m = new Map();
    uniformLocationCache.set(prog, m);
  }
  if (!m.has(name)) m.set(name, gl.getUniformLocation(prog, name));
  return m.get(name);
}

// Stato della simulazione della scia di UNA area (texture e framebuffer a
// risoluzione ridotta): rune (RGBA8), fluido e colore in ping-pong (RGBA16F,
// serve EXT_color_buffer_float). `ok` false se i framebuffer float non sono
// completi: il chiamante butta l'oggetto e disegna senza scia.
class EvocationSim {
  constructor(gl, w, h) {
    this.gl = gl;
    this.w = w;
    this.h = h;
    this.lastStepMs = null;
    this.textures = [];
    this.framebuffers = [];
    const tex = (internal, type) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.viewport(0, 0, w, h);
      if (complete) {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      this.textures.push(t);
      this.framebuffers.push(fb);
      return { tex: t, fb, complete };
    };
    this.rune = tex(gl.RGBA8, gl.UNSIGNED_BYTE);
    this.fluid = [tex(gl.RGBA16F, gl.HALF_FLOAT), tex(gl.RGBA16F, gl.HALF_FLOAT)];
    this.dye = [tex(gl.RGBA16F, gl.HALF_FLOAT), tex(gl.RGBA16F, gl.HALF_FLOAT)];
    this.ok = [this.rune, ...this.fluid, ...this.dye].every((x) => x.complete);
    // Indice della texture con lo stato più recente di fluido e colore.
    this.fluidIndex = 0;
    this.dyeIndex = 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  get dyeTexture() {
    return this.dye[this.dyeIndex].tex;
  }

  // Un passo: rune -> fluido -> colore. Lascia legato il framebuffer del
  // canvas (null); viewport e programma li rimette il chiamante.
  step(programs, timeSec, nowMs) {
    const gl = this.gl;
    const { stepScale, decay, inject } = evocationStepParams(this.lastStepMs == null ? null : nowMs - this.lastStepMs);
    this.lastStepMs = nowMs;
    const u = (prog, name) => cachedUniformLocation(gl, prog, name);
    const bindTex = (unit, t, prog, name) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.uniform1i(u(prog, name), unit);
    };
    gl.viewport(0, 0, this.w, this.h);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.rune.fb);
    gl.useProgram(programs.rune);
    gl.uniform1f(u(programs.rune, 'u_time'), timeSec);
    gl.uniform2f(u(programs.rune, 'u_resolution'), this.w, this.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const fRead = this.fluidIndex;
    const fWrite = 1 - fRead;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fluid[fWrite].fb);
    gl.useProgram(programs.fluid);
    gl.uniform2f(u(programs.fluid, 'u_resolution'), this.w, this.h);
    gl.uniform1f(u(programs.fluid, 'u_stepScale'), stepScale);
    gl.uniform1f(u(programs.fluid, 'u_decay'), decay);
    gl.uniform1f(u(programs.fluid, 'u_force'), this.h / EVOCATION_REF_HEIGHT_PX);
    bindTex(0, this.fluid[fRead].tex, programs.fluid, 'u_fluid');
    bindTex(1, this.rune.tex, programs.fluid, 'u_rune');
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.fluidIndex = fWrite;

    const dRead = this.dyeIndex;
    const dWrite = 1 - dRead;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.dye[dWrite].fb);
    gl.useProgram(programs.dye);
    gl.uniform2f(u(programs.dye, 'u_resolution'), this.w, this.h);
    gl.uniform1f(u(programs.dye, 'u_stepScale'), stepScale);
    gl.uniform1f(u(programs.dye, 'u_decay'), decay);
    gl.uniform1f(u(programs.dye, 'u_inject'), inject);
    gl.uniform3f(u(programs.dye, 'u_trailColor'), EVOCATION_TRAIL_RGB[0], EVOCATION_TRAIL_RGB[1], EVOCATION_TRAIL_RGB[2]);
    bindTex(0, this.dye[dRead].tex, programs.dye, 'u_dye');
    bindTex(1, this.fluid[this.fluidIndex].tex, programs.dye, 'u_fluid');
    bindTex(2, this.rune.tex, programs.dye, 'u_rune');
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.dyeIndex = dWrite;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  dispose() {
    const gl = this.gl;
    this.framebuffers.forEach((fb) => gl.deleteFramebuffer(fb));
    this.textures.forEach((t) => gl.deleteTexture(t));
    this.framebuffers = [];
    this.textures = [];
  }
}

class AoeShaderLayer {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.gl = canvasEl.getContext('webgl2');
    this.programs = new Map(); // shaderId -> WebGLProgram
    this.sub = new SubCanvas(canvasEl);
    this.lastDrawMs = null;
    this.lastKey = '';
    // aoe.id -> performance.now() della prima volta che l'area è stata
    // vista lanciata (dissolvenza d'entrata dei cerchi d'evocazione).
    this.firstSeenMs = new Map();
    // aoe.id -> EvocationSim, solo per le aree con uno shader `multipass`.
    this.sims = new Map();
    this.simPrograms = undefined; // undefined = non ancora provati, null = falliti
    this.simUnavailable = false; // niente render target float: niente scia
  }

  // Programmi dei pass di simulazione, linkati alla prima area che li usa.
  getSimPrograms() {
    if (this.simPrograms !== undefined) return this.simPrograms;
    try {
      const gl = this.gl;
      this.simPrograms = {
        rune: linkProgram(gl, SHADER_VERTEX_SRC, EVOCATION_SIM_PROGRAMS.rune),
        fluid: linkProgram(gl, SHADER_VERTEX_SRC, EVOCATION_SIM_PROGRAMS.fluid),
        dye: linkProgram(gl, SHADER_VERTEX_SRC, EVOCATION_SIM_PROGRAMS.dye)
      };
    } catch (err) {
      console.warn(`AoeShaderLayer: simulazione della scia non disponibile: ${err.message}`);
      this.simPrograms = null;
    }
    return this.simPrograms;
  }

  // Simulazione dell'area `id` a misura per un riquadro wPx x hPx (rifatta
  // da zero se le misure cambiano), null se la scia non si può fare.
  simFor(id, wPx, hPx) {
    if (this.simUnavailable || !this.getSimPrograms()) return null;
    const size = evocationSimSize(wPx, hPx);
    let sim = this.sims.get(id);
    if (sim && (sim.w !== size.w || sim.h !== size.h)) {
      sim.dispose();
      sim = null;
    }
    if (!sim) {
      const gl = this.gl;
      sim = (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float')) ? new EvocationSim(gl, size.w, size.h) : null;
      if (!sim || !sim.ok) {
        if (sim) sim.dispose();
        this.simUnavailable = true;
        console.warn('AoeShaderLayer: niente render target float (EXT_color_buffer_float / EXT_color_buffer_half_float): cerchio d\'evocazione senza scia');
        return null;
      }
      this.sims.set(id, sim);
    }
    return sim;
  }

  disposeSims(ids) {
    for (const id of ids) {
      const sim = this.sims.get(id);
      if (sim) sim.dispose();
      this.sims.delete(id);
    }
  }

  get available() {
    return Boolean(this.gl);
  }

  getProgram(shaderId) {
    if (this.programs.has(shaderId)) return this.programs.get(shaderId);
    const def = AOE_SHADER_EFFECTS[shaderId];
    if (!def) return null;
    try {
      const program = linkProgram(this.gl, SHADER_VERTEX_SRC, def.fragmentSrc);
      this.programs.set(shaderId, program);
      return program;
    } catch (err) {
      console.warn(`AoeShaderLayer: impossibile compilare/linkare lo shader "${shaderId}": ${err.message}`);
      this.programs.set(shaderId, null);
      return null;
    }
  }

  // `aoes`: array di AoE con `shaderId` già risolto (vedi resolveAoeShaderId
  // in media.js) -- solo quelle "lanciate" (cast === true); il chiamante
  // filtra, qui non si controlla aoe.cast.
  render(aoes, grid, naturalW, naturalH) {
    if (!this.available) return;
    const gl = this.gl;
    // Niente aree lanciate: canvas nascosto, né ripulito né ripresentato.
    if (!aoes || !aoes.length) {
      this.sub.hide();
      this.lastKey = '';
      this.firstSeenMs.clear();
      this.disposeSims([...this.sims.keys()]);
      return;
    }
    if (!naturalW || !naturalH) return;
    // Canvas "pieno" grande quanto la mappa (come prima): le coordinate di
    // ogni area si calcolano lì, poi il canvas vero copre solo l'unione dei
    // riquadri delle aree (SubCanvas).
    const full = this.sub.fullSize();
    const nowMs = performance.now();
    // Le aree sono animate di continuo: si ridisegnano al più a
    // AOE_SHADER_MAX_FPS. Se cambia qualcosa (aree, griglia, misure) si
    // ridisegna subito, senza aspettare il turno.
    const key = JSON.stringify([aoes, grid, naturalW, naturalH, full.w, full.h]);
    if (key === this.lastKey && !frameDue(nowMs, this.lastDrawMs, AOE_SHADER_MAX_FPS)) return;

    const time = nowMs / 1000;
    // Stesso rapporto per entrambi gli assi: naturalW/H -> canvas pieno è
    // sempre lo stesso fattore già usato per rectPct -> xPx/wPx qui sotto,
    // quindi riusarlo diretto per i punti della maschera evita di
    // ricalcolarlo (con un arrotondamento diverso) da wPx/hPx già
    // arrotondati.
    const scaleX = full.w / naturalW;
    const scaleY = full.h / naturalH;

    const items = [];
    aoes.forEach((aoe) => {
      if (!aoe.shaderId) return;
      const program = this.getProgram(aoe.shaderId);
      if (!program) return;
      const { rectPct, maskPointsPx } = aoeShaderMaskRect(aoe, grid, naturalW, naturalH);
      const xPx = (rectPct.leftPct / 100) * full.w;
      const topPx = (rectPct.topPct / 100) * full.h;
      const wPx = Math.max(1, Math.round((rectPct.widthPct / 100) * full.w));
      const hPx = Math.max(1, Math.round((rectPct.heightPct / 100) * full.h));
      // gl.viewport usa origine in basso a sinistra, la nostra percentuale
      // è in alto a sinistra (come il DOM/CSS): l'asse Y va invertito,
      // stesso motivo di ShaderLayer.render().
      const yPx = Math.round(full.h - topPx - hPx);
      const originXPx = Math.round(xPx);
      if (!this.firstSeenMs.has(aoe.id)) this.firstSeenMs.set(aoe.id, nowMs);
      const age = (nowMs - this.firstSeenMs.get(aoe.id)) / 1000;
      items.push({ aoe, program, maskPointsPx, age, x: originXPx, y: yPx, w: wPx, h: hPx });
    });
    const presentIds = aoes.map((a) => a.id);
    for (const id of idsNotIn(this.firstSeenMs.keys(), presentIds)) this.firstSeenMs.delete(id);
    // Simulazioni di aree sparite, o che non usano più uno shader multi-pass.
    const multipassIds = items.filter((it) => AOE_SHADER_EFFECTS[it.aoe.shaderId].multipass).map((it) => it.aoe.id);
    this.disposeSims(idsNotIn(this.sims.keys(), multipassIds));
    this.lastKey = key;
    const rect = unionRectsPx(items, full.w, full.h);
    if (!rect) {
      this.sub.hide();
      return;
    }
    this.lastDrawMs = nowMs;
    this.sub.place(rect, full);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, rect.w, rect.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    items.forEach(({ aoe, program, maskPointsPx, age, x, y, w: wPx, h: hPx }) => {
      // Stesso rettangolo del canvas pieno, spostato nel canvas ridotto:
      // dentro il rettangolo (fragCoord = gl_FragCoord - u_viewportOrigin)
      // i pixel restano identici.
      const originXPx = x - rect.x;
      const yPx = y - rect.y;
      const def = AOE_SHADER_EFFECTS[aoe.shaderId];
      // Multi-pass: prima un passo di simulazione nei framebuffer dell'area
      // (risoluzione ridotta), poi la composizione qui sotto, nel riquadro.
      const sim = def.multipass ? this.simFor(aoe.id, wPx, hPx) : null;
      if (sim) sim.step(this.simPrograms, time, nowMs);
      gl.viewport(originXPx, yPx, wPx, hPx);
      gl.useProgram(program);
      if (def.multipass) {
        gl.uniform1i(cachedUniformLocation(gl, program, 'u_hasDye'), sim ? 1 : 0);
        if (sim) {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, sim.dyeTexture);
          gl.uniform1i(cachedUniformLocation(gl, program, 'u_dye'), 0);
          gl.uniform2f(cachedUniformLocation(gl, program, 'u_dyeTexel'), 1 / sim.w, 1 / sim.h);
        }
      }
      gl.uniform1f(cachedUniformLocation(gl, program, 'u_time'), time);
      gl.uniform2f(cachedUniformLocation(gl, program, 'u_resolution'), wPx, hPx);
      gl.uniform2f(cachedUniformLocation(gl, program, 'u_viewportOrigin'), originXPx, yPx);
      // Solo i cerchi d'evocazione dichiarano u_age: per gli altri la
      // location è null e la chiamata non fa niente.
      gl.uniform1f(cachedUniformLocation(gl, program, 'u_age'), age);

      const maxPts = Math.min(maskPointsPx.length, 32);
      const flat = new Float32Array(32 * 2);
      // Punto più lontano dal centro del rettangolo, in "unità p" (stessa
      // normalizzazione di ogni shader portato: p = (2*fragCoord-res.xy)/
      // res.y, quindi 1 unità di p = hPx/2 pixel) -- usato solo per
      // Cubo/Sfera (vedi shapeWarp sotto), Cono/Linea hanno un bersaglio
      // costante perché passano per lo spazio "srotolato".
      let maxReachP = 0;
      for (let i = 0; i < maxPts; i++) {
        const px = maskPointsPx[i][0] * scaleX;
        const py = maskPointsPx[i][1] * scaleY;
        flat[i * 2] = px;
        flat[i * 2 + 1] = py;
        const reach = Math.hypot(px - wPx / 2, py - hPx / 2) / (hPx / 2);
        if (reach > maxReachP) maxReachP = reach;
      }
      gl.uniform2fv(cachedUniformLocation(gl, program, 'u_maskPoints'), flat);
      gl.uniform1i(cachedUniformLocation(gl, program, 'u_maskCount'), maxPts);

      // Questi shader portati spengono il proprio bagliore radiale ben
      // prima del bordo del loro rettangolo "nativo" (un cerchio inscritto
      // vicino al centro) -- su Cono/Linea questo lasciava gran parte della
      // sagoma scura anche dentro il ritaglio poligonale (segnalato
      // dall'utente: "quasi nessuno occupano tutto lo spazio"). Per queste
      // due forme non basta un riscalo uniforme dal centro: il Cono si
      // allarga dal vertice, la Linea è stretta e lunga -- entrambe vengono
      // "srotolate" in un sistema di coordinate locale alla forma (vedi
      // shapeWarp in aoeEffectFragmentSrc) PRIMA di applicare lo stesso
      // riscalo, così il punto più lontano della sagoma vera coincide
      // sempre con l'angolo di un quadrato unitario (raggio costante
      // sqrt(2)), indipendentemente da quanto la forma reale sia allungata
      // o stretta. Cubo/Sfera restano nello spazio reale (già un buon
      // adattamento naturale: un cerchio dentro un quadrato/cerchio).
      const allowFillScale = !def || def.fillScale !== false;
      const warp = allowFillScale ? aoeShapeWarpParams(aoe.shape, maskPointsPx, scaleX, scaleY, hPx) : null;
      const maxReachForScale = warp ? Math.SQRT2 : maxReachP;
      const fillScale = allowFillScale ? Math.min(1, AOE_FILL_TARGET_REACH / Math.max(maxReachForScale, 0.001)) : 1;
      gl.uniform1f(cachedUniformLocation(gl, program, 'u_fillScale'), fillScale);
      gl.uniform1i(cachedUniformLocation(gl, program, 'u_shapeWarp'), warp ? 1 : 0);
      if (warp) {
        gl.uniform2f(cachedUniformLocation(gl, program, 'u_shapeOrigin'), warp.origin[0], warp.origin[1]);
        gl.uniform2f(cachedUniformLocation(gl, program, 'u_shapeAxis'), warp.axis[0], warp.axis[1]);
        gl.uniform1f(cachedUniformLocation(gl, program, 'u_shapeLength'), warp.length);
        gl.uniform1f(cachedUniformLocation(gl, program, 'u_shapeNearHalfWidth'), warp.nearHalfWidth);
        gl.uniform1f(cachedUniformLocation(gl, program, 'u_shapeFarHalfWidth'), warp.farHalfWidth);
      }

      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
  }
}

// Calcola il sistema di coordinate locale "srotolato" di Cono/Linea per lo
// shapeWarp di aoeEffectFragmentSrc -- null per Cubo/Sfera (non ne hanno
// bisogno, vedi sopra). `maskPointsPx` è lo stesso array di
// aoeShaderMaskRect, in pixel reali dell'immagine, TOP-DOWN, relativo
// all'angolo in alto a sinistra del bbox: per il Cono i punti sono
// [vertice, baseSinistra, baseDestra] (ordine di aoeShapePointsPx), per la
// Linea [vicinoSinistra, vicinoDestra, lontanoDestra, lontanoSinistra].
// Restituisce origine/asse/lunghezza/semi-larghezze in pixel CANVAS,
// convenzione bottom-up di gl_FragCoord (da qui il flip di Y: i punti in
// ingresso sono top-down).
function aoeShapeWarpParams(shape, maskPointsPx, scaleX, scaleY, hPx) {
  const toGl = ([x, y]) => [x * scaleX, hPx - y * scaleY];
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  if (shape === 'cone' && maskPointsPx.length >= 3) {
    const apex = toGl(maskPointsPx[0]);
    const base1 = toGl(maskPointsPx[1]);
    const base2 = toGl(maskPointsPx[2]);
    const baseMid = mid(base1, base2);
    const length = dist(apex, baseMid) || 1;
    return {
      origin: apex,
      axis: [(baseMid[0] - apex[0]) / length, (baseMid[1] - apex[1]) / length],
      length,
      nearHalfWidth: 0,
      farHalfWidth: dist(base1, base2) / 2
    };
  }

  if (shape === 'line' && maskPointsPx.length >= 4) {
    const near1 = toGl(maskPointsPx[0]);
    const near2 = toGl(maskPointsPx[1]);
    const far2 = toGl(maskPointsPx[2]);
    const far1 = toGl(maskPointsPx[3]);
    const nearMid = mid(near1, near2);
    const farMid = mid(far1, far2);
    const length = dist(nearMid, farMid) || 1;
    const halfWidth = dist(near1, near2) / 2;
    return {
      origin: nearMid,
      axis: [(farMid[0] - nearMid[0]) / length, (farMid[1] - nearMid[1]) / length],
      length,
      nearHalfWidth: halfWidth,
      farHalfWidth: halfWidth
    };
  }

  return null;
}

// Funzioni pure esportate per i test (node --test); nel browser il file resta
// uno script classico con globali.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SubCanvas,
    snapRectPx,
    pingGroupsBoundsPx,
    unionRectsPx,
    frameDue,
    idsNotIn,
    evocationSimSize,
    evocationStepParams,
    EVOCATION_SIM_MAX_PX,
    EVOCATION_MAX_STEP_SCALE,
    EVOCATION_SIM_PROGRAMS,
    AOE_SHADER_EFFECTS,
    PING_SONAR_REACH,
    PING_TRAIL_REACH,
    SUBCANVAS_SNAP_PX,
    AOE_SHADER_MAX_FPS,
    PING_FRAGMENT_SRC
  };
}
