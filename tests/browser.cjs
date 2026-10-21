/* External test dependency only; the website itself needs no packages.
 * npm install --no-save --package-lock=false playwright
 * npx playwright install chromium
 * node tests/browser.cjs
 * Or set NODE_PATH to an existing Playwright installation and
 * BROWSER_EXECUTABLE to an installed Chromium / Edge executable.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { createServer } = require('../scripts/serve.cjs');
const prefix = 'lucky-everyday:xinxin:v1:';
let browser, origin, passed = 0;
const server = createServer();
const results = path.resolve(__dirname, '../test-results');

async function check(name, run) {
  if (process.env.TEST_FILTER && !name.includes(process.env.TEST_FILTER)) return;
  await run(); passed++; console.log(`PASS ${name}`);
}
async function fresh(options = {}) {
  const context = await (options.browser || browser).newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', timezoneId: 'Asia/Tokyo', ...options.context });
  const issues = [];
  context.on('request', request => {
    if (!request.url().startsWith(origin + '/') || request.method() !== 'GET') issues.push(request.url());
  });
  const page = await context.newPage();
  page.on('pageerror', error => issues.push(error.message));
  await page.addInitScript(({ seed, blocked, quota, pool, random, letters, lucky }) => {
    if (!sessionStorage.getItem('test-seeded')) {
      for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      sessionStorage.setItem('test-seeded', 'yes');
    }
    if (blocked) Storage.prototype.getItem = function () { throw new DOMException('Blocked', 'SecurityError'); };
    if (quota || blocked) {
      const set = Storage.prototype.setItem;
      window.__testOriginalSet = set;
      Storage.prototype.setItem = function (key, value) {
        if (blocked || key.endsWith(quota)) throw new DOMException('Full', 'QuotaExceededError');
        return set.call(this, key, value);
      };
    }
    if (random) {
      let state = 123456;
      Math.random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
    }
    // Legacy scenarios isolate ordinary content; lucky scenarios opt in explicitly.
    if (pool || letters || !lucky) {
      let content;
      Object.defineProperty(window, 'EMOTION_BOX_CONTENT', {
        configurable: true, get: () => content,
        set: value => { if (pool) value.messages = pool; if (letters) value.letters = letters; if (!lucky) value.superLucky = null; content = value; }
      });
    }
  }, { seed: options.seed || {}, blocked: !!options.blocked, quota: options.quota || '', pool: options.pool, random: !!options.random, letters: options.letters, lucky: !!options.lucky });
  if (!options.realTime) await page.clock.install({ time: new Date('2026-10-19T14:00:00+09:00') });
  if (options.beforeGoto) await options.beforeGoto(page);
  await page.goto(origin + (options.subdir ? '/LuckyXinxin/' : '/'), { waitUntil: options.waitUntil || 'load' });
  await page.locator('#open-daily').waitFor();
  return { page, context, issues, close: async () => { assert.deepEqual(issues, [], 'Runtime errors, external requests, or upload'); await context.close(); } };
}
const text = (page, selector = '#note-text') => page.locator(selector).innerText();
async function closeNote(page) { await page.locator('#note-dialog .dialog-header [data-close]').click(); }
// Wait for CSS animations to start before seeking; otherwise a pending start
// can reset currentTime and produce a screenshot of the wrong frame.
async function animationFrame(page, selector, time) {
  await page.locator(selector).evaluate(async (node, at) => {
    const animations = node.getAnimations({ subtree: true });
    await Promise.all(animations.map(animation => animation.ready));
    animations.forEach(animation => { animation.pause(); animation.currentTime = at; });
  }, time);
}
async function openRandom(page) {
  await page.locator('.choice-note').click();
  await page.locator('.pick-drop').first().click();
  return text(page);
}
async function next(page) { await page.locator('#next-note').click(); await page.locator('.pick-drop').first().click(); return text(page); }

(async () => {
  await fs.mkdir(results, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });

  const giftKey = 'lucky-everyday:xinxin:v2:gift-drops';
  const faces = ['smile', 'laugh', 'sleepy', 'blank', 'pout', 'wistful'];
  const fixturePool = Array.from({ length: 240 }, (_, i) => ({ id: `gift-${String(i).padStart(3, '0')}`, text: `小幸运 ${i + 1}：今天可以慢慢来。` }));
  const records = n => fixturePool.slice(0, n).map((m, i) => ({ id: `message:${m.id}`, source: 'message', messageId: m.id, text: m.text, expression: faces[i % faces.length] }));
  const store = n => ({ version: 2, items: records(n) });
  const privateRecords = n => Array.from({ length: n }, (_, i) => ({ id: `self-${i}`, text: `只有点开才能看到的心事 ${i}`, at: new Date(Date.UTC(2026, 9, 18, 0, i)).toISOString() }));
  const cards = (page, group) => page.locator(`#home-shelves .bottle-card${group ? `[data-group="${group}"]` : ''}`);
  const closeDialog = async (page, id) => {
    // Native dialog.open changes before the asynchronous close event runs cleanup.
    await page.locator(`#${id}`).evaluate(node => {
      delete node.dataset.testClosed;
      node.addEventListener('close', () => { node.dataset.testClosed = 'true'; }, { once: true });
    });
    await page.locator(`#${id} .dialog-header [data-close]`).click();
    await page.waitForFunction(id => document.getElementById(id).dataset.testClosed === 'true', id);
  };
  const countIs = async (page, n) => assert.equal(await text(page, '#drop-count'), `已经留下${n}滴小雨滴`);
  const gifts = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), giftKey);

  const backupOf = (overrides = {}) => ({ format: 'lucky-xinxin-backup', version: 1, exportedAt: '2026-10-20T03:00:00.000Z', gifts: records(2), vents: privateRecords(1), legacyDays: ['2026-10-18'], ...overrides });
  const openRestore = async page => { await page.locator('[data-open="privacy-dialog"]').click(); await page.locator('#backup-restore').click(); };
  const inspectBackup = async (page, data) => { await page.locator('#backup-input').fill(typeof data === 'string' ? data : JSON.stringify(data, null, 2)); await page.locator('#backup-check').click(); };
  const savedCollections = page => page.evaluate(({ giftKey, prefix }) => Object.fromEntries([giftKey, prefix + 'vents', prefix + 'drops'].map(key => [key, localStorage.getItem(key)])), { giftKey, prefix });
  let copiedBackup;

  const luckyRecord = (id = 'fixture', overrides = {}) => ({ id: `lucky:${id}`, source: 'lucky', messageId: 'super-lucky-01', text: '保存时的超级幸运原话 ✨', expression: 'laugh', at: '2026-11-04T03:12:00.000Z', special: 'super-lucky', ...overrides });
  const luckyDaily = { id: 'daily:2026-11-04', source: 'daily', day: '2026-11-04', messageId: 'super-lucky-01', text: '当天的超级幸运快照', expression: 'pout', special: 'super-lucky' };
  async function drawWithRoll(page, roll) {
    if (!await page.locator('#note-dialog').evaluate(node => node.open)) await page.locator('.choice-note').click();
    else if (await page.locator('#note-reader').isVisible()) await page.locator('#next-note').click();
    await page.evaluate(value => { Math.random = () => value; }, roll);
    await page.locator('.pick-drop').first().click();
    return text(page);
  }
  const hasCelebration = page => page.locator('#lucky-celebration').evaluate(node => node.matches(':popover-open'));

  await check('lucky: messages retain their words with small emoji suffix changes and lucky content stays outside the ordinary pool', async () => {
    const baseline = { window: {} };
    require('node:vm').runInNewContext(require('node:child_process').execFileSync('git', ['show', '0d25fde:content.js'], { encoding: 'utf8' }), baseline);
    const t = await fresh({ lucky: true });
    const data = await t.page.evaluate(() => window.EMOTION_BOX_CONTENT);
    assert.equal(data.messages.length, 64); assert.equal(data.superLucky.id, 'super-lucky-01');
    assert.equal(data.messages.some(item => item.id === data.superLucky.id), false);
    let changed = 0;
    for (const message of data.messages) {
      let old = baseline.window.EMOTION_BOX_CONTENT.messages.find(item => item.id === message.id).text;
      // The available pre-lucky commit includes a hug later replaced by a bed.
      if (message.id === 'rest-11') { assert.ok(old.endsWith('🫂')); old = old.slice(0, -'🫂'.length); }
      assert.ok(message.text.startsWith(old));
      if (message.text !== old) { changed++; assert.equal([...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(message.text.slice(old.length))].length, 1); }
    }
    assert.ok(changed >= 12 && changed <= 24); await t.close();
  });

  await check('lucky: the base boundary supports repeat encounters and stable retry identities', async () => {
    const t = await fresh({ lucky: true }); const { page } = t;
    await drawWithRoll(page, .05); assert.equal(await page.locator('#note-reader').evaluate(node => node.classList.contains('is-super-lucky')), false);
    await drawWithRoll(page, .049999); assert.match(await text(page), /好运爆棚/); await countIs(page, 0);
    assert.equal(await page.locator('#reader-mascot .lucky-mascot').count(), 1); assert.equal(await page.locator('#lucky-date').isVisible(), true);
    await page.locator('#save-note').click(); const first = (await gifts(page)).items[0];
    assert.equal(first.source, 'lucky'); assert.equal(first.special, 'super-lucky'); assert.ok(Number.isFinite(Date.parse(first.at)));
    assert.equal(await text(page, '#note-status'), '超级幸运已放进瓶子里。✨');
    await page.locator('#save-note').evaluate(node => node.click()); await countIs(page, 1);
    await drawWithRoll(page, 0); await page.locator('#save-note').click();
    const second = (await gifts(page)).items[1]; assert.notEqual(second.id, first.id); assert.equal(second.messageId, first.messageId); await countIs(page, 2);
    await closeDialog(page, 'note-dialog'); await page.reload(); await drawWithRoll(page, 0); await page.locator('#save-note').click(); await countIs(page, 3); await t.close();
    const failed = await fresh({ lucky: true, quota: 'gift-drops' });
    await drawWithRoll(failed.page, 0); await failed.page.locator('#save-note').click(); assert.match(await text(failed.page, '#note-status'), /没能保存/);
    await failed.page.evaluate(() => { Storage.prototype.setItem = window.__testOriginalSet; });
    await failed.page.locator('#save-note').click(); const retried = (await gifts(failed.page)).items[0];
    await failed.page.locator('#save-note').evaluate(node => node.click()); assert.deepEqual((await gifts(failed.page)).items, [retried]); await failed.close();
  });

  const progressKey = prefix + 'lucky-progress';
  const progress = (misses = 0, daily = null) => ({ version: 2, misses, daily });
  const readProgress = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), progressKey);
  const setProgress = (page, value) => page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: progressKey, value });
  const specialShown = page => page.locator('#note-reader').evaluate(node => node.classList.contains('is-super-lucky'));

  await check('lucky: five percent base and every pity threshold include the lower value and exclude the exact probability', async () => {
    const t = await fresh({ lucky: true }); const { page } = t;
    const probabilities = [...Array(15).fill(.05), .10, .15, .20, .25, .30, 1];
    for (let misses = 0; misses <= 20; misses++) {
      const probability = probabilities[misses];
      await setProgress(page, progress(misses)); await drawWithRoll(page, probability - .000001);
      assert.equal(await specialShown(page), true, 'misses=' + misses);
      assert.deepEqual(await readProgress(page), progress());
      if (probability < 1) {
        await setProgress(page, progress(misses)); await drawWithRoll(page, probability);
        assert.equal(await specialShown(page), false, 'misses=' + misses);
        assert.deepEqual(await readProgress(page), progress(misses + 1));
      }
    }
    await countIs(page, 0); await t.close();
  });

  await check('lucky: the twenty-first draw is guaranteed and consecutive hits always return to five percent', async () => {
    const t = await fresh({ lucky: true }); const { page } = t;
    for (let attempt = 1; attempt <= 20; attempt++) {
      await drawWithRoll(page, .999999); assert.equal(await specialShown(page), false);
      assert.deepEqual(await readProgress(page), progress(attempt));
      if (attempt === 15) { await closeNote(page); await page.reload(); }
    }
    await drawWithRoll(page, .999999); assert.equal(await specialShown(page), true);
    assert.deepEqual(await readProgress(page), progress());
    for (let hit = 0; hit < 7; hit++) {
      await drawWithRoll(page, .049999); assert.equal(await specialShown(page), true);
      assert.deepEqual(await readProgress(page), progress());
    }
    await drawWithRoll(page, .05); assert.equal(await specialShown(page), false);
    assert.deepEqual(await readProgress(page), progress(1)); await t.close();
  });

  await check('lucky: daily and random share progress while rereading, saving, reloads and sequential tabs do not add draws', async () => {
    const t = await fresh({ lucky: true, seed: { [giftKey]: { version: 2, items: [luckyRecord()] }, [progressKey]: progress(14) } });
    const { page, context } = t;
    await page.evaluate(() => { Math.random = () => .99; });
    await page.locator('#open-daily').click(); const daily = (await gifts(page)).items[1];
    assert.equal(daily.special, undefined); assert.deepEqual(await readProgress(page), progress(15, daily));
    await closeNote(page); await page.evaluate(() => { Math.random = () => 0; });
    await page.locator('#open-daily').click(); assert.equal(await text(page), daily.text);
    assert.deepEqual(await readProgress(page), progress(15, daily)); await closeNote(page);
    await cards(page).first().click(); await page.locator('.bottled-drop.is-super-lucky').click();
    assert.deepEqual(await readProgress(page), progress(15, daily));
    await closeNote(page); await closeDialog(page, 'bottle-dialog');
    await drawWithRoll(page, .099999); assert.equal(await specialShown(page), true);
    await page.locator('#save-note').click(); await page.locator('#save-note').evaluate(node => node.click());
    assert.deepEqual(await readProgress(page), progress(0, daily));
    await closeNote(page); await page.reload();
    await drawWithRoll(page, .05); assert.equal(await specialShown(page), false);
    const other = await context.newPage(); await other.goto(origin + '/');
    await drawWithRoll(other, .049999); assert.equal(await specialShown(other), true);
    assert.deepEqual(await readProgress(page), progress(0, daily));
    await drawWithRoll(page, .05); assert.equal(await specialShown(page), false);
    assert.deepEqual(await readProgress(other), progress(1, daily)); await t.close();
  });

  await check('lucky: alternating daily and random encounters reach one shared twenty-first guarantee', async () => {
    const t = await fresh({ lucky: true }); const { page } = t;
    for (let attempt = 1; attempt <= 21; attempt++) {
      if (attempt % 2) {
        await page.clock.setFixedTime(new Date(Date.UTC(2026, 10, 1 + Math.floor(attempt / 2), 3)));
        await page.evaluate(() => { Math.random = () => .999999; }); await page.locator('#open-daily').click();
      } else await drawWithRoll(page, .999999);
      assert.equal(await specialShown(page), attempt === 21);
      assert.equal((await readProgress(page)).misses, attempt === 21 ? 0 : attempt);
      await closeNote(page);
    }
    await countIs(page, 11); await t.close();
  });

  await check('lucky: cancelled and background catches in either entry never advance probability progress', async () => {
    const t = await fresh({ lucky: true, context: { reducedMotion: 'no-preference' }, seed: { [progressKey]: progress(15) } }); const { page } = t;
    await page.clock.pauseAt(new Date('2026-10-20T12:00:00+09:00'));
    for (const daily of [false, true]) {
      const start = async () => { if (daily) await page.locator('#open-daily').click(); else { await page.locator('.choice-note').click(); await page.locator('.pick-drop').first().click(); } };
      await start(); await page.clock.runFor(500); await closeNote(page); await page.clock.runFor(1500);
      assert.deepEqual(await readProgress(page), progress(15));
      await start();
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
      await page.clock.runFor(1500); assert.deepEqual(await readProgress(page), progress(15));
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
      if (!daily) await closeNote(page); else assert.equal(await page.locator('#note-dialog').evaluate(node => node.open), false);
    }
    await countIs(page, 0); await t.close();
  });

  await check('lucky: failed progress writes keep advancing in memory and persist after storage recovers', async () => {
    const t = await fresh({ lucky: true, quota: 'lucky-progress', seed: { [progressKey]: progress(14) } }); const { page } = t;
    await drawWithRoll(page, .05); assert.equal(await specialShown(page), false);
    assert.deepEqual(await readProgress(page), progress(14));
    await drawWithRoll(page, .09); assert.equal(await specialShown(page), true);
    await page.evaluate(() => { Storage.prototype.setItem = window.__testOriginalSet; });
    await drawWithRoll(page, .05); assert.equal(await specialShown(page), false);
    assert.deepEqual(await readProgress(page), progress(1));
    await closeNote(page); await page.reload(); await drawWithRoll(page, .049999);
    assert.equal(await specialShown(page), true); await t.close();
  });

  await check('lucky: legacy progress preserves misses, removes hit penalties and leaves saved snapshots unchanged', async () => {
    for (const legacy of [{ version: 1, hits: 0, misses: 15 }, { version: 1, hits: 0, misses: 18 }, { version: 1, hits: 5, misses: 0 }]) {
      const item = luckyRecord();
      const t = await fresh({ lucky: true, seed: { [giftKey]: { version: 2, items: [item] }, [progressKey]: legacy } });
      await drawWithRoll(t.page, legacy.misses === 18 ? .249999 : legacy.misses ? .099999 : .049999);
      assert.equal(await specialShown(t.page), true); assert.deepEqual(await readProgress(t.page), progress());
      assert.deepEqual((await gifts(t.page)).items, [item]); await t.close();
    }
  });

  await check('lucky: unreadable progress is preserved and blocked storage still allows draws in this page', async () => {
    for (const value of ['{broken', { version: 99, misses: 0 }, { version: 1, hits: 1, misses: 1 }, progress(-1), progress(21), progress(.5), progress(0, { source: 'daily' })]) {
      const t = await fresh({ lucky: true, seed: { [progressKey]: value } }); const { page } = t;
      const before = await page.evaluate(key => localStorage.getItem(key), progressKey);
      await drawWithRoll(page, .049999); assert.equal(await specialShown(page), true);
      await drawWithRoll(page, .05); assert.equal(await specialShown(page), false);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), progressKey), before);
      await page.locator('#save-note').click(); await countIs(page, 1); await t.close();
    }
    const blocked = await fresh({ lucky: true, blocked: true });
    await drawWithRoll(blocked.page, .049999); assert.equal(await specialShown(blocked.page), true);
    await drawWithRoll(blocked.page, .049999); assert.equal(await specialShown(blocked.page), true);
    await drawWithRoll(blocked.page, .05); assert.equal(await specialShown(blocked.page), false);
    await closeNote(blocked.page); await blocked.page.evaluate(() => { Math.random = () => .049999; });
    await blocked.page.locator('#open-daily').click(); const dailyText = await text(blocked.page);
    assert.equal(await specialShown(blocked.page), true); await closeNote(blocked.page);
    await blocked.page.evaluate(() => { Math.random = () => .99; }); await blocked.page.locator('#open-daily').click();
    assert.equal(await text(blocked.page), dailyText); assert.equal(await specialShown(blocked.page), true);
    await blocked.close();
  });

  await check('lucky: a special encounter leaves the ordinary shuffle queue and expressions intact', async () => {
    const a = await fresh({ lucky: true, pool: fixturePool.slice(0, 6) }), b = await fresh({ lucky: true, pool: fixturePool.slice(0, 6) });
    assert.equal(await drawWithRoll(a.page, .5), await drawWithRoll(b.page, .5));
    await a.page.locator('#next-note').click(); const selected = await a.page.locator('.pick-drop').first().getAttribute('data-expression');
    await a.page.evaluate(() => { Math.random = () => 0; }); await a.page.locator('.pick-drop').first().click();
    assert.equal(await a.page.locator('#reader-mascot svg').getAttribute('data-expression'), selected);
    await a.page.locator('#save-note').click(); assert.equal((await gifts(a.page)).items[0].expression, selected);
    assert.equal(await drawWithRoll(a.page, .5), await drawWithRoll(b.page, .5)); await a.close(); await b.close();
  });

  await check('lucky: daily outcomes remain fixed, auto-save once and respect old snapshots', async () => {
    const t = await fresh({ lucky: true }); const { page } = t;
    await page.clock.setFixedTime(new Date('2026-11-04T12:00:00+09:00'));
    await page.evaluate(() => { Math.random = () => 0; });
    await page.locator('#open-daily').click(); await countIs(page, 1);
    const daily = (await gifts(page)).items[0]; assert.equal(daily.special, 'super-lucky'); assert.equal(daily.source, 'daily'); assert.equal(daily.day, '2026-11-04');
    assert.deepEqual(await readProgress(page), progress(0, daily));
    assert.equal(await hasCelebration(page), true); await closeDialog(page, 'note-dialog');
    await page.locator('#open-daily').click(); assert.deepEqual((await gifts(page)).items, [daily]); assert.equal(await hasCelebration(page), false);
    await closeDialog(page, 'note-dialog'); await page.reload(); await page.locator('#open-daily').click(); assert.equal(await hasCelebration(page), false);
    await closeDialog(page, 'note-dialog'); await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+09:00'));
    await page.evaluate(() => { Math.random = () => .05; }); await page.locator('#open-daily').click();
    assert.equal((await gifts(page)).items[1].special, undefined); await t.close();
    const old = { ...luckyDaily, text: '以前存好的普通赠言' }; delete old.special;
    const snapshot = await fresh({ lucky: true, seed: { [giftKey]: { version: 2, items: [old] } } });
    await snapshot.page.clock.setFixedTime(new Date('2026-11-04T12:00:00+09:00')); await snapshot.page.locator('#open-daily').click();
    assert.equal(await text(snapshot.page), old.text); assert.equal(await hasCelebration(snapshot.page), false); await snapshot.close();
  });

  await check('lucky: daily interruption and failed writes preserve the same surprise and never report a false collection', async () => {
    const t = await fresh({ lucky: true, context: { reducedMotion: 'no-preference' } }); const { page } = t;
    await page.clock.pauseAt(new Date('2026-11-04T12:00:00+09:00'));
    await page.evaluate(() => { Math.random = () => 0; }); await page.locator('#open-daily').click(); await page.clock.runFor(500);
    await closeDialog(page, 'note-dialog'); await page.clock.runFor(1500); await countIs(page, 0); assert.equal(await hasCelebration(page), false);
    await page.locator('#open-daily').click(); await page.clock.runFor(1300); assert.equal((await gifts(page)).items[0].special, 'super-lucky'); await t.close();
    const failed = await fresh({ lucky: true, quota: 'gift-drops' }); await failed.page.clock.setFixedTime(new Date('2026-11-04T12:00:00+09:00'));
    await failed.page.evaluate(() => { Math.random = () => 0; });
    await failed.page.locator('#open-daily').click(); const wording = await text(failed.page); assert.match(wording, /超级幸运/);
    await countIs(failed.page, 0); assert.match(await text(failed.page, '#note-status'), /没能保存/);
    const daily = (await readProgress(failed.page)).daily;
    await closeNote(failed.page); await drawWithRoll(failed.page, .05);
    assert.deepEqual(await readProgress(failed.page), progress(1, daily));
    await closeNote(failed.page); await failed.page.reload(); await failed.page.clock.setFixedTime(new Date('2026-11-04T12:00:00+09:00'));
    await failed.page.evaluate(() => { Math.random = () => .99; }); await failed.page.locator('#open-daily').click();
    assert.equal(await text(failed.page), wording); assert.deepEqual(await readProgress(failed.page), progress(1, daily));
    assert.equal(await hasCelebration(failed.page), false);
    await failed.page.evaluate(() => { Storage.prototype.setItem = window.__testOriginalSet; }); await failed.page.locator('#retry-daily').click();
    assert.deepEqual((await gifts(failed.page)).items, [daily]); assert.deepEqual(await readProgress(failed.page), progress(1, daily));
    assert.equal(await text(failed.page, '#note-status'), '超级幸运已放进瓶子里。✨'); await failed.close();
  });

  await check('lucky: a daily result saved by another tab during animation wins without consuming another draw', async () => {
    const t = await fresh({ lucky: true, context: { reducedMotion: 'no-preference' }, seed: { [progressKey]: progress(15) } });
    const { page, context } = t; await page.clock.pauseAt(new Date('2026-10-19T15:00:00+09:00'));
    await page.locator('#open-daily').click(); await page.clock.runFor(500);
    const other = await context.newPage(); await other.emulateMedia({ reducedMotion: 'reduce' });
    await other.clock.install({ time: new Date('2026-10-19T15:00:00+09:00') }); await other.goto(origin + '/');
    await other.evaluate(() => { Math.random = () => .99; }); await other.locator('#open-daily').click();
    const daily = (await gifts(other)).items[0]; const state = await readProgress(other);
    await page.evaluate(() => { Math.random = () => 0; }); await page.clock.runFor(800);
    assert.equal(await text(page), daily.text); assert.equal(await specialShown(page), false);
    assert.deepEqual(await readProgress(page), state); assert.equal(state.misses, 16);
    await countIs(page, 1); await t.close();
  });

  await check('lucky: celebrations cover the viewport above the reader, pass input through, and stop on time or interruption', async () => {
    const t = await fresh({ lucky: true, context: { reducedMotion: 'no-preference' } }); const { page } = t;
    await page.clock.pauseAt(new Date('2026-10-19T15:00:00+09:00')); await page.locator('.choice-note').click();
    const focused = await page.evaluate(() => document.activeElement.id || document.activeElement.className);
    await page.evaluate(() => { Math.random = () => 0; }); await page.locator('.pick-drop').first().click(); await page.clock.runFor(1300);
    const bounds = await page.locator('#lucky-celebration').evaluate(node => { const r = node.getBoundingClientRect(); return { top: r.top, left: r.left, width: r.width, height: r.height, expectedWidth: innerWidth, expectedHeight: innerHeight, pointer: getComputedStyle(node).pointerEvents }; });
    assert.equal(await hasCelebration(page), true); assert.equal(bounds.top, 0); assert.equal(bounds.left, 0); assert.equal(bounds.width, bounds.expectedWidth); assert.equal(bounds.height, bounds.expectedHeight); assert.equal(bounds.pointer, 'none');
    assert.equal(await page.locator('.lucky-particle').count(), 36);
    assert.equal(await page.evaluate(() => document.activeElement.closest('#lucky-celebration') !== null), false);
    await animationFrame(page, '#lucky-celebration', 650); await page.screenshot({ path: path.join(results, 'super-lucky-celebration-390.png') });
    await page.locator('#save-note').click(); await countIs(page, 1); await page.clock.runFor(2399); assert.equal(await hasCelebration(page), true);
    await page.clock.runFor(1); assert.equal(await hasCelebration(page), false);
    await page.locator('#next-note').click(); await page.locator('.pick-drop').first().click(); await page.clock.runFor(1300); assert.equal(await hasCelebration(page), true);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await hasCelebration(page), false); assert.equal(await page.locator('.lucky-particle').count(), 0);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await hasCelebration(page), false); await closeDialog(page, 'note-dialog'); assert.equal(await page.locator('.lucky-particle').count(), 0);
    assert.ok(focused); await t.close();
  });

  await check('lucky: special bottle glow tracks repacking, current hero bottle, removal and cross-tab updates', async () => {
    const items = [...records(10), luckyRecord()];
    const t = await fresh({ lucky: true, seed: { [giftKey]: { version: 2, items } } }); const { page, context } = t;
    assert.equal(await cards(page).filter({ has: page.locator('.super-lucky-bottle') }).count(), 1);
    assert.equal(await page.locator('#hero-bottle.has-super-lucky').count(), 1); assert.equal(await cards(page).last().getAttribute('class').then(value => value.includes('has-super-lucky')), true);
    await cards(page).first().click(); await page.locator('.bottled-drop').first().click(); await page.locator('#remove-note').click();
    await closeDialog(page, 'note-dialog'); await closeDialog(page, 'bottle-dialog');
    assert.equal(await cards(page).count(), 1); assert.equal(await page.locator('#home-shelves .has-super-lucky').count(), 1);
    await cards(page).first().click(); assert.equal(await page.locator('#bottle-detail-art.has-super-lucky').count(), 1);
    await page.locator('.bottled-drop.is-super-lucky').click(); assert.match(await text(page, '#lucky-date'), /2026/); assert.equal(await hasCelebration(page), false);
    await page.locator('#remove-note').click(); await closeDialog(page, 'note-dialog'); await closeDialog(page, 'bottle-dialog');
    assert.equal(await page.locator('#home-shelves .has-super-lucky').count(), 0); assert.equal(await page.locator('#hero-bottle.has-super-lucky').count(), 0);
    const other = await context.newPage(); await other.goto(origin + '/');
    await other.evaluate(({ key, item }) => { const store = JSON.parse(localStorage.getItem(key)); store.items.push(item); localStorage.setItem(key, JSON.stringify(store)); }, { key: giftKey, item: luckyRecord('second') });
    await page.waitForSelector('#home-shelves .has-super-lucky');
    await page.locator('.hotspot-bottle').click(); assert.equal(await page.locator('#collection-list .has-super-lucky').count(), 1); await t.close();
  });

  await check('lucky: backups retain encounter IDs, dates, flags and separate lucky counts without current content', async () => {
    const items = [...records(1), luckyRecord('a'), luckyRecord('b'), luckyDaily];
    const t = await fresh({ lucky: true, seed: { [giftKey]: { version: 2, items }, [progressKey]: progress(2) } }); const { page } = t;
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__luckyBackup = value; } } }));
    await page.locator('[data-open="privacy-dialog"]').click(); await page.locator('#backup-copy').click();
    await page.waitForFunction(() => !!window.__luckyBackup); const backup = await page.evaluate(() => window.__luckyBackup); assert.deepEqual(JSON.parse(backup).gifts, items);
    assert.deepEqual(Object.keys(JSON.parse(backup)).sort(), ['exportedAt', 'format', 'gifts', 'legacyDays', 'vents', 'version']);
    assert.deepEqual(await readProgress(page), progress(2)); await t.close();
    const restored = await fresh({ seed: { [progressKey]: progress(10) } }); await openRestore(restored.page); await inspectBackup(restored.page, backup);
    assert.match(await text(restored.page, '#backup-summary'), /超级幸运：新增 3，重复 0/); assert.match(await text(restored.page, '#backup-summary'), /今日雨滴：新增 0，重复 0/);
    await restored.page.locator('#backup-confirm').click(); assert.deepEqual((await gifts(restored.page)).items, items);
    await restored.page.locator('#backup-check').click(); await restored.page.locator('#backup-confirm').click(); await countIs(restored.page, 4);
    assert.deepEqual(await readProgress(restored.page), progress(10));
    await closeDialog(restored.page, 'backup-dialog'); await closeDialog(restored.page, 'privacy-dialog');
    await cards(restored.page).first().click(); await restored.page.locator('.bottled-drop.is-super-lucky').first().click(); assert.equal(await text(restored.page), items[1].text);
    assert.equal(await restored.page.locator('#reader-mascot .lucky-mascot').count(), 1); await restored.close();
    const invalid = await fresh(); await openRestore(invalid.page);
    for (const item of [luckyRecord('x', { at: 'bad' }), luckyRecord('x', { special: 'unknown' }), luckyRecord('x', { source: 'message' })]) {
      await inspectBackup(invalid.page, backupOf({ gifts: [item] })); assert.equal(await invalid.page.locator('#backup-confirm').isVisible(), false);
    }
    await invalid.close();
  });

  await check('lucky: header bottle shakes on each click and releases stars after three taps with timeout and keyboard support', async () => {
    const t = await fresh({ lucky: true, context: { reducedMotion: 'no-preference' } }); const { page } = t;
    await page.clock.pauseAt(new Date('2026-10-19T15:00:00+09:00'));
    const button = page.locator('#brand-bottle'), stars = () => button.evaluate(node => node.classList.contains('has-stars'));
    const before = await savedCollections(page); await button.click(); assert.equal(await button.evaluate(node => node.classList.contains('is-shaking')), true); assert.equal(await stars(), false);
    await page.clock.runFor(2001); await button.click(); await button.click(); assert.equal(await stars(), false); await button.click(); assert.equal(await stars(), true);
    await animationFrame(page, '#brand-bottle', 450); await page.screenshot({ path: path.join(results, 'brand-bottle-stars-390.png') });
    await page.clock.runFor(1400); assert.equal(await stars(), false);
    await button.focus(); await page.keyboard.press('Enter'); await page.clock.runFor(2000); await page.keyboard.press('Space'); await page.keyboard.press('Enter'); assert.equal(await stars(), true);
    await page.locator('.choice-quiet').click(); assert.equal(await stars(), false); await closeDialog(page, 'quiet-dialog');
    await button.click(); await button.click(); await button.click(); assert.equal(await stars(), true);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await stars(), false); assert.deepEqual(await savedCollections(page), before);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
    await button.click(); assert.equal(await stars(), false); await t.close();
  });

  await check('lucky: reduced motion is static and all lucky states reflow at mobile and desktop sizes', async () => {
    const t = await fresh({ lucky: true }); const { page } = t;
    await page.locator('#brand-bottle').click(); await page.locator('#brand-bottle').click(); await page.locator('#brand-bottle').click();
    assert.equal(await page.locator('.brand-stars').evaluate(node => getComputedStyle(node).animationName), 'none');
    assert.equal(await page.locator('#brand-bottle').evaluate(node => node.classList.contains('is-shaking')), false);
    await drawWithRoll(page, 0); assert.equal(await page.locator('.lucky-particle').first().evaluate(node => getComputedStyle(node).animationName), 'none');
    await page.locator('#save-note').click();
    for (const width of [320, 390, 430, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await page.locator('#note-dialog .dialog-body').evaluate(node => node.scrollWidth > node.clientWidth), false);
      const target = await page.locator('#brand-bottle').boundingBox(); assert.ok(target.width >= 44 && target.height >= 44);
      await page.screenshot({ path: path.join(results, `super-lucky-reader-${width}.png`) });
    }
    await closeDialog(page, 'note-dialog'); await page.screenshot({ path: path.join(results, 'super-lucky-shelf-1280.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: path.join(results, 'super-lucky-shelf-390.png'), fullPage: true });
    assert.equal(await cards(page).first().locator('.bottle-drawing').evaluate(node => getComputedStyle(node).animationName), 'none');
    await t.close();
  });

  await check('daily homepage wording follows successful saving, rereading, removal and local midnight', async () => {
    const t = await fresh(); const { page } = t;
    assert.equal(await text(page, '.choice-note .choice-title'), '随手接一滴');
    assert.equal(await text(page, '#daily-label'), '接住今天这一滴');
    await page.locator('#open-daily').click(); const first = (await gifts(page)).items[0];
    assert.equal(await text(page, '#daily-label'), '看看今天留下的这一滴');
    await closeNote(page); await page.reload();
    assert.equal(await text(page, '#daily-label'), '看看今天留下的这一滴');
    await page.locator('#open-daily').click(); assert.equal(await text(page), first.text); await countIs(page, 1); await closeNote(page);
    await cards(page, 'gift').first().click(); await page.locator('.bottled-drop').first().click(); await page.locator('#remove-note').click();
    assert.equal(await text(page, '#daily-label'), '接住今天这一滴');
    await closeNote(page); await closeDialog(page, 'bottle-dialog'); await page.locator('#open-daily').click(); await closeNote(page);
    await page.clock.pauseAt(new Date('2026-10-19T23:59:59+09:00'));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.clock.runFor(1001);
    assert.equal(await text(page, '#daily-label'), '接住今天这一滴'); await countIs(page, 1);
    await page.locator('#open-daily').click(); await countIs(page, 2);
    assert.equal((await gifts(page)).items[1].day, '2026-10-20'); await t.close();
  });

  await check('daily label remains uncollected after interruption or quota failure, and updates after retry', async () => {
    const t = await fresh({ context: { reducedMotion: 'no-preference' } }); const { page } = t;
    await page.clock.pauseAt(new Date('2026-10-19T15:00:00+09:00'));
    await page.locator('#open-daily').click(); await page.clock.runFor(500); await closeNote(page); await page.clock.runFor(1400);
    assert.equal(await text(page, '#daily-label'), '接住今天这一滴'); await countIs(page, 0); await t.close();
    const failed = await fresh({ quota: 'gift-drops' });
    await failed.page.locator('#open-daily').click();
    assert.equal(await text(failed.page, '#daily-label'), '接住今天这一滴');
    await failed.page.evaluate(() => { Storage.prototype.setItem = window.__testOriginalSet; });
    await failed.page.locator('#retry-daily').click();
    assert.equal(await text(failed.page, '#daily-label'), '看看今天留下的这一滴'); await failed.close();
  });

  await check('daily homepage label follows another tab and foreground date changes', async () => {
    const t = await fresh(); const { page, context } = t;
    const other = await context.newPage(); await other.goto(origin + '/');
    await page.locator('#open-daily').click();
    await other.waitForFunction(() => document.getElementById('daily-label').textContent === '看看今天留下的这一滴');
    await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ version: 2, items: [] })), giftKey);
    await other.waitForFunction(() => document.getElementById('daily-label').textContent === '接住今天这一滴');
    await closeNote(page);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.clock.setFixedTime(new Date('2026-10-20T12:00:00+09:00'));
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await text(page, '#daily-label'), '接住今天这一滴'); await t.close();
  });

  await check('copy exports complete persisted snapshots and private writing without drafts or preferences', async () => {
    const daily = { id: 'daily:2026-10-19', source: 'daily', day: '2026-10-19', messageId: 'changed', text: '保存时的原话\n🌧️ <script>不可执行</script>', expression: 'pout' };
    const savedGifts = [...records(2), daily, { id: 'message:missing', source: 'message', messageId: 'missing', text: null, expression: 'blank' }];
    const savedVents = [{ ...privateRecords(1)[0], text: '自己的心事 " & </textarea><img src=x onerror=alert(1)>\n💧', expression: 'wistful' }];
    const t = await fresh({ seed: { [giftKey]: { version: 2, items: savedGifts }, [prefix + 'vents']: savedVents, [prefix + 'drops']: ['2026-10-17', '2026-10-18'], [prefix + 'weather']: 'sunny' } });
    const { page } = t; const before = await savedCollections(page);
    await page.locator('.choice-vent').click(); await page.locator('#vent-text').fill('还没提交的草稿，不应备份'); await closeDialog(page, 'vent-dialog');
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__copiedBackup = value; } } }));
    await page.locator('[data-open="privacy-dialog"]').click(); assert.match(await text(page, '.backup-tools'), /包含已保存的心事/);
    await page.locator('#backup-copy').click(); await page.waitForFunction(() => document.getElementById('backup-status').textContent.startsWith('已复制'));
    copiedBackup = await page.evaluate(() => window.__copiedBackup);
    const data = JSON.parse(copiedBackup);
    assert.match(copiedBackup, /\n  "format"/); assert.equal(data.format, 'lucky-xinxin-backup'); assert.equal(data.version, 1); assert.ok(Number.isFinite(Date.parse(data.exportedAt)));
    assert.deepEqual(data.gifts, savedGifts); assert.deepEqual(data.vents, savedVents); assert.deepEqual(data.legacyDays, ['2026-10-17', '2026-10-18']);
    assert.deepEqual(Object.keys(data).sort(), ['exportedAt', 'format', 'gifts', 'legacyDays', 'vents', 'version']);
    assert.ok(!copiedBackup.includes('还没提交的草稿')); assert.equal(await page.locator('#backup-output-panel').isVisible(), false);
    assert.deepEqual(await savedCollections(page), before); await closeDialog(page, 'backup-dialog');
    assert.equal(await page.locator('#backup-output').inputValue(), ''); assert.equal(await page.locator('#backup-input').inputValue(), ''); await t.close();
  });

  await check('clipboard refusal offers selectable manual backup and ignores results after closing', async () => {
    const t = await fresh({ seed: { [giftKey]: store(1) } }); const { page } = t;
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } }));
    await page.locator('[data-open="privacy-dialog"]').click(); await page.locator('#backup-copy').click();
    await page.locator('#backup-output-panel').waitFor({ state: 'visible' });
    assert.equal(JSON.parse(await page.locator('#backup-output').inputValue()).gifts.length, 1);
    await page.locator('#backup-select').click();
    assert.equal(await page.locator('#backup-output').evaluate(node => node.selectionEnd - node.selectionStart === node.value.length), true);
    await closeDialog(page, 'backup-dialog'); assert.equal(await page.locator('#backup-copy').evaluate(node => node === document.activeElement), true);
    assert.equal(await page.locator('#backup-output').inputValue(), '');
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => new Promise((resolve, reject) => { window.__rejectCopy = reject; }) } }));
    await page.locator('#backup-copy').click(); await closeDialog(page, 'backup-dialog'); await page.locator('#backup-restore').click();
    await page.evaluate(() => window.__rejectCopy(new Error('late denial')));
    assert.equal(await page.locator('#backup-output-panel').isVisible(), false); assert.equal(await text(page, '#backup-status'), ''); await t.close();
  });

  await check('exported text restores losslessly, shows category counts and never restores a duplicate', async () => {
    const t = await fresh(); const { page } = t; await openRestore(page); await inspectBackup(page, copiedBackup);
    assert.match(await text(page, '#backup-summary'), /普通赠言：新增 3，重复 0/); assert.match(await text(page, '#backup-summary'), /今日雨滴：新增 1/);
    await countIs(page, 0); await page.locator('#backup-confirm').click(); await countIs(page, 7);
    const data = JSON.parse(copiedBackup);
    assert.deepEqual((await gifts(page)).items, data.gifts);
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), prefix + 'vents'), data.vents);
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), prefix + 'drops'), data.legacyDays);
    assert.equal(await text(page, '#daily-label'), '看看今天留下的这一滴');
    await page.locator('#backup-check').click(); assert.match(await text(page, '#backup-summary'), /自己的心事：新增 0，重复 1/);
    await page.locator('#backup-confirm').click(); await countIs(page, 7); assert.match(await text(page, '#backup-status'), /没有重复添加/);
    await closeDialog(page, 'backup-dialog'); assert.equal(await page.locator('#backup-input').inputValue(), '');
    await closeDialog(page, 'privacy-dialog'); await page.locator('#open-daily').click(); assert.equal(await text(page), data.gifts[2].text); await t.close();
  });

  await check('merge preserves existing conflicts and order, including migrated legacy favorites', async () => {
    const incoming = backupOf({ gifts: [...records(2)].reverse(), vents: privateRecords(2), legacyDays: ['2026-10-18', '2026-10-17'] });
    const localGift = { ...records(1)[0], text: '本地原话', expression: 'blank' }, localVent = { ...privateRecords(1)[0], text: '本地心事', expression: 'sleepy' };
    const t = await fresh({ seed: { [giftKey]: { version: 2, items: [localGift] }, [prefix + 'vents']: [localVent], [prefix + 'drops']: ['2026-10-18'] } });
    await openRestore(t.page); await inspectBackup(t.page, incoming); assert.match(await text(t.page, '#backup-summary'), /普通赠言：新增 1，重复 1/);
    await t.page.locator('#backup-confirm').click(); assert.deepEqual((await gifts(t.page)).items, [localGift, records(2)[1]]);
    assert.deepEqual(await t.page.evaluate(key => JSON.parse(localStorage.getItem(key)), prefix + 'vents'), [localVent, privateRecords(2)[1]]); await t.close();
    const old = await fresh({ seed: { [prefix + 'favorites']: ['rest-01', 'unknown-old'] } });
    await openRestore(old.page); await inspectBackup(old.page, backupOf()); await old.page.locator('#backup-confirm').click();
    assert.deepEqual((await gifts(old.page)).items.map(item => item.messageId), ['rest-01', 'unknown-old', 'gift-000', 'gift-001']);
    assert.equal((await gifts(old.page)).items[1].text, null);
    assert.deepEqual(await old.page.evaluate(key => JSON.parse(localStorage.getItem(key)), prefix + 'favorites'), ['rest-01', 'unknown-old']); await old.close();
  });

  await check('invalid, unsupported and duplicate backup records cannot alter local data', async () => {
    const t = await fresh({ seed: { [giftKey]: store(1) } }); const { page } = t;
    const before = await savedCollections(page); await openRestore(page);
    const bad = ['{bad', {}, backupOf({ version: 99 }), backupOf({ exportedAt: 'bad-date' }), backupOf({ gifts: [{ ...records(1)[0], expression: 'bad' }] }), backupOf({ gifts: [...records(1), ...records(1)] }), backupOf({ vents: [{ id: 'a' }] }), backupOf({ vents: [...privateRecords(1), ...privateRecords(1)] }), backupOf({ legacyDays: ['2026-02-30'] })];
    for (const value of bad) {
      await inspectBackup(page, value); assert.equal(await page.locator('#backup-confirm').isVisible(), false);
      assert.ok((await text(page, '#backup-status')).length); assert.deepEqual(await savedCollections(page), before);
    }
    await inspectBackup(page, backupOf()); await page.locator('#backup-input').fill('改动后的内容');
    assert.equal(await page.locator('#backup-confirm').isVisible(), false); assert.equal(await text(page, '#backup-summary'), ''); await t.close();
  });

  await check('unreadable local records block both complete export and restoration', async () => {
    for (const key of [giftKey, prefix + 'vents', prefix + 'drops', prefix + 'favorites']) {
      const t = await fresh({ seed: { [key]: '{bad' } }); const { page } = t;
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { window.__copied = true; } } }));
      const before = await savedCollections(page);
      await page.locator('[data-open="privacy-dialog"]').click(); await page.locator('#backup-copy').click();
      assert.match(await text(page, '#backup-status'), /无法完整读取/); assert.equal(await page.evaluate(() => !!window.__copied), false);
      await closeDialog(page, 'backup-dialog'); await page.locator('#backup-restore').click(); await inspectBackup(page, backupOf());
      assert.equal(await page.locator('#backup-confirm').isVisible(), false); assert.deepEqual(await savedCollections(page), before); await t.close();
    }
  });

  await check('a failed multi-key restore rolls back absent and existing keys and allows retry', async () => {
    for (const seed of [{}, { [giftKey]: store(1), [prefix + 'vents']: privateRecords(1) }]) {
      const t = await fresh({ seed }); const { page } = t; const before = await savedCollections(page);
      await openRestore(page); const incoming = backupOf({ gifts: records(3), vents: privateRecords(2) }); await inspectBackup(page, incoming);
      await page.evaluate(key => { const original = Storage.prototype.setItem; window.__restoreSet = original; Storage.prototype.setItem = function(k, value) { if (k === key) throw new Error('quota'); return original.call(this, k, value); }; }, prefix + 'vents');
      await page.locator('#backup-confirm').click(); assert.match(await text(page, '#backup-status'), /没能恢复，已回滚/);
      assert.deepEqual(await savedCollections(page), before); assert.deepEqual(JSON.parse(await page.locator('#backup-input').inputValue()), incoming);
      await page.evaluate(() => { Storage.prototype.setItem = window.__restoreSet; });
      await page.locator('#backup-check').click(); await page.locator('#backup-confirm').click(); assert.match(await text(page, '#backup-status'), /合并好了/); await countIs(page, 6); await t.close();
    }
  });

  await check('rollback failure is reported honestly with pasted backup retained', async () => {
    const t = await fresh({ seed: { [giftKey]: store(1) } }); const { page } = t; await openRestore(page); await inspectBackup(page, backupOf());
    await page.evaluate(({ giftKey, ventKey }) => {
      const original = Storage.prototype.setItem; let giftsWritten = false;
      Storage.prototype.setItem = function(key, value) {
        if (key === ventKey || key === giftKey && giftsWritten) throw new Error('storage failed');
        original.call(this, key, value); if (key === giftKey) giftsWritten = true;
      };
    }, { giftKey, ventKey: prefix + 'vents' });
    await page.locator('#backup-confirm').click(); assert.match(await text(page, '#backup-status'), /恢复未完成，部分记录未能回滚/);
    assert.ok((await page.locator('#backup-input').inputValue()).length); assert.equal((await gifts(page)).items.length, 2); await t.close();
  });

  await check('restore rechecks a preview after another tab changes the collection', async () => {
    const t = await fresh(); const { page, context } = t; await openRestore(page); await inspectBackup(page, backupOf());
    const other = await context.newPage(); await other.goto(origin + '/'); await other.locator('#open-daily').click();
    await page.waitForFunction(() => document.getElementById('drop-count').textContent.includes('1滴'));
    await page.locator('#backup-confirm').click(); assert.match(await text(page, '#backup-status'), /本地记录刚刚有变化/); await countIs(page, 1);
    await page.locator('#backup-confirm').click(); await countIs(page, 5);
    await other.waitForFunction(() => document.getElementById('drop-count').textContent.includes('5滴')); await t.close();
  });

  await check('long daily labels, compact spacing and backup dialogs reflow at all requested widths', async () => {
    const daily = { id: 'daily:2026-10-19', source: 'daily', day: '2026-10-19', messageId: 'saved', text: '今天也可以慢慢来', expression: 'smile' };
    const t = await fresh({ seed: { [giftKey]: { version: 2, items: [daily] } } }); const { page } = t;
    for (const width of [320, 390, 430, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      const bounds = await page.evaluate(() => {
        const label = document.getElementById('daily-label').getBoundingClientRect(), button = document.getElementById('open-daily').getBoundingClientRect();
        const shelf = getComputedStyle(document.querySelector('.collection-section'));
        return { overflow: document.documentElement.scrollWidth > innerWidth, fits: label.left >= button.left && label.right <= button.right && label.bottom <= button.bottom, margin: parseFloat(shelf.marginTop), padding: parseFloat(shelf.paddingTop) };
      });
      assert.equal(bounds.overflow, false); assert.equal(bounds.fits, true); assert.equal(bounds.margin + bounds.padding, 16);
      if ([390, 1280].includes(width)) await page.screenshot({ path: path.join(results, `backup-refined-home-${width}.png`), fullPage: true });
      await openRestore(page); await inspectBackup(page, backupOf());
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(results, `backup-restore-${width}.png`) });
      await closeDialog(page, 'backup-dialog'); await closeDialog(page, 'privacy-dialog');
    }
    await page.setViewportSize({ width: 320, height: 640 });
    await page.addStyleTag({ content: 'button,p,span,label,li{font-size:28px!important} h1{font-size:52px!important}' });
    await page.locator('[data-art="letter"]').click();
    assert.equal(await page.evaluate(() => { const text = document.getElementById('art-message').getBoundingClientRect(), shelf = document.querySelector('.collection-section').getBoundingClientRect(); return text.bottom <= shelf.top; }), true);
    await openRestore(page); await inspectBackup(page, backupOf());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.locator('#backup-dialog .dialog-body').evaluate(node => node.scrollWidth <= node.clientWidth), true);
    await page.locator('#backup-dialog .dialog-body').evaluate(node => { node.scrollTop = node.scrollHeight; });
    const close = await page.locator('#backup-dialog .close').boundingBox(); assert.ok(close.y >= 0 && close.y + close.height <= 640);
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.getElementById('backup-dialog').open && !document.getElementById('backup-input').value);
    assert.equal(await page.locator('#backup-input').inputValue(), ''); await t.close();
  });

  await check('all 64 original message IDs and the old gift-box discoveries remain available', async () => {
    const original = { window: {} };
    require('node:vm').runInNewContext(require('node:child_process').execFileSync('git', ['show', '3702742:content.js'], { encoding: 'utf8' }), original);
    const t = await fresh(); const { page } = t;
    const ids = await page.evaluate(() => window.EMOTION_BOX_CONTENT.messages.map(message => message.id));
    assert.equal(ids.length, 64); assert.deepEqual(ids, Array.from(original.window.EMOTION_BOX_CONTENT.messages, message => message.id));
    for (const kind of ['box', 'letter', 'flower', 'heart']) {
      assert.equal(await page.locator(`[data-art="${kind}"]`).count(), 1);
      const current = await page.evaluate(kind => window.EMOTION_BOX_CONTENT.interactions[kind], kind);
      if (kind === 'heart') assert.equal(current, '这颗也留给你~qwq');
      else assert.ok(current.startsWith(original.window.EMOTION_BOX_CONTENT.interactions[kind]));
    }
    assert.equal(await page.locator('#desk-box .box-art .art-letter,#desk-box .box-art .art-flower,#desk-box .box-art .art-heart').count(), 3);
    assert.equal(await page.locator('#package-label').textContent(), 'To馨馨'); assert.equal(await page.locator('#art-stage .art-hotspot').count(), 9); await t.close();
  });

  await check('first and returning layouts keep the daily entry visible and all nine scene hotspots separate', async () => {
    for (const returning of [false, true]) {
      const t = await fresh({ seed: returning ? { [prefix + 'visited']: true } : {} }); const { page } = t;
      for (const width of [320, 390, 430, 760, 768, 900, 1280]) {
        await page.setViewportSize({ width, height: width === 320 ? 640 : 844 });
        const bounds = await page.evaluate(() => {
          const get = selector => document.querySelector(selector).getBoundingClientRect();
          const hot = [...document.querySelectorAll('#art-stage .art-hotspot')].map(node => ({ label: node.getAttribute('aria-label'), rect: node.getBoundingClientRect() }));
          const overlaps = [];
          for (let i = 0; i < hot.length; i++) for (let j = i + 1; j < hot.length; j++) {
            const a = hot[i].rect, b = hot[j].rect;
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > .5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > .5) overlaps.push([hot[i].label, hot[j].label]);
          }
          return { overflow: document.documentElement.scrollWidth > innerWidth, dailyBottom: get('#open-daily').bottom, dailyTop: get('#open-daily').top,
            minTarget: hot.every(({ rect: r }) => r.width >= 44 && r.height >= 44), overlaps,
            copyVisible: get('.hero-copy .eyebrow').height > 0 && get('#hero-intro').height > 0,
            mobileOrder: get('#open-daily').bottom < get('.choices').top && get('.choices').bottom <= get('.desk-props').top,
            feedbackHeight: get('#art-message').height, boxWidth: get('#desk-box').width };
        });
        assert.equal(bounds.overflow, false); assert.equal(bounds.minTarget, true); assert.deepEqual(bounds.overlaps, []); assert.equal(bounds.copyVisible, true); assert.ok(bounds.dailyTop > 0 && bounds.dailyBottom < (width === 320 ? 640 : 700)); assert.equal(bounds.feedbackHeight, 0, 'No reserved feedback row'); assert.ok(bounds.boxWidth >= 240);
        if (width <= 760) assert.equal(bounds.mobileOrder, true);
        if ([390, 768, 1280].includes(width)) await page.screenshot({ path: path.join(results, `desk-${returning ? 'returning' : 'first'}-${width}.png`), fullPage: true });
      }
      await t.close();
    }
  });

  await check('iPhone 15 Pro Max puts a small bottle beside the greeting and gives the gift box its own area', async () => {
    const { defaultBrowserType, ...device } = require('playwright').devices['iPhone 15 Pro Max'];
    const t = await fresh({ context: { ...device, reducedMotion: 'reduce' } }); const { page } = t;
    assert.equal(await page.locator('.bottle-hint').count(), 0);
    for (const height of [739, 932]) {
      await page.setViewportSize({ width: 430, height });
      const layout = await page.evaluate(() => {
        const box = selector => document.querySelector(selector).getBoundingClientRect();
        const heading = box('#hero-title'), bottle = box('.desk-bottle'), intro = box('#hero-intro'), gift = box('.desk-props'), choices = box('.choices');
        return { bottleWidth: bottle.width, sharesGreeting: bottle.left >= heading.right && bottle.top < heading.bottom && bottle.bottom > heading.top,
          introBelow: intro.top >= bottle.bottom, giftSeparate: gift.top > choices.bottom && gift.top > bottle.bottom,
          giftHeight: gift.height, dailyBottom: box('#open-daily').bottom, overflow: document.documentElement.scrollWidth > innerWidth,
          footerTarget: box('#closing-star').width >= 44 && box('#closing-star').height >= 44,
          sheepBehindBox: !!(document.querySelector('.art-sheep').compareDocumentPosition(document.querySelector('.art-box-base')) & Node.DOCUMENT_POSITION_FOLLOWING) };
      });
      assert.ok(layout.bottleWidth <= 155); assert.equal(layout.sharesGreeting, true); assert.equal(layout.introBelow, true); assert.equal(layout.giftSeparate, true); assert.ok(layout.giftHeight < 350); assert.ok(layout.dailyBottom < height); assert.equal(layout.overflow, false); assert.equal(layout.footerTarget, true); assert.equal(layout.sheepBehindBox, true);
      await page.screenshot({ path: path.join(results, `iphone15-pro-max-home-${height}.png`), fullPage: true, scale: 'css' });
    }
    await page.locator('.hotspot-bottle').tap(); await closeDialog(page, 'collection-dialog'); await page.locator('#touch-star').tap(); assert.equal(await page.locator('.scene-bubble').count(), 0);
    await page.locator('#open-secret').tap(); await closeDialog(page, 'secret-dialog'); assert.equal(await page.locator('#open-secret').evaluate(node => node === document.activeElement), true); await t.close();
  });

  await check('sheep floating response and closing star respond to touch and keyboard, cancel repeats and respect reduced motion', async () => {
    const { defaultBrowserType, ...device } = require('playwright').devices['iPhone 15 Pro Max'];
    const t = await fresh({ context: { ...device, reducedMotion: 'no-preference' } }); const { page } = t;
    await page.clock.pauseAt(new Date('2026-10-19T15:00:00+09:00'));
    assert.equal(await page.locator('#art-message').isVisible(), false); assert.equal(await page.locator('#closing-star').evaluate(node => node.classList.contains('is-lit')), false);
    await page.locator('[data-art="sheep"]').tap(); assert.equal(await page.locator('#art-message').innerText(), 'Lucky馨馨超Lucky~'); assert.equal(await page.locator('#art-stage').getAttribute('data-effect'), 'sheep'); assert.equal(await text(page, '#art-message'), 'Lucky馨馨超Lucky~');
    await page.clock.runFor(1000); await page.locator('[data-art="sheep"]').tap(); await page.clock.runFor(3100); assert.equal(await page.locator('#art-message').isVisible(), true);
    await page.clock.runFor(899); assert.equal(await page.locator('#art-message').isVisible(), true); await page.clock.runFor(1); assert.equal(await page.locator('#art-message').isVisible(), false);
    await page.locator('[data-art="sheep"]').focus(); await page.keyboard.press('Enter'); assert.equal(await page.locator('#art-message').isVisible(), true);
    await page.locator('#closing-star').tap(); assert.equal(await page.locator('#art-message').isVisible(), true); assert.equal(await page.locator('#closing-star').evaluate(node => node.classList.contains('is-shining')), true); assert.equal(await text(page, '#closing-star-status'), '给今天留一点小星光。');
    await page.clock.runFor(1000); await page.locator('#closing-star').tap(); await page.clock.runFor(1100); assert.equal(await page.locator('#closing-star').evaluate(node => node.classList.contains('is-shining')), true);
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.locator('#closing-star:not(.is-shining)').waitFor({ state: 'attached' }); assert.equal(await page.locator('#closing-star').evaluate(node => node.classList.contains('is-lit')), true);
    await page.clock.runFor(2899); assert.equal(await page.locator('#closing-star').evaluate(node => node.classList.contains('is-lit')), true); await page.clock.runFor(1); assert.equal(await page.locator('#closing-star').evaluate(node => node.classList.contains('is-lit')), false);
    await page.locator('[data-art="sheep"]').tap(); assert.equal(await page.locator('#art-message').isVisible(), true); assert.equal(await page.locator('#art-stage').getAttribute('data-effect'), null);
    await page.locator('#closing-star').focus(); await page.keyboard.press('Space'); assert.equal(await page.locator('#art-message').isVisible(), true); assert.equal(await page.locator('#closing-star').evaluate(node => node.classList.contains('is-lit') && !node.classList.contains('is-shining')), true);
    await page.locator('.choice-note').tap(); assert.equal(await page.locator('#closing-star').evaluate(node => node.classList.contains('is-lit')), false); await closeNote(page);
    await page.locator('[data-art="sheep"]').tap(); await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); }); assert.equal(await page.locator('#art-message').isVisible(), false);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); }); assert.equal(await page.locator('#art-message').isVisible(), false);
    await countIs(page, 0); assert.equal(await gifts(page), null); assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), [prefix + 'visited']); await t.close();
    const live = await fresh({ realTime: true, context: { ...device, reducedMotion: 'no-preference' } });
    await live.page.locator('[data-art="sheep"]').tap(); await live.page.waitForTimeout(500); await live.page.screenshot({ path: path.join(results, 'iphone15-pro-max-sheep.png'), scale: 'css' });
    await live.page.locator('#closing-star').tap(); await live.page.waitForTimeout(600); await live.page.screenshot({ path: path.join(results, 'iphone15-pro-max-star.png'), scale: 'css' }); await live.close();
  });

  await check('classic scrollbars retain page width through modal and nested modal open and close', async () => {
    const classic = await chromium.launch({ headless: true, ignoreDefaultArgs: ['--hide-scrollbars'], args: ['--disable-features=OverlayScrollbar'], ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
    try {
      for (const classicMode of [true, false]) for (const width of [390, 1280]) {
        const t = await fresh({ browser: classicMode ? classic : browser, context: { viewport: { width, height: 844 } } }); const { page } = t;
        if (classicMode) await page.addStyleTag({ content: '::-webkit-scrollbar{width:17px}' });
        const measure = () => page.locator('.site-shell').evaluate(node => { const r = node.getBoundingClientRect(); return { left: r.left, width: r.width }; });
        const gutter = await page.evaluate(() => innerWidth - document.documentElement.clientWidth);
        assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarGutter), 'auto');
        assert.equal(await page.locator('body').evaluate(node => getComputedStyle(node).paddingRight), '0px');
        if (classicMode) assert.equal(gutter, 17, 'Exercise a scrollbar that consumes layout width');
        else assert.equal(gutter, 0, 'Overlay scrollbars must not leave an artificial stripe');
        const initial = await measure();
        await page.locator('.choice-quiet').click(); assert.deepEqual(await measure(), initial);
        assert.equal(await page.locator('body').evaluate(node => parseFloat(getComputedStyle(node).paddingRight)), gutter);
        if (width === 1280) await page.screenshot({ path: path.join(results, `scrollbar-modal-${classicMode ? 'classic' : 'overlay'}.png`) });
        await page.waitForFunction(() => !document.getElementById('quiet-book').disabled);
        await page.locator('#quiet-book').click({ clickCount: 2 }); assert.deepEqual(await measure(), initial);
        await closeDialog(page, 'poem-dialog'); assert.deepEqual(await measure(), initial);
        await closeDialog(page, 'quiet-dialog'); assert.deepEqual(await measure(), initial);
        assert.equal(await page.locator('body').evaluate(node => getComputedStyle(node).paddingRight), '0px');
        await page.locator('.choice-note').click(); assert.deepEqual(await measure(), initial);
        await closeDialog(page, 'note-dialog'); assert.deepEqual(await measure(), initial);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await t.close();
      }
    } finally { await classic.close(); }
  });

  await check('dialog transitions enter and close smoothly, preserve focus and honor reduced motion', async () => {
    const t = await fresh({ realTime: true, context: { reducedMotion: 'no-preference' } }); const { page } = t;
    await page.locator('.choice-quiet').click();
    assert.equal(await page.locator('#quiet-dialog').evaluate(node => getComputedStyle(node).animationName), 'dialog-arrive');
    await page.locator('#quiet-dialog [data-close]').evaluate(node => { node.click(); node.click(); });
    assert.equal(await page.locator('#quiet-dialog').evaluate(node => node.open && node.classList.contains('is-closing')), true);
    await page.waitForFunction(() => !document.getElementById('quiet-dialog').open);
    await page.waitForFunction(() => document.activeElement.classList.contains('choice-quiet'));
    await page.locator('.choice-quiet').click();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('quiet-dialog').open);
    assert.equal(await page.locator('#quiet-dialog.is-closing').count(), 0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.choice-quiet').click();
    assert.equal(await page.locator('#quiet-dialog').evaluate(node => getComputedStyle(node).animationName), 'none');
    await closeDialog(page, 'quiet-dialog');
    await t.close();
  });

  await check('concurrent bubbles keep independent expiry and title star never creates a bubble', async () => {
    const t = await fresh(); const { page } = t;
    await page.clock.pauseAt(new Date('2026-10-19T15:00:00+09:00'));
    await page.locator('[data-art="sheep"]').click();
    const first = await page.locator('.scene-bubble').first().elementHandle();
    await page.clock.runFor(1000);
    await page.locator('[data-art="heart"]').click();
    await page.locator('[data-art="sheep"]').click();
    assert.equal(await page.locator('.scene-bubble').count(), 3);
    assert.deepEqual(await page.locator('.scene-bubble').allTextContents(), ['Lucky馨馨超Lucky~', '这颗也留给你~qwq', 'Lucky馨馨超Lucky~']);
    const before = await page.locator('.scene-bubble').allTextContents();
    await page.locator('#touch-star').click();
    assert.deepEqual(await page.locator('.scene-bubble').allTextContents(), before);
    assert.equal(await page.locator('#art-stage').evaluate(node => node.classList.contains('is-sparkling')), true);
    await page.screenshot({ path: path.join(results, 'concurrent-bubbles.png'), fullPage: true });
    await page.clock.runFor(2999); assert.equal(await page.locator('.scene-bubble').count(), 3);
    await page.clock.runFor(1); assert.equal(await first.evaluate(node => node.isConnected), false);
    assert.equal(await page.locator('.scene-bubble').count(), 2);
    await page.clock.runFor(999); assert.equal(await page.locator('.scene-bubble').count(), 2);
    await page.clock.runFor(1); assert.equal(await page.locator('.scene-bubble').count(), 0);
    await page.locator('[data-art="sheep"]').click({ clickCount: 3 });
    assert.equal(await page.locator('.scene-bubble').count(), 3);
    const positions = await page.locator('.scene-bubble').evaluateAll(nodes => nodes.map(node => node.style.top + ':' + node.style.left));
    assert.equal(new Set(positions).size, 3);
    await page.locator('.choice-quiet').click(); assert.equal(await page.locator('.scene-bubble').count(), 0);
    await closeDialog(page, 'quiet-dialog');
    await page.locator('[data-art="heart"]').click();
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await page.locator('.scene-bubble').count(), 0);
    await t.close();
  });

  await check('floating feedback rises and fades without moving the shelf, with meadow contact shadows', async () => {
    const t = await fresh({ context: { reducedMotion: 'no-preference' } }); const { page } = t;
    assert.equal(await page.locator('#sheep-bubble').count(), 0);
    const shelfTop = () => page.locator('.collection-section').evaluate(node => node.getBoundingClientRect().top + scrollY);
    assert.equal(await page.locator('.box-ground-shadow,.sheep-ground-shadow').count(), 2);
    assert.match(await page.locator('.art-sheep image').getAttribute('href'), /sheep-outlined-v3/);
    for (const width of [320, 390, 430, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      const before = await shelfTop();
      assert.ok(await page.locator('.desk-floor').evaluate(node => node.offsetHeight >= 134));
      const gap = await page.evaluate(() => document.querySelector('.collection-section').getBoundingClientRect().top - document.querySelector('.desk-props').getBoundingClientRect().bottom);
      assert.ok(gap <= 4, `Reserved gap ${gap} at ${width}`);
      for (const kind of ['sheep', 'box', 'letter', 'flower', 'heart', 'potato']) {
        await page.locator(`[data-art="${kind}"]`).click();
        await animationFrame(page, '.scene-bubble:last-child', 600);
        const early = await page.locator('.scene-bubble').last().evaluate(node => {
          const r = node.getBoundingClientRect(), stage = document.querySelector('#art-stage').getBoundingClientRect();
          return { y: r.y, opacity: Number(getComputedStyle(node).opacity), fits: r.left >= stage.left && r.right <= stage.right && r.top >= stage.top };
        });
        assert.ok(early.fits); assert.equal(early.opacity, 1);
        assert.ok(Math.abs(await shelfTop() - before) < 1);
        if (kind === 'sheep') {
          assert.equal(await page.locator('#art-message').innerText(), 'Lucky馨馨超Lucky~');
          await page.screenshot({ path: path.join(results, `floating-sheep-${width}.png`), fullPage: true });
        }
        await animationFrame(page, '.scene-bubble:last-child', 3600);
        const late = await page.locator('.scene-bubble').last().evaluate(node => ({ y: node.getBoundingClientRect().y, opacity: Number(getComputedStyle(node).opacity) }));
        assert.ok(late.y < early.y); assert.ok(late.opacity < .5);
      }
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('[data-art="sheep"]').click();
    assert.equal(await page.locator('.scene-bubble').last().evaluate(node => getComputedStyle(node).animationName), 'none');
    await t.close();
  });

  await check('tabletop discoveries animate, clean up, retain feedback and never add collection records', async () => {
    const t = await fresh({ context: { reducedMotion: 'no-preference', viewport: { width: 1280, height: 900 } } }); const { page } = t;
    await page.clock.pauseAt(new Date('2026-10-19T15:00:00+09:00'));
    const baseline = await page.locator('.desk-feedback').boundingBox();
    for (const kind of ['box', 'letter', 'flower', 'heart', 'potato']) {
      await page.locator(`[data-art="${kind}"]`).click();
      assert.equal(await page.locator('#art-stage').getAttribute('data-effect'), kind);
      assert.equal(await text(page, '#art-message'), await page.evaluate(kind => window.EMOTION_BOX_CONTENT.interactions[kind], kind));
      await animationFrame(page, '#art-stage', kind === 'letter' ? 950 : 650);
      if (kind === 'box') {
        assert.ok(Number(await page.locator('.packed-lid').evaluate(node => getComputedStyle(node).opacity)) > .9);
        for (const selector of ['.art-potato', '.box-flowers']) assert.equal(Number(await page.locator(selector).evaluate(node => getComputedStyle(node).opacity)), 0);
      }
      if (kind === 'potato') assert.ok(await page.locator('.art-potato').evaluate(node => new DOMMatrixReadOnly(getComputedStyle(node).transform).m42 < 0));
      if (kind === 'heart') assert.equal(await page.locator('.desk-heart').evaluateAll(nodes => new Set(nodes.map(node => node.style.width)).size), 3);
      if (kind === 'letter') assert.ok(Number(await page.locator('.paper-plane').evaluate(node => getComputedStyle(node).opacity)) > .9);
      if (kind === 'flower') {
        assert.equal(await page.locator('#art-effects').evaluate(node => getComputedStyle(node).position), 'fixed');
        const spread = await page.locator('.desk-petal').evaluateAll(nodes => nodes.map(node => parseFloat(node.style.left)));
        assert.ok(Math.min(...spread) < 10 && Math.max(...spread) > 90);
      }
      if (['flower', 'heart'].includes(kind)) assert.equal(await page.locator('#art-effects > span').count(), kind === 'flower' ? 16 : 3);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.clock.runFor(2100); assert.equal(await page.locator('#art-stage').getAttribute('data-effect'), null); assert.equal(await page.locator('#art-effects > span').count(), 0); assert.ok((await text(page, '#art-message')).length);
      const after = await page.locator('.desk-feedback').boundingBox(); assert.equal(after.height, baseline.height);
      await page.clock.runFor(1899); assert.ok((await text(page, '#art-message')).length); await page.clock.runFor(1); assert.equal(await text(page, '#art-message'), '');
    }
    assert.equal(await page.evaluate(() => localStorage.length), 0); await countIs(page, 0); await t.close();
    // SVG paint can lag when seeking a paused animation with a mocked clock.
    // Capture these two visual previews using the normal browser timeline.
    const live = await fresh({ realTime: true, context: { reducedMotion: 'no-preference', viewport: { width: 1280, height: 900 } } });
    for (const [kind, delay, filename] of [['box', 800, 'desk-box-packed.png'], ['letter', 950, 'desk-paper-plane.png']]) {
      await live.page.locator(`[data-art="${kind}"]`).click(); await live.page.waitForTimeout(delay);
      assert.ok(Number(await live.page.locator(kind === 'box' ? '.packed-lid' : '.paper-plane').evaluate(node => getComputedStyle(node).opacity)) > .9);
      await live.page.screenshot({ path: path.join(results, filename) });
    }
    await live.close();
  });

  await check('tabletop motion restarts while bubbles retain their own lifetime and respect modal cleanup', async () => {
    const t = await fresh({ context: { reducedMotion: 'no-preference' } }); const { page } = t;
    await page.clock.pauseAt(new Date('2026-10-19T15:00:00+09:00'));
    await page.locator('[data-art="flower"]').focus(); await page.keyboard.press('Enter'); assert.equal(await page.locator('.desk-petal').count(), 16);
    await page.clock.runFor(1000); await page.locator('[data-art="heart"]').click(); assert.equal(await page.locator('.desk-petal').count(), 0); assert.equal(await page.locator('.desk-heart').count(), 3);
    await page.clock.runFor(1100); assert.equal(await page.locator('#art-stage').getAttribute('data-effect'), 'heart');
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.locator('#art-stage:not([data-effect])').waitFor({ state: 'attached' }); assert.equal(await text(page, '#art-message'), '这颗也留给你~qwq'); assert.equal(await page.locator('#art-effects > span').count(), 0);
    await page.clock.runFor(2899); assert.ok((await text(page, '#art-message')).length); await page.clock.runFor(1); assert.equal(await text(page, '#art-message'), '');
    for (const kind of ['box', 'letter', 'flower', 'heart', 'potato']) { await page.locator(`[data-art="${kind}"]`).focus(); await page.keyboard.press('Space'); assert.equal(await page.locator('#art-stage').getAttribute('data-effect'), null); assert.ok((await text(page, '#art-message')).length); }
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.locator('[data-art="letter"]').click(); await page.locator('[data-art="letter"]').click();
    await animationFrame(page, '#art-stage', 950); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); await page.screenshot({ path: path.join(results, 'desk-paper-plane-mobile.png') });
    await page.locator('.hotspot-bottle').click(); assert.equal(await text(page, '#art-message'), ''); assert.equal(await page.locator('#art-stage').getAttribute('data-effect'), null); await closeDialog(page, 'collection-dialog'); assert.equal(await page.locator('.hotspot-bottle').evaluate(node => node === document.activeElement), true);
    await page.locator('[data-art="heart"]').click(); await page.locator('#open-secret').click(); assert.equal(await text(page, '#art-message'), ''); assert.equal(await page.locator('#art-effects > span').count(), 0); await closeDialog(page, 'secret-dialog'); assert.equal(await page.locator('#open-secret').evaluate(node => node === document.activeElement), true);
    await page.locator('[data-art="flower"]').click(); await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await text(page, '#art-message'), ''); assert.equal(await page.locator('#art-effects > span').count(), 0);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); }); assert.equal(await page.locator('#art-stage').getAttribute('data-effect'), null);
    await page.evaluate(() => { window.__deskNodes = { box: document.getElementById('desk-box'), star: document.querySelector('.hero-star'), mascot: document.querySelector('.hero-mascot'), bottle: document.getElementById('hero-bottle') }; });
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.locator('#open-daily').click(); await countIs(page, 1); await closeNote(page);
    assert.equal(await page.evaluate(() => Object.entries(window.__deskNodes).every(([key, node]) => node === (key === 'box' ? document.getElementById('desk-box') : key === 'bottle' ? document.getElementById('hero-bottle') : document.querySelector(key === 'star' ? '.hero-star' : '.hero-mascot')))), true);
    await page.locator('[data-art="box"]').click(); assert.equal(await text(page, '#art-message'), await page.evaluate(() => window.EMOTION_BOX_CONTENT.interactions.box)); await countIs(page, 1); await t.close();
  });

  await check('drop wording and unpunctuated modal titles preserve saved snapshots and private text', async () => {
    const item = { ...records(1)[0], text: '以前存下的这颗小雨滴。' };
    const privateItem = { ...privateRecords(1)[0], text: '我自己写的一颗星。' };
    const t = await fresh({ seed: { [giftKey]: { version: 2, items: [item] }, [prefix + 'vents']: [privateItem] } }); const { page } = t;
    await countIs(page, 2);
    assert.equal(await page.locator('#touch-star').getAttribute('aria-label'), '让瓶子周围闪起小星星');
    assert.equal(await page.locator('.shelf-note').innerText(), '每瓶10滴，慢慢收就好。');
    assert.deepEqual(await page.locator('dialog h2').evaluateAll(nodes => nodes.filter(node => node.textContent.endsWith('。')).map(node => node.textContent)), []);
    await page.locator('.choice-note').click(); assert.equal(await text(page, '#note-dialog-title'), '随手接住一滴');
    assert.equal((await page.locator('#note-dialog').textContent()).includes('颗'), false);
    await page.locator('.pick-drop').first().click(); assert.equal(await text(page, '#next-note'), '再接一滴'); await closeNote(page);
    await cards(page, 'gift').first().click(); await page.locator('.bottled-drop').first().click(); assert.equal(await text(page), item.text);
    assert.deepEqual((await gifts(page)).items, [item]); await closeNote(page); await closeDialog(page, 'bottle-dialog');
    await cards(page, 'self').first().click(); await page.locator('.bottled-drop').first().click(); assert.equal(await text(page, '#personal-text'), privateItem.text);
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), prefix + 'vents'), [privateItem]); await t.close();
  });

  await check('daily catch saves once per date with a frozen snapshot and expression', async () => {
    const t = await fresh({ pool: [{ id: 'same', text: '今天也可以慢慢来。' }] }); const { page } = t;
    assert.equal(await page.evaluate(() => localStorage.length), 0);
    assert.equal(await page.locator('#open-collection').count(), 0);
    await page.locator('#open-daily').click(); await countIs(page, 1);
    const saved = (await gifts(page)).items[0]; assert.equal(saved.source, 'daily'); assert.equal(saved.id, 'daily:2026-10-19'); assert.equal(saved.day, '2026-10-19'); assert.ok(faces.includes(saved.expression));
    assert.equal(await page.locator('#next-note').isVisible(), false); assert.equal(await page.locator('#save-note').isVisible(), false); assert.equal(await page.locator('#go-random').isVisible(), true);
    await closeNote(page); await page.reload(); assert.match(await text(page, '#hero-title'), /馨馨，欢迎回来～/);
    await page.locator('#open-daily').click(); await countIs(page, 1); assert.deepEqual((await gifts(page)).items[0], saved);
    assert.equal(await page.locator('#reader-mascot svg').getAttribute('data-expression'), saved.expression);
    await closeNote(page); await page.clock.setFixedTime(new Date('2026-10-20T00:01:00+09:00')); await page.locator('#open-daily').click(); await countIs(page, 2);
    assert.equal(await text(page), saved.text); assert.equal((await gifts(page)).items[1].id, 'daily:2026-10-20');
    await page.locator('#go-random').click(); await page.locator('.pick-drop').first().click(); await page.locator('#save-note').click(); await countIs(page, 3);
    assert.equal((await gifts(page)).items[2].id, 'message:same'); await t.close();
  });

  await check('an existing daily snapshot wins over changed content and has no random controls', async () => {
    const item = { id: 'daily:2026-10-19', source: 'daily', day: '2026-10-19', messageId: 'changed', text: '当时存下的那句话', expression: 'pout' };
    const t = await fresh({ pool: [{ id: 'changed', text: '后来编辑的文字' }], seed: { [giftKey]: { version: 2, items: [item] } } });
    await t.page.locator('#open-daily').click(); assert.equal(await text(t.page), item.text); assert.equal(await t.page.locator('#reader-mascot svg').getAttribute('data-expression'), 'pout'); await countIs(t.page, 1); await t.close();
  });

  await check('catching takes 1.3 seconds and closing either mode before completion does not collect or draw', async () => {
    const t = await fresh({ random: true, context: { reducedMotion: 'no-preference' } }); const { page } = t;
    await page.clock.pauseAt(new Date('2026-10-19T15:00:00+09:00'));
    await page.locator('#open-daily').click(); assert.equal(await page.locator('#catch-panel').isVisible(), true);
    await page.clock.runFor(500);
    await closeNote(page); await page.clock.runFor(1000); await countIs(page, 0); assert.equal(await gifts(page), null);
    await page.locator('.choice-note').click(); await page.locator('.pick-drop').first().click(); await page.clock.runFor(500);
    await closeNote(page); await page.clock.runFor(1300); await countIs(page, 0); assert.equal(await gifts(page), null); assert.equal(await text(page), '');
    await page.locator('.choice-note').click(); await page.locator('.pick-drop').first().click(); await page.clock.runFor(1299);
    assert.equal(await page.locator('#catch-panel').isVisible(), true); await countIs(page, 0);
    await page.clock.runFor(1); assert.equal(await page.locator('#note-reader').isVisible(), true); await countIs(page, 0);
    const drawn = await text(page); await page.locator('#save-note').click(); await countIs(page, 1);
    await closeNote(page); await page.locator('#open-daily').click(); await page.clock.runFor(1299); await countIs(page, 1); await page.clock.runFor(1); await countIs(page, 2);
    assert.ok(drawn.length); await t.close();
  });

  await check('real CSS catching frames land on a lotus leaf, bounce together and hold at all widths', async () => {
    const t = await fresh({ context: { reducedMotion: 'no-preference' } }); const { page } = t;
    await page.clock.pauseAt(new Date('2026-10-19T15:00:00+09:00')); await page.locator('#open-daily').click();
    const caption = () => page.locator('.catch-caption').evaluate(node => getComputedStyle(node).visibility);
    assert.match(await page.locator('#catch-scene').getAttribute('aria-label'), /荷叶/);
    assert.equal(await page.locator('[class*="catch-hands"]').count(), 0);
    await animationFrame(page, '#catch-panel', 0); assert.equal(await caption(), 'hidden');
    await page.screenshot({ path: path.join(results, 'catching-start.png') });
    await animationFrame(page, '#catch-panel', 585);
    const contact = await page.locator('#catch-scene').evaluate(node => {
      const leaf = node.querySelector('.leaf-surface'), drop = node.querySelector('.catch-drop-motion svg');
      return [[34, 108], [69, 108]].map(([x, y]) => leaf.isPointInFill(new DOMPoint(x, y).matrixTransform(drop.getScreenCTM()).matrixTransform(leaf.getScreenCTM().inverse())));
    });
    assert.deepEqual(contact, [true, true]);
    assert.match(await page.locator('.catch-leaf').evaluate(node => getComputedStyle(node).transform), /5\)/);
    await animationFrame(page, '#catch-panel', 600); assert.equal(await caption(), 'visible');
    await page.screenshot({ path: path.join(results, 'catching-contact.png') });
    await animationFrame(page, '#catch-panel', 676);
    assert.match(await page.locator('.catch-drop-motion').evaluate(node => getComputedStyle(node).transform), /-6\)/);
    assert.match(await page.locator('.catch-leaf').evaluate(node => getComputedStyle(node).transform), /-2\)/);
    await page.screenshot({ path: path.join(results, 'catching-rebound.png') });
    await animationFrame(page, '#catch-panel', 1040);
    for (const width of [320, 390, 430, 760, 768, 900, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      const geometry = await page.locator('#catch-scene').evaluate(node => {
        const root = node.querySelector('svg'), drop = node.querySelector('.catch-drop-motion svg'), leaf = node.querySelector('.catch-leaf'), surface = node.querySelector('.leaf-surface');
        const feet = [[34, 108], [69, 108]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(drop.getScreenCTM()));
        const supported = feet.map(foot => surface.isPointInFill(foot.matrixTransform(surface.getScreenCTM().inverse())));
        const svgBox = root.getBoundingClientRect(), leafBox = leaf.getBoundingClientRect();
        return { supported, order: !!(leaf.compareDocumentPosition(drop) & Node.DOCUMENT_POSITION_FOLLOWING), clipped: leafBox.bottom > svgBox.bottom || leafBox.left < svgBox.left || leafBox.right > svgBox.right, overflow: document.documentElement.scrollWidth > innerWidth, transform: getComputedStyle(node.querySelector('.catch-drop-motion')).transform, leafTransform: getComputedStyle(leaf).transform };
      });
      assert.deepEqual(geometry.supported, [true, true], `Feet must land on the leaf at ${width}`); assert.equal(geometry.order, true); assert.equal(geometry.clipped, false); assert.equal(geometry.overflow, false); assert.equal(geometry.transform, 'matrix(1, 0, 0, 1, 0, 0)'); assert.equal(geometry.leafTransform, 'matrix(1, 0, 0, 1, 0, 0)');
    }
    await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: path.join(results, 'catching-lotus-leaf.png') });
    await page.clock.runFor(1299); assert.equal(await page.locator('#catch-panel').isVisible(), true); await countIs(page, 0);
    await closeNote(page); await page.clock.runFor(100); await countIs(page, 0); await t.close();
  });

  await check('picker shows three distinct cute expressions without ordinal labels', async () => {
    const t = await fresh(); const { page } = t;
    await page.locator('.choice-note').click();
    const choices = await page.locator('.pick-drop').evaluateAll(nodes => nodes.map(node => ({ expression: node.dataset.expression, label: node.getAttribute('aria-label'), text: node.textContent })));
    assert.equal(new Set(choices.map(x => x.expression)).size, 3); assert.ok(choices.every(x => faces.includes(x.expression) && x.text.trim() === '' && !/[一二三]/.test(x.label)));
    await page.screenshot({ path: path.join(results, 'expression-picker.png') });
    await page.locator('.pick-drop').nth(1).click(); assert.equal(await page.locator('#reader-mascot svg').getAttribute('data-expression'), choices[1].expression);
    await page.locator('#next-note').click(); assert.equal(await page.locator('#note-picker').isVisible(), true); assert.equal(await page.locator('#note-reader').isVisible(), false); await t.close();
  });

  await check('the selected face survives save, reload and bottle rereading', async () => {
    const t = await fresh({ pool: [{ id: 'only', text: '<b>表情也一起留下</b>' }] }); const { page } = t;
    await page.locator('.choice-note').click(); const chosen = await page.locator('.pick-drop').nth(2).getAttribute('data-expression'); await page.locator('.pick-drop').nth(2).click(); await page.locator('#save-note').click();
    assert.equal((await gifts(page)).items[0].expression, chosen); assert.equal(await page.locator('#note-text b').count(), 0);
    await closeNote(page); await page.reload(); await cards(page, 'gift').first().click();
    assert.equal(await page.locator('.bottled-picture svg').first().getAttribute('data-expression'), chosen); await page.locator('.bottled-drop').first().click(); assert.equal(await page.locator('#reader-mascot svg').getAttribute('data-expression'), chosen);
    assert.equal(await page.locator('#next-note').isVisible(), false); await closeNote(page); await closeDialog(page, 'bottle-dialog');
    await openRandom(page); assert.equal(await page.locator('#save-note').isDisabled(), true); assert.equal((await gifts(page)).items[0].expression, chosen); await countIs(page, 1); await t.close();
  });

  await check('one bottle preserves all six face variants rather than rendering the same face', async () => {
    const t = await fresh({ pool: fixturePool, seed: { [giftKey]: store(10) } }); const { page } = t;
    await cards(page, 'gift').first().click();
    assert.deepEqual(await page.locator('.bottled-picture svg').evaluateAll(nodes => nodes.map(node => node.dataset.expression)), records(10).map(item => item.expression));
    await page.screenshot({ path: path.join(results, 'saved-expression-bottle.png') }); await t.close();
  });

  await check('legacy favorites convert once on successful write and their backup is unchanged', async () => {
    const ids = ['rest-01', 'rest-02', 'gone'], vents = privateRecords(1), days = ['2026-10-01'];
    const t = await fresh({ seed: { [prefix + 'favorites']: ids, [prefix + 'vents']: vents, [prefix + 'drops']: days } }); const { page } = t;
    await countIs(page, 5); assert.equal(await gifts(page), null);
    await cards(page, 'gift').first().click(); const expressions = await page.locator('.bottled-picture svg').evaluateAll(nodes => nodes.map(node => node.dataset.expression));
    await closeDialog(page, 'bottle-dialog'); await page.reload(); await cards(page, 'gift').first().click(); assert.deepEqual(await page.locator('.bottled-picture svg').evaluateAll(nodes => nodes.map(node => node.dataset.expression)), expressions);
    await closeDialog(page, 'bottle-dialog'); await page.locator('#open-daily').click(); await countIs(page, 6);
    assert.equal((await gifts(page)).items.length, 4); assert.deepEqual(await page.evaluate(p => JSON.parse(localStorage.getItem(p + 'favorites')), prefix), ids);
    await closeNote(page); await page.reload(); await countIs(page, 6);
    assert.deepEqual(await page.evaluate(p => JSON.parse(localStorage.getItem(p + 'vents')), prefix), vents); assert.deepEqual(await page.evaluate(p => JSON.parse(localStorage.getItem(p + 'drops')), prefix), days); await t.close();
  });

  await check('removing converted gifts never imports them back from the old backup', async () => {
    const t = await fresh({ seed: { [prefix + 'favorites']: ['rest-01'] } }); const { page } = t;
    await cards(page, 'gift').first().click(); await page.locator('.bottled-drop').first().click(); await page.locator('#remove-note').click(); await countIs(page, 0);
    assert.deepEqual((await gifts(page)).items, []); assert.equal(await page.locator('#reader-close').evaluate(node => node === document.activeElement), true);
    await closeNote(page); await closeDialog(page, 'bottle-dialog'); await page.reload(); await countIs(page, 0);
    assert.deepEqual(await page.evaluate(p => JSON.parse(localStorage.getItem(p + 'favorites')), prefix), ['rest-01']); await t.close();
  });

  await check('daily quota failure stays readable, shows retry and retries the exact same face', async () => {
    const t = await fresh({ quota: 'gift-drops' }); const { page } = t;
    await page.locator('#open-daily').click(); await countIs(page, 0); assert.match(await text(page, '#note-status'), /没能保存/); assert.equal(await page.locator('#retry-daily').isVisible(), true);
    const portrait = await page.locator('#reader-mascot svg').getAttribute('data-expression'), snapshot = await text(page);
    await page.evaluate(() => { Storage.prototype.setItem = window.__testOriginalSet; });
    await page.locator('#retry-daily').click(); await countIs(page, 1); assert.equal((await gifts(page)).items[0].expression, portrait); assert.equal((await gifts(page)).items[0].text, snapshot);
    assert.equal(await page.locator('#retry-daily').isVisible(), false); await t.close();
  });

  for (const damaged of ['new-gifts', 'old-favorites']) {
    await check(`damaged ${damaged} is preserved and cannot be overwritten by daily collection`, async () => {
      const key = damaged === 'new-gifts' ? giftKey : prefix + 'favorites';
      const t = await fresh({ seed: { [key]: '{bad-json' } }); const { page } = t;
      await page.locator('#open-daily').click(); assert.match(await text(page, '#note-status'), /无法读取/); await countIs(page, 0);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), key), '{bad-json');
      await closeNote(page); await page.locator('.choice-vent').click(); await page.locator('#vent-text').fill('独立的心事仍能存'); await page.locator('#save-vent').check(); await page.locator('#throw-vent').click(); await countIs(page, 1); await t.close();
    });
  }

  await check('invalid expression metadata does not overwrite an existing collection', async () => {
    const broken = { version: 2, items: [{ ...records(1)[0], expression: '<svg onload=alert(1)>' }] };
    const t = await fresh({ seed: { [giftKey]: broken } }); await t.page.locator('#open-daily').click(); assert.match(await text(t.page, '#note-status'), /无法读取/); assert.deepEqual(await gifts(t.page), broken); await t.close();
  });

  await check('separate old damaged data does not block new gifts; private quota failures retain input', async () => {
    for (const seedKey of ['vents', 'drops', 'visited', 'weather']) {
      const t = await fresh({ seed: { [prefix + seedKey]: '{bad' } }); await t.page.locator('#open-daily').click(); await countIs(t.page, 1); assert.equal(await t.page.evaluate(key => localStorage.getItem(key), prefix + seedKey), '{bad'); await t.close();
    }
    const t = await fresh({ quota: 'vents' }); const { page } = t;
    await page.locator('.choice-vent').click(); await page.locator('#vent-text').fill('保存失败不能丢'); await page.locator('#save-vent').check(); await page.locator('#throw-vent').click();
    assert.equal(await page.locator('#vent-text').inputValue(), '保存失败不能丢'); assert.equal(await page.locator('#vent-result').isVisible(), false); assert.match(await text(page, '#vent-status'), /没能保存/); await countIs(page, 0); await t.close();
  });

  await check('mixed homepage has one empty normal bottle and no empty private bottle', async () => {
    const t = await fresh(); const { page } = t;
    assert.equal(await cards(page).count(), 1); assert.equal(await cards(page, 'self').count(), 0); assert.equal(await page.locator('#home-shelves .shelf-group').count(), 0);
    await page.locator('.choice-vent').click(); await page.locator('#vent-text').fill('第一颗自己的'); await page.locator('#save-vent').check(); await page.locator('#throw-vent').click();
    assert.equal(await cards(page).count(), 2); assert.equal(await cards(page, 'self').count(), 1); assert.ok(faces.includes(await page.evaluate(p => JSON.parse(localStorage.getItem(p + 'vents'))[0].expression, prefix)));
    await closeDialog(page, 'vent-dialog'); await page.locator('.hotspot-bottle').click(); await page.locator('[data-collection-group="self"]').click(); assert.equal(await page.locator('#collection-list .bottle-card').count(), 1); await t.close();
  });

  await check('all bottle count boundaries, water stages and interleaved pagination remain correct', async () => {
    for (const n of [0, 1, 3, 4, 6, 7, 9, 10, 11, 20, 21]) {
      const t = await fresh({ pool: fixturePool, seed: { [giftKey]: store(n), [prefix + 'vents']: privateRecords(n) } }); const { page } = t;
      await countIs(page, n * 2);
      assert.equal(await cards(page, 'gift').count(), Math.max(1, Math.ceil(n / 10))); assert.equal(await cards(page, 'self').count(), Math.ceil(n / 10));
      const remainder = n ? ((n - 1) % 10) + 1 : 0;
      const stage = remainder === 0 ? 0 : remainder <= 3 ? 1 : remainder <= 6 ? 2 : remainder <= 9 ? 3 : 4;
      assert.equal(await cards(page, 'gift').last().locator('.bottle-svg').getAttribute('data-fill'), String(stage));
      assert.equal(await page.locator('#hero-bottle g[clip-path] rect').getAttribute('height'), String([2, 31, 55, 76, 87][stage]));
      if (n) { await cards(page, 'self').last().click(); assert.equal(await page.locator('.bottled-drop').count(), remainder); await closeDialog(page, 'bottle-dialog'); }
      if (n === 21) { assert.deepEqual(await cards(page).evaluateAll(nodes => nodes.map(node => node.dataset.group)), ['gift', 'self', 'gift', 'self', 'gift', 'self']); await page.screenshot({ path: path.join(results, 'mixed-bottle-shelf.png'), fullPage: true }); }
      await t.close();
    }
    const t = await fresh({ pool: fixturePool, seed: { [giftKey]: store(240), [prefix + 'vents']: privateRecords(2000) } }); const { page } = t;
    assert.equal(await cards(page).count(), 6); await page.locator('#home-shelves [data-direction="1"]').click(); assert.equal(await cards(page).first().getAttribute('data-bottle'), '3');
    await cards(page).first().click(); assert.equal(await page.locator('.bottled-drop').count(), 10); assert.ok((await page.locator('body').textContent()).length < 10000); await t.close();
  });

  await check('private text remains hidden until opened; old date-only drops preserve their dates', async () => {
    const secret = '<b>不在预览里出现的心事</b>';
    const t = await fresh({ seed: { [prefix + 'vents']: [{ id: 'private', text: secret, at: '2026-10-19T00:00:00Z' }], [prefix + 'drops']: ['2026-01-01'] } }); const { page } = t;
    assert.equal((await page.locator('body').textContent()).includes(secret), false);
    await cards(page, 'self').first().click(); assert.equal((await page.locator('body').textContent()).includes(secret), false);
    await page.locator('[data-kind="legacy"]').click(); assert.match(await text(page, '#personal-text'), /没有附带文字/); assert.equal(await text(page, '#personal-date'), '2026-01-01'); await closeDialog(page, 'personal-dialog');
    await page.locator('[data-kind="vent"]').click(); assert.equal(await text(page, '#personal-text'), secret); assert.equal(await page.locator('#personal-text b').count(), 0);
    await closeDialog(page, 'personal-dialog'); await page.waitForFunction(() => document.getElementById('personal-text').textContent === ''); assert.equal((await page.locator('body').textContent()).includes(secret), false); await t.close();
  });

  await check('first-person departure recedes, turns, blurs and disappears after five seconds', async () => {
    const t = await fresh({ context: { reducedMotion: 'no-preference' } }); const { page } = t;
    await page.clock.pauseAt(new Date('2026-10-19T15:00:00+09:00'));
    await page.locator('.choice-vent').click(); await page.locator('#vent-text').fill('拜托你带走啦'); await page.locator('#throw-vent').click();
    assert.equal(await page.locator('#skip-departure').isVisible(), true); assert.equal(await page.locator('.little-luggage').count(), 1);
    await animationFrame(page, '#departure-scene', 0); await page.screenshot({ path: path.join(results, 'doorway-departure-start.png') });
    const proportions = await page.locator('#departure-scene').evaluate(node => {
      const opening = node.querySelector('.door-opening').getBBox(), leaf = node.querySelector('.door-leaf').getBBox();
      return { ratio: opening.width / opening.height, leaf: leaf.width / opening.width };
    });
    assert.ok(proportions.ratio > .51 && proportions.ratio < .54); assert.ok(proportions.leaf > .44 && proportions.leaf < .47);
    const footY = () => page.locator('#departure-scene').evaluate(node => {
      const root = node.querySelector('svg'), traveler = node.querySelector('.traveler-motion svg');
      return new DOMPoint(34, 108).matrixTransform(traveler.getScreenCTM()).matrixTransform(root.getScreenCTM().inverse()).y;
    });
    assert.ok((await footY()) > 280);
    await animationFrame(page, '#departure-scene', 1750); assert.ok((await footY()) > 240 && (await footY()) < 249);
    await page.screenshot({ path: path.join(results, 'doorway-threshold.png') });
    for (const width of [320, 390, 430, 760, 768, 900, 1280]) {
      await page.setViewportSize({ width, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const close = await page.locator('#vent-dialog .dialog-header [data-close]').boundingBox(); assert.ok(close.y >= 0 && close.y + close.height <= 844);
    }
    await page.setViewportSize({ width: 390, height: 844 }); await animationFrame(page, '#departure-scene', 2900);
    const middle = await page.locator('.traveler-motion').evaluate(node => { const s = getComputedStyle(node); return { transform: s.transform, filter: s.filter, opacity: s.opacity }; });
    assert.notEqual(middle.transform, 'none'); assert.match(middle.filter, /blur/); assert.ok(Number(middle.transform.match(/matrix\(([^)]+)\)/)[1].split(',')[0]) < .6);
    assert.ok((await footY()) > 200 && (await footY()) < 210);
    await page.screenshot({ path: path.join(results, 'doorway-departure-middle.png') });
    await animationFrame(page, '#departure-scene', 3900); assert.ok((await footY()) > 175 && (await footY()) < 190);
    await page.screenshot({ path: path.join(results, 'doorway-departure-far.png') });
    await animationFrame(page, '#departure-scene', 4900); assert.ok((await footY()) > 155);
    await page.clock.runFor(5000);
    assert.equal(await page.locator('#skip-departure').isVisible(), false); assert.equal(await page.locator('.traveler-motion').evaluate(node => getComputedStyle(node).opacity), '0');
    assert.equal(await page.evaluate(p => localStorage.getItem(p + 'vents'), prefix), null); await countIs(page, 0); await t.close();
  });

  await check('departure skips, closes and respects reduced motion or background without replay', async () => {
    const t = await fresh({ context: { reducedMotion: 'no-preference' } }); const { page } = t;
    await page.locator('.choice-vent').click(); await page.locator('#vent-text').fill('暂时放下'); await page.locator('#throw-vent').click(); await page.locator('#skip-departure').click();
    assert.equal(await page.locator('#departure-scene').evaluate(node => node.classList.contains('is-travelling')), false);
    await page.locator('#another-vent').click(); await page.locator('#vent-text').fill('出门吧'); await page.locator('#throw-vent').click(); await closeDialog(page, 'vent-dialog'); await page.clock.runFor(6000);
    await page.locator('.choice-vent').click(); assert.equal(await page.locator('#vent-form').isVisible(), true); assert.equal(await page.locator('#vent-result').isVisible(), false);
    await page.locator('#vent-text').fill('后台不重播'); await page.locator('#throw-vent').click(); await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await page.locator('#skip-departure').isVisible(), false); await t.close();
    const u = await fresh(); await u.page.locator('.choice-vent').click(); await u.page.locator('#vent-text').fill('静态远行'); await u.page.locator('#throw-vent').click(); assert.equal(await u.page.locator('#skip-departure').isVisible(), false); assert.equal(await u.page.locator('#departure-scene').evaluate(node => node.classList.contains('is-static')), true); await u.close();
  });

  await check('random rounds remain unique; daily and archive readers do not consume the bag', async () => {
    const t = await fresh({ pool: fixturePool.slice(0, 16), random: true }); const { page } = t;
    const round = [await openRandom(page)];
    for (let i = 1; i < 16; i++) {
      if (i === 4) { await page.locator('#save-note').click(); await closeNote(page); await page.locator('#open-daily').click(); await page.locator('#go-random').click(); await page.locator('.pick-drop').first().click(); round.push(await text(page)); }
      else round.push(await next(page));
    }
    assert.equal(new Set(round).size, 16);
    const second = [await next(page)]; assert.notEqual(second[0], round.at(-1)); for (let i = 1; i < 16; i++) second.push(await next(page)); assert.equal(new Set(second).size, 16); await t.close();
  });

  await check('long modal bodies scroll while every close header stays visible', async () => {
    const longText = '很长的话也要能随时关掉。'.repeat(250);
    const item = { ...records(1)[0], text: longText };
    const t = await fresh({ context: { viewport: { width: 390, height: 500 } }, seed: { [giftKey]: { version: 2, items: [item] }, [prefix + 'vents']: [{ id: 'long', text: longText, at: '2026-10-19T00:00:00Z' }] } }); const { page } = t;
    const fixed = async id => {
      const before = await page.locator(`#${id} .dialog-header`).boundingBox();
      await page.locator(`#${id} .dialog-body`).evaluate(node => { node.scrollTop = node.scrollHeight; });
      const after = await page.locator(`#${id} .dialog-header`).boundingBox(), close = await page.locator(`#${id} .dialog-header [data-close]`).boundingBox();
      assert.ok(Math.abs(before.y - after.y) < 1); assert.ok(close.y >= 0 && close.y + close.height <= 500); assert.ok(close.height >= 44);
    };
    const structures = await page.locator('dialog').evaluateAll(nodes => nodes.every(node => node.querySelector('.dialog-header [data-close]') && node.querySelector('.dialog-body'))); assert.equal(structures, true);
    await cards(page, 'gift').first().click(); await fixed('bottle-dialog'); await page.locator('.bottled-drop').click(); await fixed('note-dialog'); await page.screenshot({ path: path.join(results, 'fixed-close-long-message.png') }); await closeNote(page); await closeDialog(page, 'bottle-dialog');
    await cards(page, 'self').first().click(); await page.locator('.bottled-drop').click(); await fixed('personal-dialog'); await closeDialog(page, 'personal-dialog'); await closeDialog(page, 'bottle-dialog');
    await page.locator('[data-open="privacy-dialog"]').click(); await fixed('privacy-dialog'); await t.close();
  });

  await check('nested dialogs retain keyboard focus and private deletion repacks the mixed shelf', async () => {
    const t = await fresh({ seed: { [giftKey]: store(1), [prefix + 'vents']: privateRecords(11) } }); const { page } = t;
    await page.locator('.hotspot-bottle').click(); await page.locator('#collection-list .bottle-card').first().click(); await page.locator('.bottled-drop').first().click();
    assert.equal(await page.locator('#note-dialog .dialog-header [data-close]').evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Shift+Tab'); assert.equal(await page.locator('#remove-note').evaluate(node => node === document.activeElement), true); await page.keyboard.press('Tab'); assert.equal(await page.locator('#note-dialog .dialog-header [data-close]').evaluate(node => node === document.activeElement), true);
    await closeNote(page); await closeDialog(page, 'bottle-dialog'); await closeDialog(page, 'collection-dialog');
    await cards(page, 'self').last().click(); await page.locator('.bottled-drop').click(); await page.locator('#remove-personal').click(); await page.locator('#cancel-remove').click(); await countIs(page, 12);
    await page.locator('#remove-personal').click(); await page.locator('#confirm-remove').click(); await page.waitForFunction(() => !document.getElementById('personal-dialog').open); await countIs(page, 11); assert.equal(await cards(page, 'self').count(), 1); await t.close();
  });

  await check('cross-tab collection preserves faces, unique daily IDs and removal tombstones', async () => {
    const t = await fresh(); const { page, context } = t; const other = await context.newPage(); await other.goto(origin + '/');
    await page.locator('#open-daily').click(); await other.locator('#open-daily').click(); await countIs(other, 1); assert.equal((await gifts(page)).items.length, 1);
    await page.locator('#go-random').click(); const expression = await page.locator('.pick-drop').first().getAttribute('data-expression'); await page.locator('.pick-drop').first().click(); await page.locator('#save-note').click();
    await other.waitForFunction(() => document.getElementById('drop-count').textContent.includes('2滴'));
    assert.equal((await gifts(other)).items[1].expression, expression);
    await page.locator('#remove-note').click(); await other.waitForFunction(() => document.getElementById('drop-count').textContent.includes('1滴')); await countIs(other, 1); await t.close();
  });

  await check('slow poem loading waits for decoding, stays cancellable, and has a readable failure fallback', async () => {
    let totalBytes = 0;
    for (const file of ['quiet-nick-judy-plush-v1.webp', 'quiet-reading-foreground-v4.webp', 'sheep-outlined-v3.webp', 'spring-poem-card-transparent-v2.webp']) totalBytes += (await fs.stat(path.join(__dirname, '../assets', file))).size;
    assert.ok(totalBytes < 3500000, `Artwork transfer budget exceeded: ${totalBytes}`);
    for (const cancel of [false, true]) {
      let release; const gate = new Promise(resolve => { release = resolve; });
      const t = await fresh({ waitUntil: 'domcontentloaded', beforeGoto: page => page.route('**/spring-poem-card-transparent-v2.webp', async route => { await gate; await route.continue(); }) }); const { page } = t;
      await page.locator('.choice-quiet').click(); await page.waitForFunction(() => !document.getElementById('quiet-book').disabled);
      await page.locator('#quiet-book').click({ clickCount: 2 });
      assert.equal(await page.locator('#poem-dialog').evaluate(node => node.open), false);
      assert.equal(await page.locator('#quiet-book').evaluate(node => node.classList.contains('is-loading')), true);
      if (cancel) await closeDialog(page, 'quiet-dialog');
      release(); await page.locator('.poem-card').evaluate(node => node.decode());
      if (cancel) {
        await page.waitForTimeout(100);
        assert.equal(await page.locator('#poem-dialog').evaluate(node => node.open), false);
        await page.locator('.choice-quiet').click(); await page.locator('#quiet-book').click({ clickCount: 2 });
      }
      await page.locator('#poem-dialog[open]').waitFor();
      assert.equal(await page.locator('.poem-card').evaluate(node => node.naturalWidth), 1091);
      assert.equal(await page.locator('#quiet-book').evaluate(node => node.classList.contains('is-loading')), false);
      await t.close();
    }
    const t = await fresh({ beforeGoto: page => page.route('**/spring-poem-card-transparent-v2.webp', route => route.abort()) }); const { page } = t;
    await page.locator('.choice-quiet').click(); await page.waitForFunction(() => !document.getElementById('quiet-book').disabled);
    await page.locator('#quiet-book').click({ clickCount: 2 }); await page.locator('#poem-dialog[open]').waitFor();
    assert.equal(await page.locator('.poem-card').isVisible(), false);
    assert.equal(await page.locator('#poem-title').isVisible(), true);
    assert.deepEqual(await page.locator('#poem-lines p').allTextContents(), ['春风一夜花初放', '季雨几日木又生', '前路纵遥终有至', '且将欢意赴新程']);
    await page.screenshot({ path: path.join(results, 'poem-image-failure-fallback.png') });
    await t.close();
  });

  await check('interrupted exit animations cannot freeze dialogs and page restoration resumes only permitted motion', async () => {
    const t = await fresh({ realTime: true, context: { reducedMotion: 'no-preference' }, beforeGoto: page => page.addInitScript(() => {
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (frames, options) {
        const animation = animate.call(this, frames, options);
        if (this instanceof HTMLDialogElement && options?.duration === 140) {
          animation.pause(); Object.defineProperty(animation, 'finished', { value: new Promise(() => {}) });
        }
        return animation;
      };
    }) }); const { page } = t;
    await page.locator('.choice-quiet').click();
    await page.locator('#quiet-dialog [data-close]').click();
    await page.waitForFunction(() => !document.getElementById('quiet-dialog').open, null, { timeout: 1500 });
    assert.equal(await page.locator('#quiet-dialog.is-closing').count(), 0);
    await page.locator('.choice-quiet').click();
    const motion = () => page.locator('.tea-steam path').first().evaluate(node => node.getAnimations()[0]?.playState);
    const restore = async (expectAnimation = true) => {
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
      if (expectAnimation) assert.equal(await motion(), 'paused');
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    };
    await restore(); assert.equal(await motion(), 'running');
    const before = await page.locator('.tea-steam path').first().evaluate(node => node.getAnimations()[0].currentTime);
    await page.waitForTimeout(120);
    const after = await page.locator('.tea-steam path').first().evaluate(node => node.getAnimations()[0].currentTime);
    assert.ok(after > before + 30, 'Restored animation must actually advance');
    await page.locator('#toggle-rain').click(); await restore(); assert.equal(await motion(), 'paused');
    await page.locator('#toggle-rain').click(); assert.equal(await motion(), 'running');
    await page.locator('#quiet-book').click({ clickCount: 2 }); await page.locator('#poem-dialog[open]').waitFor();
    assert.equal(await motion(), 'paused');
    await closeDialog(page, 'poem-dialog'); assert.equal(await motion(), 'running');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await restore(false); assert.equal(await page.locator('.tea-steam path').first().evaluate(node => node.getAnimations().length), 0);
    await t.close();
  });

  await check('reading girl is prepared before opening, respects weather and motion, and is reused', async () => {
    const assetName = 'quiet-reading-foreground-v4.webp'; let requests = 0, response = null;
    const t = await fresh({ subdir: true, context: { reducedMotion: 'no-preference' }, beforeGoto: page => {
      page.on('request', request => { if (request.url().endsWith(assetName)) requests++; });
      page.on('response', result => { if (result.url().endsWith(assetName)) response = result; });
    } }); const { page } = t;
    await page.waitForFunction(() => document.getElementById('quiet-foreground').dataset.ready === 'true');
    const initialRequests = requests;
    assert.ok(initialRequests > 0); assert.equal(response.status(), 200); assert.match(response.headers()['content-type'], /image\/webp/);
    assert.equal(await page.locator('#quiet-dialog').evaluate(node => node.open), false);
    await page.locator('.choice-quiet').click();
    await page.locator('#quiet-scene.has-reading-art').waitFor(); assert.equal(requests, initialRequests);
    assert.equal(await page.locator('#quiet-foreground').evaluate(node => node.getAnimations({ subtree: true }).length), 0);
    const foreground = await page.locator('#quiet-foreground').getAttribute('href');
    const motion = () => page.locator('.tea-steam path').first().evaluate(node => getComputedStyle(node).animationPlayState);
    assert.equal(await motion(), 'running');
    for (const weather of ['rain', 'cloudy', 'sunny']) {
      await page.locator(`.weather-button[data-weather="${weather}"]`).click();
      await page.waitForFunction(weather => {
        const rain = getComputedStyle(document.querySelector('.weather-rain')).opacity;
        const sun = getComputedStyle(document.querySelector('.weather-sun')).opacity;
        return weather === 'rain' ? rain === '1' : rain === '0' && (weather !== 'sunny' || sun === '1');
      }, weather);
      assert.equal(await page.locator('#quiet-scene').getAttribute('data-weather'), weather);
      assert.match(await text(page, '#quiet-scene-description'), /小女孩.*读书/);
      assert.equal(await page.locator('#quiet-foreground').getAttribute('href'), foreground);
      if (weather !== 'rain') assert.equal(await page.locator('.weather-rain').evaluate(node => getComputedStyle(node).opacity), '0');
      await page.screenshot({ path: path.join(results, `quiet-reading-${weather}-390.png`) });
    }
    await page.locator('#toggle-rain').click(); assert.equal(await motion(), 'paused');
    await page.locator('#toggle-rain').click(); assert.equal(await motion(), 'running');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await motion(), 'paused');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await motion(), 'running');
    for (const width of [320, 390, 430, 760, 768, 900, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      const bounds = await page.locator('#quiet-scene').evaluate(node => {
        const dialog = node.closest('dialog'), body = dialog.querySelector('.dialog-body'), scene = node.getBoundingClientRect(), container = body.getBoundingClientRect();
        return { overflow: document.documentElement.scrollWidth > innerWidth || body.scrollWidth > body.clientWidth, left: scene.left >= container.left, right: scene.right <= container.right };
      });
      assert.deepEqual(bounds, { overflow: false, left: true, right: true }, `Quiet scene overflow at ${width}`);
    }
    await page.screenshot({ path: path.join(results, 'quiet-reading-desktop.png') });
    await page.setViewportSize({ width: 320, height: 500 }); await page.addStyleTag({ content: '#quiet-dialog button,#quiet-dialog p{font-size:24px!important}' });
    await page.locator('#quiet-dialog .dialog-body').evaluate(node => { node.scrollTop = node.scrollHeight; });
    const close = await page.locator('#quiet-dialog .dialog-header [data-close]').boundingBox(); assert.ok(close.y >= 0 && close.y + close.height <= 500);
    assert.equal(await page.locator('#quiet-dialog .dialog-body').evaluate(node => node.scrollWidth > node.clientWidth), false);
    await closeDialog(page, 'quiet-dialog'); assert.equal(await motion(), 'paused');
    assert.equal(await page.locator('.choice-quiet').evaluate(node => node === document.activeElement), true);
    await page.locator('.choice-quiet').click(); assert.equal(requests, initialRequests);
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.locator('#toggle-rain:disabled').waitFor({ state: 'attached' });
    assert.equal(await page.locator('.tea-steam path').first().evaluate(node => getComputedStyle(node).animationName), 'none');
    assert.equal(await page.locator('#quiet-foreground').getAttribute('href'), foreground); await t.close();
  });

  await check('book poem needs two consecutive taps with feedback, resets, and returns focus without saving', async () => {
    const t = await fresh({ subdir: true }); const { page } = t;
    await page.locator('.choice-quiet').click();
    assert.equal(await page.locator('#quiet-dialog [data-close]').evaluate(node => getComputedStyle(node).outlineStyle), 'none');
    const book = page.locator('#quiet-book'), poem = page.locator('#poem-dialog');
    await page.waitForFunction(() => !document.getElementById('quiet-book').disabled);
    await page.clock.pauseAt(new Date('2026-10-19T15:00:00+09:00'));
    const storage = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    const isOpen = () => poem.evaluate(node => node.open);
    const tap = async (n = 1) => { for (let i = 0; i < n; i++) await book.click(); };
    const hidden = value => page.evaluate(value => {
      Object.defineProperty(document, 'hidden', { configurable: true, value }); document.dispatchEvent(new Event('visibilitychange'));
    }, value);
    await tap(); assert.equal(await isOpen(), false);
    assert.equal(await book.evaluate(node => node.classList.contains('is-touched')), true);
    assert.deepEqual(await book.evaluate(node => { const style = getComputedStyle(node); return [style.outlineStyle, style.boxShadow, style.backgroundColor]; }), ['none', 'none', 'rgba(0, 0, 0, 0)']);
    assert.equal(await page.locator('.book-glints').evaluate(node => getComputedStyle(node).opacity), '0.75');
    await page.clock.runFor(1399); assert.equal(await book.evaluate(node => node.classList.contains('is-touched')), true);
    await page.clock.runFor(1); assert.equal(await book.evaluate(node => node.classList.contains('is-touched')), false);
    await page.clock.runFor(2001); await tap(); assert.equal(await isOpen(), false);
    await hidden(true); await hidden(false); await tap(); assert.equal(await isOpen(), false);
    await closeDialog(page, 'quiet-dialog'); await page.locator('.choice-quiet').click();
    await tap(); assert.equal(await isOpen(), false);
    await page.clock.runFor(2000); await tap();
    assert.equal(await isOpen(), true);
    assert.equal(await text(page, '#poem-title'), '《春声》');
    assert.equal(await page.locator('#poem-dialog [data-close]').evaluate(node => getComputedStyle(node).outlineStyle), 'none');
    assert.deepEqual(await page.locator('#poem-lines p').allTextContents(), ['春风一夜花初放', '季雨几日木又生', '前路纵遥终有至', '且将欢意赴新程']);
    assert.equal(await poem.evaluate(node => getComputedStyle(node).animationName), 'none');
    await poem.evaluate(node => node.addEventListener('close', () => { node.dataset.escapeClosed = 'true'; }, { once: true }));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.getElementById('poem-dialog').dataset.escapeClosed === 'true' && document.activeElement.id === 'quiet-book');
    await book.press('Enter'); assert.equal(await isOpen(), false);
    assert.equal(await book.evaluate(node => getComputedStyle(node).outlineStyle), 'dashed');
    await book.press('Space'); assert.equal(await isOpen(), true);
    await page.keyboard.press('Tab'); assert.equal(await page.locator('#poem-dialog [data-close]').evaluate(node => node === document.activeElement), true);
    assert.equal(await page.locator('#poem-dialog [data-close]').evaluate(node => getComputedStyle(node).outlineColor), 'rgb(139, 157, 131)');
    await page.locator('#poem-dialog [data-close]').dispatchEvent('pointerdown', { pointerType: 'touch' });
    assert.equal(await page.locator('#poem-dialog [data-close]').evaluate(node => getComputedStyle(node).outlineStyle), 'none');
    await closeDialog(page, 'poem-dialog');
    await tap(2); assert.equal(await isOpen(), true);
    await page.mouse.click(4, 4); await page.waitForFunction(() => !document.getElementById('poem-dialog').open);
    assert.equal(await book.evaluate(node => node === document.activeElement), true);
    assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage })), storage);
    await t.close();
  });

  await check('touching the book and returning from the poem never leaves a rectangular focus or glow', async () => {
    const t = await fresh({ context: { hasTouch: true, isMobile: true, reducedMotion: 'no-preference' } }); const { page } = t;
    await page.locator('.choice-quiet').tap();
    const book = page.locator('#quiet-book');
    await page.waitForFunction(() => !document.getElementById('quiet-book').disabled);
    await book.tap(); await animationFrame(page, '.book-glints', 400);
    assert.equal(await book.evaluate(node => getComputedStyle(node).outlineStyle), 'none');
    assert.equal(await book.evaluate(node => getComputedStyle(node).boxShadow), 'none');
    assert.ok(Number(await page.locator('.book-glints').evaluate(node => getComputedStyle(node).opacity)) > .8);
    assert.equal(await page.locator('.book-spark').count(), 3);
    assert.ok(await page.locator('.book-spark').evaluateAll(nodes => nodes.every(node => Number(getComputedStyle(node).opacity) > .8)));
    await page.screenshot({ path: path.join(results, 'book-touch-feedback.png') });
    await book.tap(); await page.locator('#poem-dialog[open]').waitFor();
    await page.locator('#poem-dialog [data-close]').tap();
    await page.waitForFunction(() => !document.getElementById('poem-dialog').open && document.activeElement.id === 'quiet-book');
    assert.equal(await book.evaluate(node => getComputedStyle(node).outlineStyle), 'none');
    assert.equal(await page.locator('.book-glints').evaluate(node => getComputedStyle(node).opacity), '0');
    await page.screenshot({ path: path.join(results, 'book-touch-return.png') });
    await t.close();
  });

  await check('poem image fits narrow, short and desktop views with a working overlaid close button', async () => {
    const t = await fresh({ subdir: true, context: { reducedMotion: 'no-preference' } }); const { page } = t;
    await page.locator('.choice-quiet').click();
    await page.waitForFunction(() => !document.getElementById('quiet-book').disabled);
    await page.locator('.weather-button[data-weather="sunny"]').click(); await page.locator('#toggle-rain').click();
    await page.locator('#quiet-book').click();
    await animationFrame(page, '.book-glints', 400);
    await page.screenshot({ path: path.join(results, 'spring-book-feedback.png') });
    await page.locator('#quiet-book').click();
    await page.locator('.poem-card').evaluate(node => node.decode());
    assert.equal(await page.locator('.poem-card').evaluate(node => node.naturalWidth), 1091);
    const corners = await page.locator('.poem-card').evaluate(node => {
      const canvas = document.createElement('canvas'); canvas.width = node.naturalWidth; canvas.height = node.naturalHeight;
      const ctx = canvas.getContext('2d'); ctx.drawImage(node, 0, 0);
      return [[0, 0], [canvas.width - 1, 0], [0, canvas.height - 1], [canvas.width - 1, canvas.height - 1]].map(([x, y]) => ctx.getImageData(x, y, 1, 1).data[3]);
    });
    assert.deepEqual(corners, [0, 0, 0, 0]);
    assert.equal(await page.locator('#poem-dialog').evaluate(node => getComputedStyle(node).animationName), 'poem-arrive');
    for (const [width, height] of [[320, 640], [390, 844], [1280, 900], [320, 280]]) {
      await page.setViewportSize({ width, height });
      await animationFrame(page, '#poem-dialog', 300);
      assert.equal(await page.locator('#poem-dialog .dialog-body').evaluate(node => node.scrollWidth > node.clientWidth), false);
      const close = await page.locator('#poem-dialog [data-close]').boundingBox();
      assert.ok(close.y >= 0 && close.y + close.height <= height);
      const card = await page.locator('.poem-card').boundingBox();
      assert.ok(card.x >= 0 && card.y >= 0 && card.y + card.height <= height + 1);
      assert.ok(Math.abs(card.width / card.height - 1091 / 1442) < .001);
      assert.ok(close.width >= 44 && close.height >= 44);
      assert.ok(Math.abs((close.x + close.width / 2 - card.x) / card.width - .884) < .01);
      await page.screenshot({ path: path.join(results, `spring-poem-${width}-${height}.png`) });
    }
    await closeDialog(page, 'poem-dialog');
    assert.equal(await page.locator('#quiet-scene').getAttribute('data-weather'), 'sunny');
    assert.equal(await page.locator('#toggle-rain').getAttribute('aria-pressed'), 'true');
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.locator('#quiet-book').scrollIntoViewIfNeeded();
      const bounds = await page.locator('#quiet-book').boundingBox();
      assert.ok(bounds.width >= 44 && bounds.height >= 44);
      await page.screenshot({ path: path.join(results, `spring-book-${width}.png`) });
    }
    await t.close();
  });

  await check('disabled storage, IME drafts, quiet preferences and future dates still work', async () => {
    const t = await fresh({ blocked: true }); const { page } = t;
    await page.locator('#open-daily').click(); assert.ok((await text(page)).length); await countIs(page, 0); assert.match(await text(page, '#note-status'), /无法读取/); await closeNote(page);
    await page.locator('.choice-vent').click(); await page.locator('#vent-text').fill('带走但不留'); await page.locator('#throw-vent').click(); assert.equal(await page.locator('#vent-result').isVisible(), true); await closeDialog(page, 'vent-dialog'); await page.locator('.choice-quiet').click(); await page.locator('.weather-button[data-weather="sunny"]').click(); assert.equal(await page.locator('#quiet-scene').getAttribute('data-weather'), 'sunny'); await t.close();
    const u = await fresh({ seed: { [prefix + 'weather']: JSON.stringify('sunny'), [prefix + 'rain-paused']: true }, letters: [{ id: 'future', title: '留到下一刻', text: '后来的一点幸运', unlockAt: '2026-10-19T06:00:00Z' }] });
    await u.page.locator('.choice-vent').click(); await u.page.locator('#vent-text').dispatchEvent('compositionstart'); await u.page.locator('#vent-text').fill('组合输入的心事'); await u.page.locator('#vent-text').dispatchEvent('compositionend', { data: '心事' }); await closeDialog(u.page, 'vent-dialog'); await u.page.locator('.choice-vent').click(); assert.equal(await u.page.locator('#vent-text').inputValue(), '组合输入的心事'); await closeDialog(u.page, 'vent-dialog');
    await u.page.locator('.choice-quiet').click(); assert.equal(await u.page.locator('#quiet-scene').getAttribute('data-weather'), 'sunny'); assert.equal(await u.page.locator('#quiet-scene').evaluate(node => node.classList.contains('is-still')), true); await closeDialog(u.page, 'quiet-dialog');
    await u.page.locator('#open-future').click(); assert.equal((await text(u.page, '#future-list')).includes('后来的一点幸运'), false); await closeDialog(u.page, 'future-dialog'); await u.page.clock.setFixedTime(new Date('2026-10-19T06:00:00Z')); await u.page.locator('#open-future').click(); assert.equal((await text(u.page, '#future-list')).includes('后来的一点幸运'), true); await u.close();
  });

  await check('daily IDs follow the device local date rather than UTC', async () => {
    for (const timezoneId of ['Asia/Tokyo', 'America/Los_Angeles']) {
      const t = await fresh({ context: { timezoneId } }); await t.page.clock.setFixedTime(new Date('2026-10-19T00:30:00+09:00')); await t.page.locator('#open-daily').click(); assert.equal((await gifts(t.page)).items[0].day, timezoneId === 'Asia/Tokyo' ? '2026-10-19' : '2026-10-18'); await t.close();
    }
  });

  await check('empty content pools never create phantom daily records', async () => {
    const t = await fresh({ pool: [] }); await t.page.locator('#open-daily').click(); await countIs(t.page, 0); assert.equal(await gifts(t.page), null); assert.equal(await t.page.locator('#retry-daily').isVisible(), false); await t.close();
  });

  await check('all viewport widths and large text reflow, with no extra runtime requests', async () => {
    const t = await fresh({ subdir: true }); const { page } = t;
    for (const width of [320, 390, 430, 760, 768, 900, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      const bounds = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, daily: document.getElementById('open-daily').getBoundingClientRect().bottom }));
      assert.equal(bounds.overflow, false, `Overflow ${width}`); assert.ok(bounds.daily < 700, `Daily button below fold at ${width}`);
      if ([390, 768, 1280].includes(width)) await page.screenshot({ path: path.join(results, `experience-home-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 320, height: 640 }); await page.addStyleTag({ content: 'button,p,span{font-size:28px!important} h1{font-size:52px!important}' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('#open-daily').click(); await page.locator('#note-dialog .dialog-body').evaluate(node => { node.scrollTop = node.scrollHeight; });
    const close = await page.locator('#note-dialog .dialog-header [data-close]').boundingBox(); assert.ok(close.y >= 0 && close.y + close.height <= 640); await t.close();
  });

  await check('soft primary and secondary buttons keep readable contrast', async () => {
    const t = await fresh(); const { page } = t; await openRandom(page);
    const colors = await page.locator('#save-note,#next-note,#open-daily').evaluateAll(nodes => {
      const rgb = css => css.match(/[\d.]+/g).slice(0, 3).map(Number);
      const light = c => c.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
      return nodes.map(node => { const s = getComputedStyle(node), a = light(rgb(s.color)), b = light(rgb(s.backgroundColor)); return { background: s.backgroundColor, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) }; });
    });
    for (const value of colors) { assert.ok(value.ratio >= 4.5); assert.notEqual(value.background, 'rgb(79, 102, 83)'); }
    await page.screenshot({ path: path.join(results, 'expression-reader.png') }); await t.close();
  });
  console.log(`\n${passed} browser checks passed. Screenshots: ${results}`);
})().catch(async error => { console.error(error); process.exitCode = 1; try { const page = browser?.contexts().at(-1)?.pages().at(-1); if (page) await page.screenshot({ path: path.join(results, 'failure.png') }); } catch {} }).finally(async () => {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
});
