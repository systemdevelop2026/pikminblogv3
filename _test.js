/* ============================================================================
   PIKMIN BLOG v3 — test suite
   Run:  node _test.js
   No dependencies outside Node. Loads index.html's script into a small sandbox
   with a stubbed DOM, then exercises the real logic.

   Principles learned the hard way:
     - drive the app's OWN handlers, never a copy of the logic
     - real timers, so jsonp timeouts can actually fire
     - JSONP is not fetch: intercept appendChild and call the callback
     - a test block that mutates shared state must hand it back
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const code = HTML.match(/<script>([\s\S]*)<\/script>/)[1];

let pass = 0, fail = 0;
const failures = [];
function ok(cond, label){
  if(cond){ pass++; }
  else { fail++; failures.push(label); console.log('  FAIL  ' + label); }
}
function eq(a, b, label){
  const same = JSON.stringify(a) === JSON.stringify(b);
  if(!same) console.log('        got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b));
  ok(same, label);
}

/* ---------- a tiny DOM good enough for this app ---------- */
function makeEl(id){
  const el = {
    id: id || '',
    _html: '',
    value: '', checked: false, textContent: '',
    className: '', dataset: {}, files: [],
    style: {}, selectionStart: 0, selectionEnd: 0,
    children: [], parentNode: null, _listeners: {},
    get innerHTML(){ return this._html; },
    set innerHTML(v){ this._html = String(v); },
    appendChild(c){ this.children.push(c); c.parentNode = this; return c; },
    removeChild(c){ this.children = this.children.filter(x => x !== c); if(c) c.parentNode = null; return c; },
    insertAdjacentHTML(pos, h){ this._html += h; },
    addEventListener(t, fn){ (this._listeners[t] = this._listeners[t] || []).push(fn); },
    removeEventListener(){},
    focus(){}, click(){}, blur(){},
    getContext(){ return CTX; },
    toDataURL(){ return 'data:image/png;base64,AAAA'; },
    getBoundingClientRect(){ return { left:0, top:0, width:700, height:440 }; },
    querySelector(){ return null; },
    closest(){ return null; },
    getAttribute(){ return null; },
    classList:{
      _s:new Set(),
      add(c){ this._s.add(c); }, remove(c){ this._s.delete(c); },
      contains(c){ return this._s.has(c); }, toggle(c){ this._s.has(c)?this._s.delete(c):this._s.add(c); }
    }
  };
  return el;
}
const CTX = {
  fillStyle:'', strokeStyle:'', lineWidth:1, lineCap:'', lineJoin:'',
  fillRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){}, drawImage(){}
};

const nodes = {};
function nodeFor(sel){
  if(!nodes[sel]) nodes[sel] = makeEl(sel.replace(/[^a-z0-9]/gi,''));
  return nodes[sel];
}

/* The app writes <script> tags for JSONP; capture them and answer. */
let jsonpReply   = undefined;
let jsonpTokens  = null;      /* optional map: token -> payload */
let appended     = [];
const bodyEl = makeEl('body');
bodyEl.appendChild = function(script){
  appended.push(script);
  const m = String(script.src || '').match(/[?&]callback=([^&]+)/);
  if(m){
    const name = m[1];
    const tok  = (String(script.src).match(/[?&]token=([^&]*)/) || [])[1];
    let payload = jsonpReply;
    if(jsonpTokens){
      if(Object.prototype.hasOwnProperty.call(jsonpTokens, tok)) payload = jsonpTokens[tok];
      else payload = { ok:false, error:'bad token' };
    }
    setTimeout(() => {
      if(typeof sandbox[name] === 'function') sandbox[name](payload);
    }, 0);
  }
  return script;
};

const store = {};
const localStorage = {
  getItem:k => (k in store ? store[k] : null),
  setItem:(k,v) => { store[k] = String(v); },
  removeItem:k => { delete store[k]; },
  clear:() => { Object.keys(store).forEach(k => delete store[k]); }
};

