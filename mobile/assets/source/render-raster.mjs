/**
 * Build every icon from the vector master (mark.svg — the same drawing as
 * `Mark` in src/ui/artwork.tsx: a white card with a marigold corner and a
 * check, on plum). An AI-generated master can replace it (PROMPT.md).
 *
 *   node assets/source/render-raster.mjs
 *
 * icon.png           1024 opaque, full bleed (iOS masks it)
 * adaptive-icon.png  1024 transparent: the master at 78%, edges feathered,
 *                    so Android's 66% safe-zone crop never cuts the check
 * splash-icon.png    1024 transparent: the master as a rounded tile
 * favicon.png        64, rounded · store-icon-512.png  512 (Play listing)
 */
import { spawn } from 'node:child_process';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const OUT = join(HERE, '..');
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9336;
const master = `data:image/svg+xml;base64,${(await readFile(join(HERE, 'mark.svg'))).toString('base64')}`;

const img = (size, style = '') => `<img src="${master}" style="display:block;width:${size}px;height:${size}px;${style}">`;
const JOBS = [
  { out: 'icon.png', size: 1024, alpha: false, body: img(1024) },
  { out: 'store-icon-512.png', size: 512, alpha: false, body: img(512) },
  { out: 'favicon.png', size: 64, alpha: true, body: img(64, 'border-radius:14px') },
  { out: 'splash-icon.png', size: 1024, alpha: true, body: `<div style="padding:112px">${img(800, 'border-radius:176px')}</div>` },
  {
    out: 'adaptive-icon.png',
    size: 1024,
    alpha: true,
    // 72% so the check's far tip stays inside Android's 66% safe circle; the
    // square's edge sits outside the visible mask, feathered for squircle launchers.
    body: `<div style="padding:143px">${img(738, '-webkit-mask-image:radial-gradient(circle at 50% 50%, #000 340px, transparent 372px);mask-image:radial-gradient(circle at 50% 50%, #000 340px, transparent 372px)')}</div>`,
  },
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(HERE, '.chrome')}`, '--disable-gpu'], { stdio: 'ignore' });
try {
  let url;
  for (let i = 0; i < 60 && !url; i++) {
    try { url = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; } catch { await wait(250); }
  }
  const ws = new WebSocket(url);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pend = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); pend.get(m.id)?.(m.result); pend.delete(m.id); });
  const send = (method, params = {}, sessionId) => new Promise((res) => { pend.set(++id, res); ws.send(JSON.stringify({ id, method, params, sessionId })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const page = (m, p) => send(m, p, sessionId);
  await page('Emulation.setDeviceMetricsOverride', { width: 64, height: 64, deviceScaleFactor: 1, mobile: false });
  await page('Page.navigate', { url: 'about:blank' });
  const sample = await page('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `new Promise((ok) => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 1024; const x = c.getContext('2d'); x.drawImage(i, 0, 0, 1024, 1024); let r = 0, g = 0, b = 0, n = 0; for (let a = 0; a < 360; a += 2) { for (const rad of [470, 490, 505]) { const px = x.getImageData(512 + rad * Math.cos(a * Math.PI / 180), 512 + rad * Math.sin(a * Math.PI / 180), 1, 1).data; r += px[0]; g += px[1]; b += px[2]; n++; } } const h = (v) => Math.round(v / n).toString(16).padStart(2, '0'); ok('#' + h(r) + h(g) + h(b)); }; i.src = ${JSON.stringify(master)}; })`,
  });
  console.log(`  edge colour ${sample.result.value} → app.json android.adaptiveIcon.backgroundColor`);
  for (const job of JOBS) {
    const html = `<!doctype html><html style="overflow:hidden"><body style="margin:0;overflow:hidden;background:transparent">${job.body}</body></html>`;
    await page('Emulation.setDeviceMetricsOverride', { width: job.size, height: job.size, deviceScaleFactor: 1, mobile: false });
    await page('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: job.alpha ? 0 : 1 } });
    await page('Page.navigate', { url: `data:text/html;base64,${Buffer.from(html).toString('base64')}` });
    await wait(500);
    const shot = await page('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: job.size, height: job.size, scale: 1 } });
    await writeFile(join(OUT, job.out), Buffer.from(shot.data, 'base64'));
    console.log(`  ✓ ${job.out}`);
  }
  ws.close();
} finally {
  chrome.kill();
  await wait(300);
  await rm(join(HERE, '.chrome'), { recursive: true, force: true }).catch(() => undefined);
}
