#!/usr/bin/env node
/**
 * Automated test suite for all 100 HTML5 canvas games.
 * Uses Playwright to load each game, check for errors, take screenshots,
 * and simulate basic interaction.
 *
 * Usage: node scripts/test-all-games.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// ── Configuration ──────────────────────────────────────────────────────────────
const ROOT_DIR = path.resolve(__dirname, '..');
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const REPORT_PATH = path.join(__dirname, 'test-report.html');
const BATCH_SIZE = 5;
const VIEWPORT = { width: 375, height: 667 };
const GAME_TIMEOUT = 10000; // 10 seconds per game max

// ── Discover game directories ──────────────────────────────────────────────────
function discoverGames() {
  const entries = fs.readdirSync(ROOT_DIR).filter(d =>
    /^game-\d+-/.test(d) && fs.statSync(path.join(ROOT_DIR, d)).isDirectory()
  );
  // Sort numerically by game number
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
      const port = server.address().port;
      resolve({ server, port });
    });
  });
}

// ── Test a single game ─────────────────────────────────────────────────────────
async function testGame(browser, baseURL, gameDirName) {
  const match = gameDirName.match(/^game-(\d+)-(.+)$/);
  const gameNum = match[1];
  const gameName = match[2];
  const label = `game-${gameNum}-${gameName}`;

  const result = {
    dir: gameDirName,
    num: gameNum,
    name: gameName,
    label,
    loadStatus: 'FAIL',
    loadErrors: [],
    interactionStatus: 'FAIL',
    interactionErrors: [],
    screenshotBefore: null,
    screenshotAfter: null,
  };

  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  // Collect console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore common non-errors
      if (text.includes('favicon.ico') && text.includes('404')) return;
      if (/\[Violation\]/i.test(text)) return;
      consoleErrors.push(text);
    }
  });

  // Also catch page errors (uncaught exceptions)
  page.on('pageerror', err => {
    consoleErrors.push(`PageError: ${err.message}`);
  });

  try {
    // ── Test 1: Load test ──────────────────────────────────────────────────
    const url = `${baseURL}/${gameDirName}/index.html`;
    const response = await page.goto(url, { timeout: GAME_TIMEOUT, waitUntil: 'domcontentloaded' });

    if (!response || response.status() !== 200) {
      result.loadErrors.push(`HTTP ${response ? response.status() : 'no response'}`);
      await context.close();
      return result;
    }

    // Wait for canvas
    try {
      await page.waitForSelector('canvas', { timeout: 5000 });
    } catch {
      result.loadErrors.push('No <canvas> element found within 5s');
      await context.close();
      return result;
    }

    // Check canvas dimensions
    const dims = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      if (!c) return null;
      return { width: c.width, height: c.height, clientWidth: c.clientWidth, clientHeight: c.clientHeight };
    });

    if (!dims) {
      result.loadErrors.push('Canvas element not found in DOM');
    } else if ((dims.width <= 0 && dims.clientWidth <= 0) || (dims.height <= 0 && dims.clientHeight <= 0)) {
      result.loadErrors.push(`Canvas has zero dimensions: ${JSON.stringify(dims)}`);
    }

    // Wait 1 second for initial render
    await page.waitForTimeout(1000);

    // Check console errors from load
    if (consoleErrors.length > 0) {
      result.loadErrors.push(...consoleErrors.slice());
    }

    if (result.loadErrors.length === 0) {
      result.loadStatus = 'PASS';
    }

    // ── Screenshot before click ────────────────────────────────────────────
    const ssBeforePath = path.join(SCREENSHOTS_DIR, `${label}.png`);
    await page.screenshot({ path: ssBeforePath });
    result.screenshotBefore = `screenshots/${label}.png`;

    // ── Test 2: Interaction test ───────────────────────────────────────────
    const errCountBefore = consoleErrors.length;

    // Click center of canvas
    const box = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });

    if (box) {
      await page.mouse.click(box.x, box.y);
      await page.waitForTimeout(500);
    }

    // Check for new errors after click
    const newErrors = consoleErrors.slice(errCountBefore);
    if (newErrors.length > 0) {
      result.interactionErrors.push(...newErrors);
    }

    // Verify canvas still present with non-zero dimensions
    const dimsAfter = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      if (!c) return null;
      return { width: c.width, height: c.height, clientWidth: c.clientWidth, clientHeight: c.clientHeight };
    });

    if (!dimsAfter) {
      result.interactionErrors.push('Canvas disappeared after click');
    } else if ((dimsAfter.width <= 0 && dimsAfter.clientWidth <= 0) || (dimsAfter.height <= 0 && dimsAfter.clientHeight <= 0)) {
      result.interactionErrors.push(`Canvas has zero dimensions after click: ${JSON.stringify(dimsAfter)}`);
    }

    // Screenshot after click
    const ssAfterPath = path.join(SCREENSHOTS_DIR, `${label}-after-click.png`);
    await page.screenshot({ path: ssAfterPath });
    result.screenshotAfter = `screenshots/${label}-after-click.png`;

    if (result.interactionErrors.length === 0) {
      result.interactionStatus = 'PASS';
    }
  } catch (err) {
    result.loadErrors.push(`Exception: ${err.message}`);
  } finally {
    await context.close();
  }

  return result;
}

// ── Run batches ────────────────────────────────────────────────────────────────
async function runBatches(browser, baseURL, games) {
  const results = [];
  for (let i = 0; i < games.length; i += BATCH_SIZE) {
    const batch = games.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(games.length / BATCH_SIZE);
    process.stdout.write(`\r  Batch ${batchNum}/${totalBatches} — testing ${batch.join(', ')}...`);
    const batchResults = await Promise.all(
      batch.map(g => testGame(browser, baseURL, g))
    );
    results.push(...batchResults);
  }
  console.log('');
  return results;
}

// ── Console summary ────────────────────────────────────────────────────────────
function printSummary(results) {
  const loadPass = results.filter(r => r.loadStatus === 'PASS').length;
  const intPass = results.filter(r => r.interactionStatus === 'PASS').length;
  const total = results.length;

  console.log('\n' + '='.repeat(90));
  console.log(`  TEST RESULTS: ${loadPass}/${total} load passed | ${intPass}/${total} interaction passed`);
  console.log('='.repeat(90));
  console.log(
    'Game'.padEnd(30) +
    'Load'.padEnd(8) +
    'Interact'.padEnd(10) +
    'Errors'
  );
  console.log('-'.repeat(90));

  for (const r of results) {
    const allErrors = [...r.loadErrors, ...r.interactionErrors];
    const errStr = allErrors.length > 0 ? allErrors[0].substring(0, 40) + (allErrors.length > 1 ? ` (+${allErrors.length - 1})` : '') : '';
    console.log(
      r.label.padEnd(30) +
      r.loadStatus.padEnd(8) +
      r.interactionStatus.padEnd(10) +
      errStr
    );
  }
  console.log('='.repeat(90));
  return { loadPass, intPass, total };
}

// ── HTML Report ────────────────────────────────────────────────────────────────
function generateHTMLReport(results, stats) {
  const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const gameCards = results.map(r => {
    const allErrors = [...r.loadErrors, ...r.interactionErrors];
    const badge = (r.loadStatus === 'PASS' && r.interactionStatus === 'PASS')
      ? '<span class="badge pass">PASS</span>'
      : '<span class="badge fail">FAIL</span>';
    const errHtml = allErrors.length > 0
      ? `<div class="errors">${allErrors.map(e => `<div class="error-line">${escapeHtml(e)}</div>`).join('')}</div>`
      : '';
    const imgBefore = r.screenshotBefore
      ? `<img src="${r.screenshotBefore}" alt="before" loading="lazy">`
      : '<div class="no-img">No screenshot</div>';
    const imgAfter = r.screenshotAfter
      ? `<img src="${r.screenshotAfter}" alt="after" loading="lazy">`
      : '<div class="no-img">No screenshot</div>';

    return `
    <div class="card ${r.loadStatus === 'PASS' && r.interactionStatus === 'PASS' ? '' : 'card-fail'}">
      <div class="card-header">
        <span class="game-num">#${r.num}</span>
        <span class="game-name">${escapeHtml(r.name)}</span>
        ${badge}
      </div>
      <div class="card-status">
        <span>Load: <b>${r.loadStatus}</b></span>
        <span>Interact: <b>${r.interactionStatus}</b></span>
      </div>
      <div class="screenshots">
        <div class="ss"><div class="ss-label">Initial</div>${imgBefore}</div>
        <div class="ss"><div class="ss-label">After Click</div>${imgAfter}</div>
      </div>
      ${errHtml}
    </div>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>100 Games — Test Report</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; padding: 20px; }
  h1 { text-align: center; color: #58a6ff; margin-bottom: 10px; font-size: 1.8rem; }
  .summary { text-align: center; margin-bottom: 30px; font-size: 1.1rem; }
  .summary .stat { display: inline-block; margin: 0 20px; padding: 10px 20px; border-radius: 8px; background: #161b22; }
  .summary .stat.all-pass { border: 1px solid #3fb950; }
  .summary .stat.has-fail { border: 1px solid #f85149; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; max-width: 1600px; margin: 0 auto; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 10px; padding: 14px; }
  .card-fail { border-color: #f8514966; }
  .card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .game-num { color: #8b949e; font-weight: 600; font-size: 0.9rem; }
  .game-name { flex: 1; font-weight: 600; color: #e6edf3; text-transform: capitalize; }
  .badge { padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
  .badge.pass { background: #23803015; color: #3fb950; border: 1px solid #23803050; }
  .badge.fail { background: #f8514915; color: #f85149; border: 1px solid #f8514950; }
  .card-status { display: flex; gap: 16px; margin-bottom: 10px; font-size: 0.85rem; color: #8b949e; }
  .screenshots { display: flex; gap: 8px; margin-bottom: 8px; }
  .ss { flex: 1; }
  .ss-label { font-size: 0.7rem; color: #8b949e; text-align: center; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
  .ss img { width: 100%; border-radius: 6px; border: 1px solid #30363d; }
  .no-img { height: 120px; display: flex; align-items: center; justify-content: center; background: #0d1117; border-radius: 6px; color: #484f58; font-size: 0.8rem; }
  .errors { background: #1c0d0d; border: 1px solid #f8514930; border-radius: 6px; padding: 8px; margin-top: 6px; }
  .error-line { font-size: 0.75rem; color: #f85149; margin-bottom: 2px; word-break: break-all; font-family: 'SF Mono', Menlo, monospace; }
</style>
</head>
<body>
<h1>100 Games — Test Report</h1>
<div class="summary">
  <div class="stat ${stats.loadPass === stats.total ? 'all-pass' : 'has-fail'}">${stats.loadPass}/${stats.total} Load Passed</div>
  <div class="stat ${stats.intPass === stats.total ? 'all-pass' : 'has-fail'}">${stats.intPass}/${stats.total} Interaction Passed</div>
</div>
<div class="grid">
${gameCards}
</div>
</body>
</html>`;

  fs.writeFileSync(REPORT_PATH, html);
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  // Ensure screenshots dir exists
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const games = discoverGames();
  console.log(`Found ${games.length} games to test.\n`);

  // Start server
  const { server, port } = await startServer();
  const baseURL = `http://127.0.0.1:${port}`;
  console.log(`Server running on ${baseURL}`);

  // Launch browser
  const browser = await chromium.launch({ headless: true });
  console.log('Browser launched.\n');

  // Run tests
  const results = await runBatches(browser, baseURL, games);

  // Cleanup
  await browser.close();
  server.close();

  // Summary
  const stats = printSummary(results);

  // HTML report
  generateHTMLReport(results, stats);
  console.log(`\nHTML report written to: ${REPORT_PATH}`);

  // Exit code
  const allPass = stats.loadPass === stats.total && stats.intPass === stats.total;
  process.exit(allPass ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