const sandbox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  Date, Math, JSON, Object, Array, String, Number, Boolean, Error, RegExp,
  Promise, URLSearchParams, AbortController,
  localStorage,
  location: { href:'file:///test/index.html', origin:'file://' },
  confirm: () => true,
  alert: () => {},
  FileReader: function(){ this.readAsDataURL = () => {}; },
  Image: function(){ this.width=100; this.height=100;
    Object.defineProperty(this,'src',{ set(){ if(this.onload) setTimeout(()=>this.onload(),0); } }); },
  fetch: async (url, opts) => {
    const body = JSON.parse((opts && opts.body) || '{}');
    let payload;
    if(jsonpTokens){
      payload = Object.prototype.hasOwnProperty.call(jsonpTokens, body.token)
        ? jsonpTokens[body.token] : { ok:false, error:'bad token' };
    } else {
      payload = (typeof fetchReply !== 'undefined' && fetchReply)
        ? fetchReply : { ok:true };
    }
    return { status:200, text: async () => JSON.stringify(payload) };
  },
  document: {
    body: bodyEl,
    documentElement: makeEl('html'),
    createElement: tag => makeEl(tag),
    querySelector: sel => (sel === '#app' || sel === '#gate' || sel === '#toast' || sel === 'body')
      ? nodeFor(sel) : nodeFor(sel),
    querySelectorAll: () => [],
    addEventListener: (t, fn) => { (docListeners[t] = docListeners[t] || []).push(fn); },
    hidden: false,
    activeElement: null
  },
  window: null
};
let fetchReply = null;
const docListeners = {};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.window.addEventListener = () => {};
sandbox.window.scrollTo = () => {};
sandbox.scrollTo = () => {};

vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename:'index.html' });

const T = sandbox.__pb;
if(!T) { console.log('FATAL: app did not expose __pb'); process.exit(1); }

/* The app pulls on boot when a Sheet is configured. With the shipped default
   (blank URL) it does not, but settle anyway so nothing races. */
async function settle(){
  try{ await T.pullFromSheet({ force:false }); }catch(e){}
}

function blank(){
  return { kids:[], posts:[], deleted:[] };
}
function kid(id, name, pik, at){
  return { id, name, pikmin: pik || 'red', createdAt: at || 1000 };
}
function post(id, kidId, title, body, updatedAt, extra){
  return Object.assign({
    id, kidId, title, body, attachments:[],
    status:'draft', createdAt:1000, updatedAt: updatedAt || 1000, approvedAt:null
  }, extra || {});
}

