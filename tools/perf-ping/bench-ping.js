// Micro-benchmark del solo PingLayer, da eseguire DENTRO /display (iniettato
// da measure.mjs --bench). Rende N volte la stessa scena di ping, ognuna
// seguita da una readPixels di 1 pixel per sincronizzare, e misura il tempo
// per render: costo GPU più un overhead fisso (la riga "clear").
// Ritorna righe { caso, res, ms/render }.
// LIMITE: da quando PingLayer.render() riduce canvas.width al riquadro dei
// ping, il buffer non ha più la dimensione impostata qui sotto. `res` riporta
// quindi la dimensione del CONTENITORE (canvas pieno), non del buffer ridotto;
// il ciclo su `sizes` non fissa più la risoluzione del buffer, e il tempo
// misurato è quello del riquadro effettivo.
(async () => {
  const N = 60;
  const gl = pingLayer.gl;
  const canvas = pingLayer.canvas;
  const container = canvas.parentElement || canvas;
  const saved = [canvas.width, canvas.height];
  const tap = (x, y, age, id) => [{ x, y, age, strokeId: id }];
  const trail = (n, id) => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: 50 + 25 * Math.cos(a), y: 50 + 25 * Math.sin(a), age: 1.1 * (1 - i / n), strokeId: id };
  });
  const cases = {
    'clear (nessun gruppo)': [],
    '1 tap': [tap(50, 50, 0.5, 'a')],
    '3 tap': [tap(30, 30, 0.2, 'a'), tap(50, 50, 0.5, 'b'), tap(70, 60, 0.9, 'c')],
    '8 tap (max gruppi)': Array.from({ length: 8 }, (_, i) => tap(10 + i * 10, 50, 0.1 * i, `t${i}`)),
    'scia 10 punti': [trail(10, 's')],
    'scia 25 punti': [trail(25, 's')],
    'scia 31 + 1 tap (budget pieno)': [trail(31, 's'), tap(50, 50, 0.5, 'a')]
  };
  const sizes = [[1280, 720], [1920, 1080]];
  const px = new Uint8Array(4);
  // gl.finish() in Chrome non aspetta la GPU (ritorna in ~10 us): la vera
  // sincronizzazione è una readPixels di un pixel, che deve attendere il draw.
  const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const rows = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const [w, h] of sizes) {
    canvas.width = w; canvas.height = h; // syncCanvasSize non lo tocca finché il CSS non cambia
    for (const [name, groups] of Object.entries(cases)) {
      for (let i = 0; i < 5; i++) pingLayer.render(groups, 1.2, 1);
      sync();
      const t0 = performance.now();
      for (let i = 0; i < N; i++) { pingLayer.render(groups, 1.2, 1); sync(); }
      const ms = (performance.now() - t0) / N;
      rows.push({ caso: name, res: `${container.clientWidth}x${container.clientHeight}`, 'ms/render': +ms.toFixed(3) });
      await sleep(100); // pausa: niente GPU al 100% di fila
    }
  }
  canvas.width = saved[0]; canvas.height = saved[1];
  pingLayer.render([], 1.2, 1);
  return rows;
})()
