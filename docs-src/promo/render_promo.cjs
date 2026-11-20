// Renders promo.html frame by frame (deterministic timeline) into PNG frames for ffmpeg.
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
(async () => {
  const out = process.argv[2], fps = 30, seconds = Number(process.argv[3] || 25);
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto('file://' + path.resolve(__dirname, 'promo.html')); await p.waitForTimeout(600);
  for (let f = 0; f < fps * seconds; f++) {
    await p.evaluate(t => window.render(t), f / fps);
    await p.screenshot({ path: path.join(out, String(f).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 });
  }
  await b.close(); console.log('frames', fps * seconds);
})();
