/* Drive the v3 app through the real UI, as a child then a grown-up. */
const { chromium } = require('playwright-core');
const APP = 'file:///C:/Users/PC/Desktop/pikmin-new/index.html';

(async () => {
  const b = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0,160)); });

  await p.goto(APP, { waitUntil:'load' });
  await p.waitForTimeout(600);

  const step = async (label, fn) => {
    try { await fn(); console.log('  ok   ' + label); }
    catch(e){ console.log('  FAIL ' + label + ' -> ' + e.message); errs.push('STEP: ' + label); }
  };

  console.log('--- the login wall ---');

  await step('a fresh device lands on the sign-in wall', async () => {
    await p.waitForSelector('#loginIn', { timeout:3000 });
    const has = await p.locator('.kidcard').count();
    if (has !== 0) throw new Error('the main page rendered behind the wall');
  });

  await step('a wrong password is refused', async () => {
    await p.fill('#loginIn', 'not-the-password');
    await p.click('[data-act="loginTry"]');
    await p.waitForTimeout(200);
    if (await p.locator('#loginIn').count() === 0) throw new Error('the wall let a wrong password through');
    const msg = await p.textContent('#app');
    if (!/not the family password/i.test(msg)) throw new Error('no error message was shown');
  });

  await step('the right password signs in', async () => {
    await p.fill('#loginIn', 'ngkimhooi');
    await p.click('[data-act="loginTry"]');
    await p.waitForSelector('[data-act="newKid"]', { timeout:3000 });
    /* Wait for the initial sync to finish before interacting. The sync pulls
       from the Sheet and replaces DB — if we interact before it finishes, our
       changes get overwritten. */
    await p.waitForTimeout(1500);
  });

  await step('signing out puts the wall back up', async () => {
    await p.click('[data-act="lockApp"]');
    await p.waitForSelector('#loginIn', { timeout:3000 });
  });

  await step('sign back in to carry on', async () => {
    await p.fill('#loginIn', 'ngkaixuen');   /* a different accepted password */
    await p.click('[data-act="loginTry"]');
    await p.waitForSelector('[data-act="newKid"]', { timeout:3000 });
    await p.waitForTimeout(1500);
  });

  console.log('--- child flow ---');

  await step('open "New Pikmin"', async () => {
    await p.click('[data-act="newKid"]');
    await p.waitForSelector('#nName', { timeout:3000 });
  });

  await step('pick the blue Pikmin', async () => {
    await p.click('[data-act="pickPik"][data-id="blue"]');
  });

  await step('type a name and create', async () => {
    await p.fill('#nName', 'Kaixuen');
    await p.click('[data-act="createKid"]');
    await p.waitForSelector('.kidcard .nm', { timeout:3000 });
  });

  const kidShown = await p.textContent('.kidcard .nm');
  console.log('       kid card reads: "' + kidShown.trim() + '"');

  await step('open the kid', async () => {
    await p.click('[data-act="openKid"]');
    await p.waitForSelector('[data-act="newPost"]', { timeout:3000 });
  });

  await step('start a story', async () => {
    await p.click('[data-act="newPost"]');
    await p.waitForSelector('#fBody', { timeout:3000 });
  });

  await step('write the story', async () => {
    await p.fill('#fTitle', 'My First Garden');
    await p.fill('#fBody', 'Today I planted a tiny seed in the soil.\n\nI will water it every morning.');
    await p.waitForTimeout(1100);   /* let the autosave fire */
  });

  const wordsShown = await p.textContent('#saveHint');
  console.log('       autosave hint: "' + wordsShown.trim() + '"');

  await step('open the drawing pad', async () => {
    await p.click('[data-act="draw"]');
    await p.waitForSelector('#cv', { timeout:3000 });
  });

  await step('actually draw a stroke', async () => {
    const box = await p.locator('#cv').boundingBox();
    await p.mouse.move(box.x + 60, box.y + 60);
    await p.mouse.down();
    await p.mouse.move(box.x + 180, box.y + 130, { steps: 12 });
    await p.mouse.move(box.x + 300, box.y + 80,  { steps: 12 });
    await p.mouse.up();
  });

  /* A background sync can repaint at any moment. Force the exact state changes
     that used to wipe the pad, and prove the pad is still usable afterwards.
     This is the assertion that failed before the carry code went in. */
  await step('the drawing pad survives a repaint', async () => {
    const hadBtn = await p.locator('[data-act="keepDraw"]').count();
    if (hadBtn === 0) throw new Error('the drawing pad vanished before any repaint');
    await p.evaluate(() => {
      window.__pb.setCloudState('reading', 'Reading the Sheet…');
      window.__pb.setCloudState('ok', 'Up to date — 1 story.');
    });
    await p.waitForTimeout(350);
    const stillThere = await p.locator('[data-act="keepDraw"]').count();
    if (stillThere === 0) throw new Error('the repaint destroyed the open drawing pad');
  });

  await step('keep the drawing', async () => {
    await p.click('[data-act="keepDraw"]');
    await p.waitForTimeout(400);
  });

  const picCount = await p.locator('.pics .pic').count();
  console.log('       pictures attached: ' + picCount);

  await step('save the story', async () => {
    await p.click('[data-act="savePost"]');
    await p.waitForSelector('.story', { timeout:3000 });
  });

  const storyText = await p.textContent('.story .ttl');
  const badge     = await p.textContent('.story .badge');
  console.log('       story listed as: "' + storyText.trim() + '" badge: "' + badge.trim() + '"');

  console.log('--- persistence across reload ---');
  /* With no localStorage, a reload starts from scratch. The sign-in wall
     appears again, and data must be re-fetched from the Sheet. */
  await p.reload({ waitUntil:'load' });
  await p.waitForTimeout(600);
  await step('after reload, the sign-in wall is back', async () => {
    await p.waitForSelector('#loginIn', { timeout:3000 });
  });
  await p.fill('#loginIn', 'ngkimhooi');
  await p.click('[data-act="loginTry"]');
  await p.waitForSelector('[data-act="newKid"]', { timeout:3000 });
  await p.waitForTimeout(1500);
  const afterReload = await p.evaluate(() => {
    const d = window.__pb.DB();
    return { kids:d.kids.length, posts:d.posts.length,
             title:(d.posts[0]||{}).title, pics:((d.posts[0]||{}).attachments||[]).length };
  });
  console.log('       after reload -> kids:' + afterReload.kids + ' posts:' + afterReload.posts +
              ' title:"' + afterReload.title + '" pics:' + afterReload.pics);

  console.log('--- grown-up flow ---');

  /* With no localStorage, the PIN is always the hardcoded default. There is
     no saved state to migrate — the device is a thin client. */

  await step('open the grown-ups tab', async () => {
    await p.click('[data-act="openLog"]');
    await p.waitForSelector('#gIn', { timeout:3000 });
  });

  await step('wrong PIN is refused', async () => {
    await p.fill('#gIn', '000000');
    await p.click('[data-act="gateOk"]');
    await p.waitForTimeout(300);
    const err = await p.textContent('.gate .box');
    if(err.indexOf('not right') < 0) throw new Error('a wrong PIN was not rejected');
  });

  /* The PIN this app used to ship with must not open the gate. A device that ran
     the app back then still had it saved, and the saved value used to win — so
     changing DEFAULT_PIN silently did nothing. */
  await step('the retired PIN 123456 no longer works', async () => {
    await p.fill('#gIn', '123456');
    await p.click('[data-act="gateOk"]');
    await p.waitForTimeout(300);
    const stillAsking = await p.locator('#gIn').count();
    if(!stillAsking) throw new Error('the retired PIN 123456 still opened the grown-ups screen');
  });

  await step('right PIN lets a grown-up in', async () => {
    await p.fill('#gIn', '489487');
    await p.click('[data-act="gateOk"]');
    await p.waitForSelector('#cUrl', { timeout:3000 });
  });

  const hasQueue = await p.locator('text=Waiting for approval').count();
  console.log('       approval queue present: ' + (hasQueue > 0));

  await p.screenshot({ path:'C:/Users/PC/Desktop/pikmin-new/_shot-2.png', fullPage:true });

  console.log('--- errors ---');
  console.log(errs.length ? errs.join('\n') : '(none)');
  await b.close();
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