/* ---------- the suite, one ordered async run ---------- */
(async function runSuite(){

/* ===== 1. basics ======================================================== */
console.log('\n[1] basics');
eq(T.BUILD, 'v3.0.0', 'build string is v3.0.0');
eq(T.wordCount('one two  three\nfour'), 4, 'word counting ignores extra whitespace');
eq(T.wordCount(''), 0, 'empty text is zero words');
ok(T.hashPw('abc') !== T.hashPw('abd'), 'different passwords hash differently');
eq(T.hashPw('abc'), T.hashPw('abc'), 'the same password hashes the same');
ok(T.pwOk('letmewrite'), 'default family password accepted');
ok(T.pwOk('  LETMEWRITE  '), 'password is trimmed and case-folded');
ok(!T.pwOk('wrong'), 'a wrong password is refused');
ok(!T.pwOk(''), 'an empty password is refused');
eq(T.PIKMIN.length, 6, 'six Pikmin colours');
ok(T.PIKMIN.every(p => p.id && p.body && p.leaf), 'every Pikmin has id/body/leaf');

/* ===== 2. settings normalisation ======================================== */
console.log('\n[2] settings normalisation');
const n1 = T.normalizeSettings(null);
ok(n1.cloud && typeof n1.cloud === 'object', 'a null settings blob still yields a cloud object');
eq(n1.cloud.autoPush, true, 'backup defaults to on');
eq(n1.cloud.pullOnOpen, true, 'check-on-open defaults to on');
eq(n1.requireApproval, true, 'approval defaults to on');
eq(n1.wordLimit, 400, 'word limit defaults to 400');
ok(typeof n1.pin === 'string' && n1.pin.length >= 4, 'a PIN is always present');
const n2 = T.normalizeSettings({ requireApproval:false, wordLimit:0, cloud:{ url:'https://script.google.com/x' } });
eq(n2.requireApproval, false, 'a grown-up turning approval off sticks');
eq(n2.wordLimit, 400, 'a zero word limit falls back to the default');
eq(n2.cloud.url, 'https://script.google.com/x', 'a chosen URL is kept');
eq(n2.cloud.token, T.normalizeSettings(null).cloud.token, 'a missing token is backfilled');
const n3 = T.normalizeSettings({ cloud:{ token:'' } });
eq(n3.cloud.token, '', 'a deliberately emptied token stays empty (never re-filled)');

/* ===== 3. merge: the version clock ====================================== */
console.log('\n[3] merge logic');
const M = T.mergeSnapshot;

let r = M({ kids:[kid('k1','A')], posts:[post('p1','k1','Mine','v1', 5000)], deleted:[] },
          { kids:[], posts:[post('p1','k1','Theirs','v2', 9000)], deleted:[] });
eq(r.db.posts[0].title, 'Theirs', 'the newer copy wins');
eq(r.changed, true, 'a newer remote copy reports a change');

r = M({ kids:[], posts:[post('p1','k1','Mine','v1', 9000)], deleted:[] },
      { kids:[], posts:[post('p1','k1','Theirs','v2', 5000)], deleted:[] });
eq(r.db.posts[0].title, 'Mine', 'an older remote copy does not overwrite');

r = M({ kids:[], posts:[post('p1','k1','Mine','v1', 5000)], deleted:[] },
      { kids:[], posts:[post('p1','k1','Theirs','v2', 5000)], deleted:[] });
eq(r.db.posts[0].title, 'Mine', 'on a tie the local copy wins (it has the pictures)');

r = M({ kids:[], posts:[post('p1','k1','Doomed','x',1000)], deleted:['p1'] },
      { kids:[], posts:[post('p1','k1','Doomed','x',99999)], deleted:[] });
eq(r.db.posts.length, 0, 'a story deleted here is not resurrected by a newer remote copy');

r = M({ kids:[], posts:[], deleted:[] },
      { kids:[], posts:[post('p9','k1','Theirs','x',1000)], deleted:['p9'] });
eq(r.db.posts.length, 0, 'a story deleted remotely is dropped');

r = M({ kids:[], deleted:[],
        posts:[post('p1','k1','T','local', 5000, { approvedAt:null, attachments:[{id:'a1',src:'x'}] })] },
      { kids:[], deleted:[],
        posts:[post('p1','k1','T','remote', 9000, { approvedAt:12345, attachments:[] })] });
eq(r.db.posts[0].approvedAt, 12345, 'an approval from elsewhere is kept');
eq(r.db.posts[0].attachments.length, 1, 'a picture held locally is not lost to a newer text copy');

r = M({ kids:[kid('k1','Old',null, 5000)], posts:[], deleted:[] },
      { kids:[kid('k1','New',null, 9000)], posts:[], deleted:[] });
eq(r.db.kids.length, 1, 'kids are merged by id, not duplicated');
eq(r.db.kids[0].name, 'Old', 'the older creation record is the one kept');

r = M({ kids:[], posts:[post('p1','k1','T','same',5000)], deleted:[] },
      { kids:[], posts:[post('p1','k1','T','same',5000)], deleted:[] });
eq(r.changed, false, 'identical snapshots report no change');

/* ===== 4. cloud readiness ============================================== */
console.log('\n[4] cloud readiness');
T.setSET(T.normalizeSettings(null));
ok(!T.cloudReady(), 'the shipped build is NOT connected out of the box (no URL)');
T.setSET(T.normalizeSettings({ cloud:{ url:'https://script.google.com/macros/s/ABC/exec', token:'t' } }));
ok(T.cloudReady(), 'a proper script.google.com URL makes it ready');
T.setSET(T.normalizeSettings({ cloud:{ url:'https://evil.example.com/x', token:'t' } }));
ok(!T.cloudReady(), 'a non-Google URL is refused');
T.setSET(T.normalizeSettings({ cloud:{ url:'https://script.google.com/x', token:'' } }));
ok(!T.cloudReady(), 'no token means not ready');
eq(T.driveFolderId(), '', 'no folder configured means no folder id');
T.setSET(T.normalizeSettings({ cloud:{ folderUrl:'https://drive.google.com/drive/folders/ABC123_-x' } }));
eq(T.driveFolderId(), 'ABC123_-x', 'a folder id is extracted from a Drive link');
T.setSET(T.normalizeSettings({ cloud:{ folderUrl:'', folderId:'DIRECTID99' } }));
eq(T.driveFolderId(), 'DIRECTID99', 'a bare folder id is accepted');

/* ===== 5. pull / push / doctor against a stub ========================== */
console.log('\n[5] sync against a stub backend');

const URL_OK = 'https://script.google.com/macros/s/STUB/exec';
function freshCloud(extra){
  return T.normalizeSettings(Object.assign({
    cloud:{ url:URL_OK, token:'tok', folderId:'F1' }
  }, extra || {}));
}

/* -- a pull brings remote stories in ------------------------------------ */
T.setSET(freshCloud());
T.setDB(blank());
T.setPulledOnce(false);
jsonpReply = { ok:true, data:{ kids:[kid('k1','Kaixuen')],
                               posts:[post('p1','k1','From the Sheet','hello', 7000)],
                               deleted:[] } };
let pr = await T.pullFromSheet({ force:true });
ok(pr.ok, 'pull reports success');
eq(T.DB().posts.length, 1, 'the remote story arrived');
eq(T.DB().posts[0].title, 'From the Sheet', 'and it is the right one');
jsonpReply = undefined;

/* -- a pull merges rather than replaces --------------------------------- */
T.setDB({ kids:[kid('k1','Kaixuen')],
          posts:[post('local1','k1','Only here','x', 8000)], deleted:[] });
T.setPulledOnce(false);
jsonpReply = { ok:true, data:{ kids:[], posts:[post('remote1','k1','Only there','y', 8000)], deleted:[] } };
await T.pullFromSheet({ force:true });
const ids = T.DB().posts.map(p => p.id).sort();
eq(ids, ['local1','remote1'], 'a pull unions both sides, losing neither');
jsonpReply = undefined;

/* -- check-on-open off still lets an explicit pull through -------------- */
T.setSET(freshCloud({ cloud:{ url:URL_OK, token:'tok', folderId:'F1', pullOnOpen:false } }));
T.setDB(blank()); T.setPulledOnce(false);
jsonpReply = { ok:true, data:{ kids:[], posts:[post('pX','k1','T','b',9000)], deleted:[] } };
pr = await T.pullFromSheet({ force:true });
ok(pr.ok, 'a forced pull ignores the check-on-open setting');
eq(T.DB().posts.length, 1, 'and the story still arrives');
jsonpReply = undefined;

/* -- an unforced pull respects check-on-open ---------------------------- */
T.setPulledOnce(false);
const before = appended.length;
pr = await T.pullFromSheet({ force:false });
eq(pr.skipped, 'check-on-open is off', 'an unforced pull honours a grown-up turning it off');
eq(appended.length, before, 'and it did not even call the network');

/* -- a bad token surfaces, not swallowed -------------------------------- */
T.setSET(freshCloud());
T.setPulledOnce(false);
jsonpTokens = {};
jsonpTokens['tok'] = { ok:true, data:blank() };
jsonpTokens['WRONG'] = { ok:false, error:'bad token' };
T.setSET(T.normalizeSettings({ cloud:{ url:URL_OK, token:'WRONG', folderId:'F1' } }));
pr = await T.pullFromSheet({ force:true });
ok(!pr.ok, 'a refused token is reported as a failure');
ok(String(pr.error).length > 0, 'and it carries a reason');
jsonpTokens = null;

/* -- push sends the stories and stamps a time --------------------------- */
T.setSET(freshCloud());
T.setDB({ kids:[kid('k1','K')], posts:[post('p1','k1','T','b',1000)], deleted:[] });
fetchReply = { ok:true, posts:1 };
const wr = await T.pushToSheet();
ok(wr.ok, 'push reports success');
ok(T.SET().cloud.lastSync > 0, 'a successful push records the time');
eq(T.SET().cloud.lastError, null, 'and clears any earlier error');

/* -- a push failure is recorded, not hidden ----------------------------- */
fetchReply = { ok:false, error:'nope' };
await T.pushToSheet();
eq(T.SET().cloud.lastError, 'nope', 'a failed push records the reason');
fetchReply = { ok:true };

/* -- unbidden backup respects the switch -------------------------------- */
T.setSET(freshCloud({ cloud:{ url:URL_OK, token:'tok', folderId:'F1', autoPush:false } }));
T.cancelPush();
T.setSuppressed(false);
T.pushToSheet;                        /* touch, so a rename would be caught */
sandbox.__pb.ACTIONS.saveCloud;       /* ditto */
ok(!T.hasPendingPush(), 'with backup off, a save schedules no push');
T.setSET(freshCloud({ cloud:{ url:URL_OK, token:'tok', folderId:'F1', autoPush:true } }));
T.setSuppressed(false);

/* -- login sync ignores both switches (the user is asking) -------------- */
T.setSET(freshCloud({ cloud:{ url:URL_OK, token:'tok', folderId:'F1',
                               autoPush:false, pullOnOpen:false } }));
T.setDB(blank()); T.setPulledOnce(false);
jsonpReply = { ok:true, data:{ kids:[], posts:[post('pL','k1','Arrived','b',9000)], deleted:[] } };
fetchReply = { ok:true };
const lr = await T.syncOnLogin();
ok(lr.read && lr.read.ok, 'login sync reads even with check-on-open off');
ok(lr.write && lr.write.ok, 'login sync writes even with backup off');
eq(T.DB().posts.length, 1, 'and the story is on this device afterwards');
jsonpReply = undefined;

/* -- login sync with no Sheet does nothing, quietly --------------------- */
T.setSET(T.normalizeSettings(null));
T.setPulledOnce(false);
const lr2 = await T.syncOnLogin();
ok(lr2.skipped, 'with no Sheet, login sync is a deliberate no-op');
ok(!T.isSuppressing(), 'and it does not leave auto-backup suppressed');

/* -- a failed login sync releases suppression and is retried ------------ */
T.setSET(freshCloud());
T.setPulledOnce(false);
jsonpReply = { ok:false, error:'boom' };
fetchReply = { ok:false, error:'boom2' };
await T.syncOnLogin();
ok(!T.isSuppressing(), 'a FAILED login sync still releases suppression');
jsonpReply = { ok:true, data:blank() };
fetchReply = { ok:true };
T.setPulledOnce(false);
const lr3 = await T.syncOnLogin();
ok(lr3.read.ok, 'a later login retries rather than replaying the failure');

/* -- doctor reports what is actually there ----------------------------- */
T.setSET(freshCloud());
T.setDB({ kids:[], posts:[post('p1','k1','T','b',1000)], deleted:[] });
jsonpTokens = {};
jsonpTokens['tok'] = { ok:true, data:blank() };
const pingReply = { ok:true, at:'now', tabs:['Kids'], lastBackup:'2026-01-01', drive:{ ok:true, name:'Pics' } };
/* ping and load share a token, so sequence them by hand */
let calls = 0;
jsonpReply = pingReply;
const docTxt = await (async () => {
  const real = jsonpReply;
  let n = 0;
  const origAppend = bodyEl.appendChild;
  bodyEl.appendChild = function(script){
    appended.push(script);
    const m = String(script.src||'').match(/[?&]callback=([^&]+)/);
    const act = (String(script.src).match(/[?&]action=([^&]*)/)||[])[1];
    if(m){
      const payload = act === 'ping' ? pingReply : { ok:true, data:blank() };
      setTimeout(() => { if(typeof sandbox[m[1]] === 'function') sandbox[m[1]](payload); }, 0);
    }
    return script;
  };
  const txt = await T.runDoctor();
  bodyEl.appendChild = origAppend;
  jsonpReply = real;
  return txt;
})();
ok(docTxt.indexOf('v3.0.0') >= 0, 'the doctor names the build');
ok(docTxt.indexOf('last backup') >= 0, 'a current deployment reports lastBackup');
ok(docTxt.indexOf('this deployment is OLD') < 0, 'and is NOT called old');
ok(docTxt.indexOf('stories on the Sheet: 0') >= 0, 'the doctor reads the actual Sheet counts');
ok(docTxt.indexOf('EMPTY while this device holds') >= 0,
   'and it calls out an empty Sheet against local work');
jsonpTokens = null;

/* -- doctor spots a stale deployment ------------------------------------ */
jsonpReply = { ok:true, at:'now', tabs:['Sheet1'] };   /* no lastBackup, no drive */
const staleTxt = await T.runDoctor();
ok(staleTxt.indexOf('this deployment is OLD') >= 0, 'a stale deployment is named as old');
ok(staleTxt.indexOf('pictures will not upload') >= 0, 'and the Drive gap is spelled out');

/* ===== 6. actions: the app's own handlers ============================== */
console.log('\n[6] actions');
T.setSET(T.normalizeSettings(null));
T.setDB(blank());
T.setSession({ grownUp:true });
T.setView({ name:'profiles', postId:null, kidId:null });

/* create a kid through the real handler */
nodeFor('#nName').value = 'Kaixuen';
T.ACTIONS.newKid();
T.ACTIONS.pickPik({ id:'blue' });
T.ACTIONS.createKid();
eq(T.DB().kids.length, 1, 'createKid added exactly one kid');
eq(T.DB().kids[0].name, 'Kaixuen', 'with the typed name');
eq(T.DB().kids[0].pikmin, 'blue', 'and the chosen colour');

const KID = T.DB().kids[0].id;

/* a story, written through the real handlers */
T.setView({ name:'kid', kidId:KID });
T.ACTIONS.newPost();
eq(T.DB().posts.length, 1, 'newPost created a story');
eq(T.DB().posts[0].kidId, KID, 'belonging to the right kid');
eq(T.DB().posts[0].status, 'draft', 'and it starts as a draft');

const PID = T.DB().posts[0].id;
nodeFor('#fTitle').value = 'My Garden';
nodeFor('#fBody').value  = 'Today I planted a seed.';
T.ACTIONS.savePost();
const saved = T.DB().posts.find(p => p.id === PID);
eq(saved.title, 'My Garden', 'the title was written through');
eq(saved.body,  'Today I planted a seed.', 'the body was written through');
ok(saved.updatedAt > 1000, 'and the timestamp moved');
eq(T.getDraft(), null, 'the editor closed after saving');

/* approval flow */
T.ACTIONS.approve({ id:PID });
eq(T.DB().posts.find(p => p.id === PID).status, 'published', 'approve publishes a story');
ok(T.DB().posts.find(p => p.id === PID).approvedAt > 0, 'and stamps the time');

/* delete is a tombstone, and it is remembered */
T.setView({ name:'kid', kidId:KID });
T.ACTIONS.newPost();
const PID2 = T.DB().posts[1].id;
nodeFor('#fTitle').value = 'Doomed';
nodeFor('#fBody').value  = 'x';
T.ACTIONS.savePost();
T.setDraft({ id:PID2, kidId:KID, title:'Doomed', body:'x', attachments:[] });
T.ACTIONS.delPost();
ok(!T.DB().posts.find(p => p.id === PID2), 'a deleted story is gone locally');
ok(T.DB().deleted.indexOf(PID2) >= 0, 'and its id is recorded as deleted');

/* with approval off, a story goes straight to published */
T.setSET(T.normalizeSettings({ requireApproval:false }));
T.setView({ name:'kid', kidId:KID });
T.ACTIONS.newPost();
const PID3 = T.DB().posts[T.DB().posts.length-1].id;
eq(T.DB().posts.find(p => p.id === PID3).status, 'published',
   'with approval off, a new story is published at once');
T.setSET(T.normalizeSettings(null));

/* removing a kid removes their stories and tombstones them */
const before2 = T.DB().posts.length;
const kidsPosts = T.DB().posts.filter(p => p.kidId === KID).length;
T.ACTIONS.delKid({ id:KID });
eq(T.DB().kids.length, 0, 'the kid is gone');
eq(T.DB().posts.filter(p => p.kidId === KID).length, 0, 'and so are their stories');
ok(T.DB().deleted.length >= kidsPosts, 'each of them was tombstoned');

/* savePrefs reads the form */
T.setDB(blank());
nodeFor('#sApproval').checked = false;
nodeFor('#sWords').value = '250';
nodeFor('#sName').value = 'Aunty';
T.ACTIONS.savePrefs();
eq(T.SET().requireApproval, false, 'savePrefs stored the approval switch');
eq(T.SET().wordLimit, 250, 'and the word limit');
eq(T.SET().grownUpName, 'Aunty', 'and the grown-up name');

/* saveCloud parses a Drive link into an id */
nodeFor('#cUrl').value    = URL_OK;
nodeFor('#cToken').value  = 'tok';
nodeFor('#cFolder').value = 'https://drive.google.com/drive/folders/FOLDER9';
nodeFor('#cAuto').checked = true;
nodeFor('#cOpen').checked = false;
T.setSET(T.normalizeSettings(null));
T.ACTIONS.saveCloud();
eq(T.SET().cloud.url, URL_OK, 'saveCloud stored the URL');
eq(T.SET().cloud.folderId, 'FOLDER9', 'and turned the folder link into an id');
eq(T.SET().cloud.pullOnOpen, false, 'and stored check-on-open off');
ok(T.cloudReady(), 'the app is connected after saving a URL');

/* a kid with no name is refused */
T.setDB(blank());
nodeFor('#nName').value = '   ';
const before3 = T.DB().kids.length;
T.ACTIONS.newKid();
T.ACTIONS.createKid();
eq(T.DB().kids.length, before3, 'a blank name does not create a kid');

/* ===== 7. the gate ===================================================== */
console.log('\n[7] the password gate');
T.setDB(blank()); T.setSET(T.normalizeSettings(null));
T.setView({ name:'profiles' });

/* Regression: a first-time visitor has NO session. Tapping the grown-ups
   tab, or opening a story, must not crash on a null session.
   (A real browser caught this; the sandbox alone had missed it.) */
T.setSession(null);
let threw = null;
try{ T.ACTIONS.openLog(); }catch(e){ threw = e; }
ok(!threw, 'tapping Grown-ups with no session does not crash');
ok(T.getView().name === 'profiles', 'and it waits at the gate instead of opening the log');

T.setSession(null);
T.setDB({ kids:[], posts:[post('pD','k1','A draft','x',5000,{status:'draft'})], deleted:[] });
threw = null;
try{ T.ACTIONS.openPost({ id:'pD' }); }catch(e){ threw = e; }
ok(!threw, 'opening a draft with no session does not crash');

/* A locked session must not slip through to the grown-ups log. */
T.setSession({ kidId:'k1' });
T.ACTIONS.openLog();
ok(T.getView().name !== 'log', 'a child session cannot open the grown-ups log');

/* Growing up and in */
T.setSession({ grownUp:true });
T.ACTIONS.openLog();
eq(T.getView().name, 'log', 'a grown-up session opens the log');

T.ACTIONS.lock();
eq(T.getSession(), null, 'locking clears the session');
T.ACTIONS.openKid({ id:'nope' });
ok(true, 'opening a missing kid does not throw');

/* ===== 8. storage door ================================================= */
console.log('\n[8] storage');
T.setDB({ kids:[kid('kX','Zed')], posts:[], deleted:[] });
sandbox.__pb.Store.writeDB(T.DB());
eq(T.Store.readDB().kids.length, 1, 'the DB round-trips through storage');
sandbox.__pb.Store.wipeDevice();
eq(T.Store.readDB().kids.length, 0, 'wiping the device clears the DB');
eq(T.Store.readSession(), null, 'and the session');

/* a corrupted blob must not crash the app */
store['pikminv3.db'] = '{{{not json';
eq(T.Store.readDB().kids.length, 0, 'a corrupted DB blob falls back to empty');
store['pikminv3.settings'] = 'garbage';
ok(T.Store.readSettings().cloud, 'a corrupted settings blob is normalised, not fatal');
delete store['pikminv3.db']; delete store['pikminv3.settings'];

/* ===== 9. the backend file ============================================ */
console.log('\n[9] backend sanity');
const gs = fs.readFileSync(path.join(__dirname,'google-apps-script.gs'),'utf8');
ok(/function doPost/.test(gs), 'the backend has doPost');
ok(/function doGet/.test(gs), 'the backend has doGet');
ok(/uploadImage/.test(gs), 'the backend handles uploadImage');
ok(/lastBackupTime/.test(gs), 'the backend reports lastBackup (the staleness tell)');
ok(/function driveInfo/.test(gs), 'the backend reports drive readiness');
/* strip comments first — otherwise this matches the sentence that promises
   NOT to call setSharing, which is the trap of a regex reading its own doc */
const gsCode = gs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
ok(!/\.setSharing\s*\(/.test(gsCode), 'the backend NEVER widens sharing');
ok(/SECRET/.test(gs), 'the backend has a token');
ok(/MAX_IMAGE_B64/.test(gs), 'the backend bounds image size');
ok(/New version/.test(gs), 'the backend header warns about New version');

/* the app and the backend must agree on the action names */
['sync','uploadImage'].forEach(a => {
  ok(gs.indexOf("'" + a + "'") >= 0, 'backend understands action ' + a);
});
['ping','load'].forEach(a => {
  ok(gs.indexOf("'" + a + "'") >= 0, 'backend understands GET action ' + a);
});

/* ===== 10. copy hygiene =============================================== */
console.log('\n[10] hygiene');
ok(!/password.*?489487/.test(HTML), 'no old PIN leaks into the new build');
ok(HTML.indexOf('ngkaixuen') < 0, 'no old family name leaks into the new build');
ok(HTML.indexOf('ngyeeching') < 0, 'no old family name leaks into the new build');
ok(HTML.indexOf('AKfycbxVcvJKRi9baM4viFL65J0E8M9rhnpiJcOJvuSFWgllBcxsdiHZXNNHtbLq1xoTGeel') < 0,
   'the OLD Sheet URL is not carried over');
ok(HTML.indexOf('1u5a2jzK5Jnl5r1QlniRHw5ZWzsv84sa8') < 0,
   'the OLD Drive folder id is not carried over');
ok(gs.indexOf('ngkaixuen') < 0, 'the backend carries no old family name');

/* ===== 11. the setup guide ============================================ */
console.log('\n[11] setup guide');
const setupPath = path.join(__dirname,'SETUP.html');
ok(fs.existsSync(setupPath), 'SETUP.html exists');
if(fs.existsSync(setupPath)){
  const guide = fs.readFileSync(setupPath,'utf8');
  ok(/<h1>/.test(guide), 'the guide has a title');
  ok(/<table>/.test(guide), 'and at least one table');
  ok(/<pre>/.test(guide), 'and code blocks');
  ok(/<blockquote>/.test(guide), 'and callouts');
  ok(guide.indexOf('New version') >= 0, 'and warns about publishing a New version');
  ok(guide.indexOf('SECRET') >= 0, 'and explains the token');
  ok(!/__[A-Z_]+__|\{\{|%%/.test(guide), 'no unrendered template placeholders leak in');
  /* the two markdown leaks that were found in a browser must stay fixed */
  const prose = guide.replace(/<pre>[\s\S]*?<\/pre>/g,'');
  ok(!/^#{1,6} /m.test(prose), 'no unparsed heading markers');
  ok(prose.indexOf('**') < 0, 'no unparsed bold markers outside code');
  ok(prose.indexOf('\u0001') < 0 && prose.indexOf('\u0002') < 0,
     'no stray placeholders from the inline parser');
}

const readme = path.join(__dirname,'README.md');
ok(fs.existsSync(readme), 'README.md exists');
if(fs.existsSync(readme)){
  const rm = fs.readFileSync(readme,'utf8');
  ok(/mergeSnapshot/.test(rm), 'the README documents the merge');
  ok(/suppressPush/.test(rm), 'and the suppression flag');
  ok(/THE RULE/.test(rm), 'and the switch-must-not-block-a-user-action rule');
  ok(/syncOnLogin/.test(rm), 'and the login sync');
}

/* ===== summary ========================================================= */
console.log('\n================  ' + pass + ' passed, ' + fail + ' failed  ================');
if(failures.length){
  console.log('\nFailures:');
  failures.forEach(f => console.log('  - ' + f));
}
process.exit(fail ? 1 : 0);

})().catch(e => {
  console.log('\nSUITE CRASHED: ' + (e && e.stack || e));
  process.exit(1);
});
