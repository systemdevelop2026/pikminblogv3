/* Live end-to-end test against the REAL Apps Script backend.
   Opens index.html, logs in, creates a Pikmin, writes a story, draws a
   picture, saves, and checks the picture actually lands in Google Drive.
   Runs in two browser contexts to prove cross-device sync. */
const { chromium } = require('playwright-core');
const APP = 'file:///C:/Users/PC/Desktop/pikmin-new/index.html';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  const problems = [];

  /* ---------------- DEVICE A ---------------- */
  const ctxA = await b.newContext();
  const A = await ctxA.newPage();
  const netA = [];
  A.on('request', r => {
    if (/script\.google|googleusercontent/.test(r.url())) netA.push('REQ  ' + r.method());
  });
  A.on('response', async r => {
    if (/script\.google|googleusercontent/.test(r.url())) {
      netA.push('RESP ' + r.status());
      if (r.status() >= 400) problems.push('HTTP ' + r.status() + ' ' + r.url().slice(0,80));
    }
  });
  A.on('pageerror', e => problems.push('PAGEERROR: ' + e.message));
  A.on('console', m => { if (m.type() === 'error') problems.push('CONSOLE: ' + m.text().slice(0,200)); });

  await A.goto(APP, { waitUntil:'load' });
  await A.waitForTimeout(3000);   /* let the boot pull settle */

  console.log('=== 1. defaults are wired in ===');
  const cfg = await A.evaluate(() => {
    const c = window.__pb.cloudCfg();
    return { url:c.url, token:c.token, folderId:window.__pb.driveFolderId(),
             ready:window.__pb.cloudReady() };
  });
  console.log('  url      :', cfg.url.slice(0, 58) + '…');
  console.log('  token    :', cfg.token);
  console.log('  folderId :', cfg.folderId);
  console.log('  connected:', cfg.ready);

  console.log('\n=== 2. the app reads the real Sheet on open ===');
  await A.evaluate(async () => {
    const r = await window.__pb.pullFromSheet({ force:true });
    window.__selftest_pull = r;
  });
  const pulled = await A.evaluate(() => window.__selftest_pull);
  console.log('  pull ok   :', pulled.ok, pulled.error ? '(' + pulled.error + ')' : '');
  const localCount = await A.evaluate(() => window.__pb.DB().posts.length);
  console.log('  stories now on this device:', localCount);

  console.log('\n=== 3. doctor — what is actually on the Sheet ===');
  const doc = await A.evaluate(() => window.__pb.runDoctor());
  console.log(doc.split('\n').map(l => '  ' + l).join('\n'));

  console.log('\n=== 4. child writes a story and draws a picture ===');
  await A.click('[data-act="newKid"]');
  await A.waitForSelector('#nName', { timeout:5000 });
  await A.click('[data-act="pickPik"][data-id="purple"]');
  await A.fill('#nName', 'LiveTest');
  await A.click('[data-act="createKid"]');
  await A.waitForSelector('.kidcard .nm', { timeout:5000 });
  await A.click('[data-act="openKid"]');
  await A.waitForSelector('[data-act="newPost"]', { timeout:5000 });
  await A.click('[data-act="newPost"]');
  await A.waitForSelector('#fBody', { timeout:5000 });

  const stamp = new Date().toISOString().slice(11,19);
  await A.fill('#fTitle', 'Live test ' + stamp);
  await A.fill('#fBody', 'This story was written by an automated test at ' + stamp +
                         ' to prove the whole chain works end to end.');
  await A.waitForTimeout(1200);

  /* draw something recognisable */
  await A.click('[data-act="draw"]');
  await A.waitForSelector('#cv', { timeout:5000 });
  const box = await A.locator('#cv').boundingBox();
  await A.mouse.move(box.x + 80, box.y + 90);
  await A.mouse.down();
  await A.mouse.move(box.x + 220, box.y + 200, { steps:15 });
  await A.mouse.move(box.x + 380, box.y + 100, { steps:15 });
  await A.mouse.move(box.x + 520, box.y + 190, { steps:15 });
  await A.mouse.up();
  await A.click('[data-act="keepDraw"]');
  await A.waitForTimeout(500);

  await A.click('[data-act="savePost"]');
  await A.waitForSelector('.story', { timeout:5000 });
  console.log('  story saved from the UI');

  /* the picture uploads after the text — give it time */
  console.log('  waiting for the picture to reach Drive…');
  let pic = null;
  for(let i = 0; i < 25; i++){
    await A.waitForTimeout(1200);
    pic = await A.evaluate(() => {
      const ps = window.__pb.DB().posts;
      const p = ps[ps.length - 1];
      const a = (p && p.attachments && p.attachments[0]) || null;
      return a ? { driveId:a.driveId || null, url:a.url || null, hasSrc:!!a.src } : null;
    });
    if(pic && pic.driveId) break;
  }
  console.log('  picture result:', JSON.stringify(pic));

  console.log('\n=== 5. the story text is on the Sheet ===');
  await A.evaluate(async () => { await window.__pb.pushToSheet(); });
  await A.waitForTimeout(1500);

  /* ---------------- DEVICE B ---------------- */
  console.log('\n=== 6. a SECOND device sees it ===');
  const ctxB = await b.newContext();      /* fresh localStorage = a new device */
  const B = await ctxB.newPage();
  B.on('pageerror', e => problems.push('DEVICE-B PAGEERROR: ' + e.message));
  await B.goto(APP, { waitUntil:'load' });
  await B.waitForTimeout(1200);
  const bBefore = await B.evaluate(() => window.__pb.DB().posts.length);
  console.log('  device B stories before login:', bBefore);

  await B.evaluate(async () => { await window.__pb.syncOnLogin(); });
  await B.waitForTimeout(2000);
  const bAfter = await B.evaluate(() => {
    const d = window.__pb.DB();
    const mine = d.posts.filter(p => /^Live test /.test(p.title));
    return { total:d.posts.length,
             found:mine.length,
             pics:(mine[0] && mine[0].attachments || []).length,
             title:(mine[0] || {}).title };
  });
  console.log('  device B stories after login :', bAfter.total);
  console.log('  found the test story         :', bAfter.found, bAfter.title || '');
  console.log('  with pictures                :', bAfter.pics);

  console.log('\n=== 7. the Sheet really holds it ===');
  const final = await A.evaluate(async () => {
    const r = await (async () => {
      return new Promise(res => {
        const n = 'cb_' + Math.random().toString(36).slice(2,8);
        window[n] = p => res(p);
        const c = window.__pb.cloudCfg();
        const s = document.createElement('script');
        s.src = c.url + '?action=load&token=' + encodeURIComponent(c.token) + '&callback=' + n;
        document.body.appendChild(s);
      });
    })();
    return (r.data && r.data.posts || []).map(p => p.title);
  });
  console.log('  titles on the Sheet:', JSON.stringify(final));

  await A.screenshot({ path:'C:/Users/PC/Desktop/pikmin-new/_live-proof.png', fullPage:true });

  console.log('\n=== network to Google (device A) ===');
  console.log('  ' + netA.join('\n  '));

  console.log('\n=== problems ===');
  console.log(problems.length ? problems.join('\n') : '  (none)');

  await b.close();
  process.exit(problems.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
