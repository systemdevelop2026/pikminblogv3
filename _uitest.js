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
  await p.reload({ waitUntil:'load' });
  await p.waitForTimeout(900);
  const afterReload = await p.evaluate(() => {
    const d = window.__pb.DB();
    return { kids:d.kids.length, posts:d.posts.length,
             title:(d.posts[0]||{}).title, pics:((d.posts[0]||{}).attachments||[]).length };
  });
  console.log('       after reload -> kids:' + afterReload.kids + ' posts:' + afterReload.posts +
              ' title:"' + afterReload.title + '" pics:' + afterReload.pics);

  console.log('--- grown-up flow ---');

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

  await step('right PIN lets a grown-up in', async () => {
    await p.fill('#gIn', '123456');
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
