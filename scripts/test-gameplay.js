#!/usr/bin/env node
/**
 * Advanced Gameplay Simulation & Responsive Rendering Test Suite
 * Tests all 100 HTML5 canvas games for:
 *   Part 1: Gameplay simulation with pixel-change detection
 *   Part 2: Responsive rendering at 3 viewport sizes
 *
 * Usage: node scripts/test-gameplay.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// ── Configuration ──────────────────────────────────────────────────────────────
const ROOT_DIR = path.resolve(__dirname, '..');
const SCREENSHOTS_GAMEPLAY = path.join(__dirname, 'screenshots-gameplay');
const SCREENSHOTS_RESPONSIVE = path.join(__dirname, 'screenshots-responsive');
const REPORT_PATH = path.join(__dirname, 'test-gameplay-report.html');
const BATCH_SIZE = 5;
const GAMEPLAY_TIMEOUT = 20000;
const GAMEPLAY_DURATION = 10000; // 10 seconds of simulated play

const VIEWPORTS = {
  mobile:  { width: 375,  height: 667,  label: 'Mobile (375x667)' },
  tablet:  { width: 768,  height: 1024, label: 'Tablet (768x1024)' },
  desktop: { width: 1440, height: 900,  label: 'Desktop (1440x900)' },
};

// ── Discover game directories ──────────────────────────────────────────────────
function discoverGames() {
  const entries = fs.readdirSync(ROOT_DIR).filter(d =>
    /^game-\d+-/.test(d) && fs.statSync(path.join(ROOT_DIR, d)).isDirectory()
  );
  entries.sort((a, b) => {
    const numA = parseInt(a.match(/^game-(\d+)/)[1], 10);
    const numB = parseInt(b.match(/^game-(\d+)/)[1], 10);
    return numA - numB;
  });
  return entries;
}

// ── Simple static file server ──────────────────────────────────────────────────
function startServer() {
  return new Promise((resolve) => {
    const MIME = {
      '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
      '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif',
      '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon',
      '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
      '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
      '.webp': 'image/webp',
    };
    const server = http.createServer((req, res) => {
      let filePath = path.join(ROOT_DIR, decodeURIComponent(req.url.split('?')[0]));
      if (filePath.endsWith('/')) filePath += 'index.html';
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

// ── Error filtering ────────────────────────────────────────────────────────────
function isIgnorableError(text) {
  if (text.includes('favicon.ico') && text.includes('404')) return true;
  if (/\[Violation\]/i.test(text)) return true;
  if (text.includes('Failed to load resource') && text.includes('favicon')) return true;
  if (text.includes('net::ERR_')) return true;
  return false;
}

// ── Capture canvas data URL for pixel comparison ───────────────────────────────
async function getCanvasDataURL(page) {
  return page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return null;
    try { return c.toDataURL(); } catch { return null; }
  });
}

// ── Get canvas bounding box ────────────────────────────────────────────────────
async function getCanvasBox(page) {
  return page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, cw: c.width, ch: c.height };
  });
}

// ── Simulate gameplay interactions ─────────────────────────────────────────────
async function simulateGameplay(page, durationMs) {
  const box = await getCanvasBox(page);
  if (!box || box.width <= 0 || box.height <= 0) return;

  const startTime = Date.now();
  const randInBox = () => ({
    x: box.x + Math.random() * box.width,
    y: box.y + Math.random() * box.height,
  });

  // Perform interactions in rapid bursts
  while (Date.now() - startTime < durationMs) {
    const elapsed = Date.now() - startTime;
    const phase = elapsed / durationMs; // 0..1

    try {
      // Random clicks at various positions (2-3 rapid clicks)
      for (let i = 0; i < 3; i++) {
        const p = randInBox();
        await page.mouse.click(p.x, p.y, { delay: 10 });
      }

      // Left side tap (many games use left/right controls)
      await page.mouse.click(box.x + box.width * 0.15, box.y + box.height * 0.5, { delay: 10 });

      // Right side tap
      await page.mouse.click(box.x + box.width * 0.85, box.y + box.height * 0.5, { delay: 10 });

      // Mouse drag gesture across canvas
      const dragStart = randInBox();
      const dragEnd = randInBox();
      await page.mouse.move(dragStart.x, dragStart.y);
      await page.mouse.down();
      // Intermediate points for smooth drag
      const steps = 5;
      for (let s = 1; s <= steps; s++) {
        await page.mouse.move(
          dragStart.x + (dragEnd.x - dragStart.x) * (s / steps),
          dragStart.y + (dragEnd.y - dragStart.y) * (s / steps),
        );
      }
      await page.mouse.up();

      // Keyboard events
      const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '];
      for (const key of keys) {
        await page.keyboard.press(key);
      }

      // Brief pause between interaction bursts
      await page.waitForTimeout(200);
    } catch {
      // If any interaction fails, continue
      await page.waitForTimeout(100);
    }
  }
}

// ── Part 1: Gameplay Simulation Test ───────────────────────────────────────────
async function testGameplay(browser, baseURL, gameDirName) {
  const match = gameDirName.match(/^game-(\d+)-(.+)$/);
  const gameNum = match[1];
  const gameName = match[2];
  const label = `game-${gameNum}-${gameName}`;

  const result = {
    dir: gameDirName, num: gameNum, name: gameName, label,
    status: 'FAIL',
    pixelsChanged: false,
    errors: [],
    screenshotBefore: null,
    screenshotAfter: null,
  };

  const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await context.newPage();
  const errors = [];

  page.on('console', msg => {
    if (msg.type() === 'error' && !isIgnorableError(msg.text())) {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', err => errors.push(`PageError: ${err.message}`));

  try {
    // Load game
    const url = `${baseURL}/${gameDirName}/index.html`;
    const response = await page.goto(url, { timeout: GAMEPLAY_TIMEOUT, waitUntil: 'domcontentloaded' });
    if (!response || response.status() !== 200) {
      result.errors.push(`HTTP ${response ? response.status() : 'no response'}`);
      await context.close();
      return result;
    }

    // Wait for canvas
    try {
      await page.waitForSelector('canvas', { timeout: 5000 });
    } catch {
      result.errors.push('No <canvas> found within 5s');
      await context.close();
      return result;
    }

    await page.waitForTimeout(500);

    // Click center to start
    const box = await getCanvasBox(page);
    if (box && box.width > 0 && box.height > 0) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }

    await page.waitForTimeout(500);

    // "Before gameplay" screenshot
    const beforePath = path.join(SCREENSHOTS_GAMEPLAY, `${label}-before.png`);
    await page.screenshot({ path: beforePath });
    result.screenshotBefore = `screenshots-gameplay/${label}-before.png`;

    // Capture canvas state before gameplay
    const dataURLBefore = await getCanvasDataURL(page);

    // Simulate 10 seconds of gameplay
    await simulateGameplay(page, GAMEPLAY_DURATION);

    // "After gameplay" screenshot
    const afterPath = path.join(SCREENSHOTS_GAMEPLAY, `${label}-after.png`);
    await page.screenshot({ path: afterPath });
    result.screenshotAfter = `screenshots-gameplay/${label}-after.png`;

    // Capture canvas state after gameplay
    const dataURLAfter = await getCanvasDataURL(page);

    // Compare pixels
    if (dataURLBefore && dataURLAfter) {
      result.pixelsChanged = dataURLBefore !== dataURLAfter;
    } else if (!dataURLBefore && !dataURLAfter) {
      // Both null - canvas might be tainted (cross-origin), compare screenshot buffers instead
      const bufBefore = fs.readFileSync(beforePath);
      const bufAfter = fs.readFileSync(afterPath);
      result.pixelsChanged = !bufBefore.equals(bufAfter);
    } else {
      result.pixelsChanged = true; // one null, one not - definitely different
    }

    // Check canvas still exists with non-zero dims
    const dimsAfter = await getCanvasBox(page);
    if (!dimsAfter) {
      result.errors.push('Canvas disappeared after gameplay');
    } else if (dimsAfter.width <= 0 || dimsAfter.height <= 0) {
      result.errors.push(`Canvas has zero dimensions after gameplay`);
    }

    // Record JS errors
    if (errors.length > 0) {
      result.errors.push(...errors);
    }

    // Determine pass/fail
    if (result.errors.length === 0 && dimsAfter && dimsAfter.width > 0 && dimsAfter.height > 0) {
      result.status = 'PASS';
    }
  } catch (err) {
    result.errors.push(`Exception: ${err.message}`);
  } finally {
    await context.close();
  }

  return result;
}

// ── Part 2: Responsive Rendering Test ──────────────────────────────────────────
async function testResponsive(browser, baseURL, gameDirName) {
  const match = gameDirName.match(/^game-(\d+)-(.+)$/);
  const gameNum = match[1];
  const gameName = match[2];
  const label = `game-${gameNum}-${gameName}`;

  const result = {
    dir: gameDirName, num: gameNum, name: gameName, label,
    viewports: {},
  };

  for (const [key, vp] of Object.entries(VIEWPORTS)) {
    const vpResult = {
      status: 'FAIL',
      errors: [],
      screenshot: null,
      canvasDims: null,
    };

    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    const errors = [];

    page.on('console', msg => {
      if (msg.type() === 'error' && !isIgnorableError(msg.text())) {
        errors.push(msg.text());
      }
    });
    page.on('pageerror', err => errors.push(`PageError: ${err.message}`));

    try {
      const url = `${baseURL}/${gameDirName}/index.html`;
      const response = await page.goto(url, { timeout: GAMEPLAY_TIMEOUT, waitUntil: 'domcontentloaded' });
      if (!response || response.status() !== 200) {
        vpResult.errors.push(`HTTP ${response ? response.status() : 'no response'}`);
        await context.close();
        result.viewports[key] = vpResult;
        continue;
      }

      try {
        await page.waitForSelector('canvas', { timeout: 5000 });
      } catch {
        vpResult.errors.push('No <canvas> found within 5s');
        await context.close();
        result.viewports[key] = vpResult;
        continue;
      }

      await page.waitForTimeout(300);

      // Click to start
      const box = await getCanvasBox(page);
      if (box && box.width > 0 && box.height > 0) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      }

      await page.waitForTimeout(1000);

      // Screenshot
      const ssPath = path.join(SCREENSHOTS_RESPONSIVE, `${label}-${key}.png`);
      await page.screenshot({ path: ssPath });
      vpResult.screenshot = `screenshots-responsive/${label}-${key}.png`;

      // Check canvas dimensions
      const dims = await getCanvasBox(page);
      vpResult.canvasDims = dims;

      if (!dims) {
        vpResult.errors.push('Canvas not found');
      } else if (dims.width <= 0 || dims.height <= 0) {
        vpResult.errors.push(`Canvas zero dimensions: ${dims.width}x${dims.height}`);
      }

      if (errors.length > 0) {
        vpResult.errors.push(...errors);
      }

      if (vpResult.errors.length === 0 && dims && dims.width > 0 && dims.height > 0) {
        vpResult.status = 'PASS';
      }
    } catch (err) {
      vpResult.errors.push(`Exception: ${err.message}`);
    } finally {
      await context.close();
    }

    result.viewports[key] = vpResult;
  }

  return result;
}

// ── Run tests in batches ───────────────────────────────────────────────────────
async function runBatches(browser, baseURL, games, testFn, testName) {
  const results = [];
  const totalBatches = Math.ceil(games.length / BATCH_SIZE);

  for (let i = 0; i < games.length; i += BATCH_SIZE) {
    const batch = games.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    process.stdout.write(`\r  [${testName}] Batch ${batchNum}/${totalBatches} — ${batch.map(g => g.replace('game-', '')).join(', ')}...          `);
    const batchResults = await Promise.all(
      batch.map(g => testFn(browser, baseURL, g))
    );
    results.push(...batchResults);
  }
  console.log('');
  return results;
}

// ── Console summary ────────────────────────────────────────────────────────────
function printSummary(gameplayResults, responsiveResults) {
  const gpPass = gameplayResults.filter(r => r.status === 'PASS').length;
  const gpPixels = gameplayResults.filter(r => r.pixelsChanged).length;
  const total = gameplayResults.length;

  let rpMobilePass = 0, rpTabletPass = 0, rpDesktopPass = 0;
  for (const r of responsiveResults) {
    if (r.viewports.mobile && r.viewports.mobile.status === 'PASS') rpMobilePass++;
    if (r.viewports.tablet && r.viewports.tablet.status === 'PASS') rpTabletPass++;
    if (r.viewports.desktop && r.viewports.desktop.status === 'PASS') rpDesktopPass++;
  }

  console.log('\n' + '='.repeat(110));
  console.log(`  GAMEPLAY: ${gpPass}/${total} pass | ${gpPixels}/${total} pixels changed`);
  console.log(`  RESPONSIVE: Mobile ${rpMobilePass}/${total} | Tablet ${rpTabletPass}/${total} | Desktop ${rpDesktopPass}/${total}`);
  console.log('='.repeat(110));

  console.log(
    'Game'.padEnd(28) +
    'Gameplay'.padEnd(10) +
    'Pixels'.padEnd(9) +
    'Mobile'.padEnd(9) +
    'Tablet'.padEnd(9) +
    'Desktop'.padEnd(10) +
    'Errors'
  );
  console.log('-'.repeat(110));

  for (let i = 0; i < total; i++) {
    const gp = gameplayResults[i];
    const rp = responsiveResults[i];
    const allErrors = [
      ...gp.errors,
      ...(rp.viewports.mobile ? rp.viewports.mobile.errors : []),
      ...(rp.viewports.tablet ? rp.viewports.tablet.errors : []),
      ...(rp.viewports.desktop ? rp.viewports.desktop.errors : []),
    ];
    const errStr = allErrors.length > 0
      ? allErrors[0].substring(0, 30) + (allErrors.length > 1 ? ` (+${allErrors.length - 1})` : '')
      : '';

    const mSt = rp.viewports.mobile ? rp.viewports.mobile.status : 'N/A';
    const tSt = rp.viewports.tablet ? rp.viewports.tablet.status : 'N/A';
    const dSt = rp.viewports.desktop ? rp.viewports.desktop.status : 'N/A';

    console.log(
      gp.label.padEnd(28) +
      gp.status.padEnd(10) +
      (gp.pixelsChanged ? 'YES' : 'NO').padEnd(9) +
      mSt.padEnd(9) +
      tSt.padEnd(9) +
      dSt.padEnd(10) +
      errStr
    );
  }
  console.log('='.repeat(110));

  return { gpPass, gpPixels, rpMobilePass, rpTabletPass, rpDesktopPass, total };
}

// ── HTML Report ────────────────────────────────────────────────────────────────
function generateHTMLReport(gameplayResults, responsiveResults, stats) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const cards = gameplayResults.map((gp, i) => {
    const rp = responsiveResults[i];
    const allPass = gp.status === 'PASS'
      && rp.viewports.mobile?.status === 'PASS'
      && rp.viewports.tablet?.status === 'PASS'
      && rp.viewports.desktop?.status === 'PASS';

    const allErrors = [
      ...gp.errors.map(e => `[Gameplay] ${e}`),
      ...(rp.viewports.mobile?.errors || []).map(e => `[Mobile] ${e}`),
      ...(rp.viewports.tablet?.errors || []).map(e => `[Tablet] ${e}`),
      ...(rp.viewports.desktop?.errors || []).map(e => `[Desktop] ${e}`),
    ];

    const badge = allPass
      ? '<span class="badge pass">PASS</span>'
      : '<span class="badge fail">FAIL</span>';

    const pixelBadge = gp.pixelsChanged
      ? '<span class="badge pass">PIXELS CHANGED</span>'
      : '<span class="badge warn">PIXELS SAME</span>';

    const img = (src, alt) => src
      ? `<img src="${src}" alt="${alt}" loading="lazy">`
      : '<div class="no-img">No screenshot</div>';

    const errHtml = allErrors.length > 0
      ? `<div class="errors">${allErrors.map(e => `<div class="error-line">${esc(e)}</div>`).join('')}</div>`
      : '';

    return `
    <div class="card ${allPass ? '' : 'card-fail'}">
      <div class="card-header">
        <span class="game-num">#${gp.num}</span>
        <span class="game-name">${esc(gp.name)}</span>
        ${badge} ${pixelBadge}
      </div>
      <div class="card-status">
        <span>Gameplay: <b>${gp.status}</b></span>
        <span>Mobile: <b>${rp.viewports.mobile?.status || 'N/A'}</b></span>
        <span>Tablet: <b>${rp.viewports.tablet?.status || 'N/A'}</b></span>
        <span>Desktop: <b>${rp.viewports.desktop?.status || 'N/A'}</b></span>
      </div>
      <div class="section-label">Gameplay: Before / After</div>
      <div class="screenshots two">
        <div class="ss"><div class="ss-label">Before</div>${img(gp.screenshotBefore, 'before')}</div>
        <div class="ss"><div class="ss-label">After</div>${img(gp.screenshotAfter, 'after')}</div>
      </div>
      <div class="section-label">Responsive: Mobile | Tablet | Desktop</div>
      <div class="screenshots three">
        <div class="ss"><div class="ss-label">Mobile</div>${img(rp.viewports.mobile?.screenshot, 'mobile')}</div>
        <div class="ss"><div class="ss-label">Tablet</div>${img(rp.viewports.tablet?.screenshot, 'tablet')}</div>
        <div class="ss"><div class="ss-label">Desktop</div>${img(rp.viewports.desktop?.screenshot, 'desktop')}</div>
      </div>
      ${errHtml}
    </div>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>100 Games — Gameplay & Responsive Test Report</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; padding: 20px; }
  h1 { text-align: center; color: #58a6ff; margin-bottom: 6px; font-size: 1.8rem; }
  .subtitle { text-align: center; color: #8b949e; margin-bottom: 20px; font-size: 0.9rem; }
  .summary { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-bottom: 30px; }
  .stat { padding: 10px 18px; border-radius: 8px; background: #161b22; font-size: 0.95rem; }
  .stat.good { border: 1px solid #3fb950; color: #3fb950; }
  .stat.bad { border: 1px solid #f85149; color: #f85149; }
  .stat.warn { border: 1px solid #d29922; color: #d29922; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(520px, 1fr)); gap: 16px; max-width: 1800px; margin: 0 auto; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 10px; padding: 14px; }
  .card-fail { border-color: #f8514966; }
  .card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
  .game-num { color: #8b949e; font-weight: 600; font-size: 0.9rem; }
  .game-name { flex: 1; font-weight: 600; color: #e6edf3; text-transform: capitalize; }
  .badge { padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; white-space: nowrap; }
  .badge.pass { background: #23803015; color: #3fb950; border: 1px solid #23803050; }
  .badge.fail { background: #f8514915; color: #f85149; border: 1px solid #f8514950; }
  .badge.warn { background: #d2992215; color: #d29922; border: 1px solid #d2992250; }
  .card-status { display: flex; gap: 14px; margin-bottom: 10px; font-size: 0.8rem; color: #8b949e; flex-wrap: wrap; }
  .section-label { font-size: 0.7rem; color: #58a6ff; text-transform: uppercase; letter-spacing: 0.08em; margin: 8px 0 4px; font-weight: 600; }
  .screenshots { display: flex; gap: 6px; margin-bottom: 6px; }
  .screenshots.two .ss { flex: 1; }
  .screenshots.three .ss { flex: 1; }
  .ss-label { font-size: 0.65rem; color: #8b949e; text-align: center; margin-bottom: 3px; text-transform: uppercase; letter-spacing: 0.05em; }
  .ss img { width: 100%; border-radius: 6px; border: 1px solid #30363d; }
  .no-img { height: 100px; display: flex; align-items: center; justify-content: center; background: #0d1117; border-radius: 6px; color: #484f58; font-size: 0.75rem; }
  .errors { background: #1c0d0d; border: 1px solid #f8514930; border-radius: 6px; padding: 8px; margin-top: 6px; max-height: 120px; overflow-y: auto; }
  .error-line { font-size: 0.7rem; color: #f85149; margin-bottom: 2px; word-break: break-all; font-family: 'SF Mono', Menlo, monospace; }
</style>
</head>
<body>
<h1>100 Games — Gameplay & Responsive Test Report</h1>
<p class="subtitle">Generated ${new Date().toISOString()}</p>
<div class="summary">
  <div class="stat ${stats.gpPass === stats.total ? 'good' : 'bad'}">Gameplay: ${stats.gpPass}/${stats.total} Pass</div>
  <div class="stat ${stats.gpPixels === stats.total ? 'good' : 'warn'}">Pixels Changed: ${stats.gpPixels}/${stats.total}</div>
  <div class="stat ${stats.rpMobilePass === stats.total ? 'good' : 'bad'}">Mobile: ${stats.rpMobilePass}/${stats.total}</div>
  <div class="stat ${stats.rpTabletPass === stats.total ? 'good' : 'bad'}">Tablet: ${stats.rpTabletPass}/${stats.total}</div>
  <div class="stat ${stats.rpDesktopPass === stats.total ? 'good' : 'bad'}">Desktop: ${stats.rpDesktopPass}/${stats.total}</div>
</div>
<div class="grid">
${cards}
</div>
</body>
</html>`;

  fs.writeFileSync(REPORT_PATH, html);
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(SCREENSHOTS_GAMEPLAY, { recursive: true });
  fs.mkdirSync(SCREENSHOTS_RESPONSIVE, { recursive: true });

  const games = discoverGames();
  console.log(`Found ${games.length} games to test.\n`);

  const { server, port } = await startServer();
  const baseURL = `http://127.0.0.1:${port}`;
  console.log(`Server running on ${baseURL}`);

  const browser = await chromium.launch({ headless: true });
  console.log('Browser launched.\n');

  // Part 1: Gameplay simulation
  console.log('=== Part 1: Gameplay Simulation Tests ===');
  const gameplayResults = await runBatches(browser, baseURL, games, testGameplay, 'Gameplay');

  // Part 2: Responsive rendering
  console.log('\n=== Part 2: Responsive Rendering Tests ===');
  const responsiveResults = await runBatches(browser, baseURL, games, testResponsive, 'Responsive');

  await browser.close();
  server.close();

  const stats = printSummary(gameplayResults, responsiveResults);

  generateHTMLReport(gameplayResults, responsiveResults, stats);
  console.log(`\nHTML report: ${REPORT_PATH}`);

  const allPass = stats.gpPass === stats.total
    && stats.rpMobilePass === stats.total
    && stats.rpTabletPass === stats.total
    && stats.rpDesktopPass === stats.total;

  process.exit(allPass ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
