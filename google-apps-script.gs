/**
 * ============================================================
 *  PIKMIN BLOG v3  —  Google Sheets + Drive backend
 * ============================================================
 *  Turns one Google Sheet into the shared home for the app.
 *
 *  Story TEXT      -> tabs in this spreadsheet
 *  Drawings/photos -> real image files in one Drive folder
 *
 *  ------------------------------------------------------------
 *  SETUP (about five minutes, once)
 *  ------------------------------------------------------------
 *   1. Go to sheets.new  and name it anything, e.g. "Pikmin Blog v3".
 *   2. In the Sheet:  Extensions  >  Apps Script.
 *   3. Delete whatever is in the editor and paste ALL of this file.
 *   4. Set SECRET below to your own random words. Make some up —
 *      about 30 characters of nonsense is ideal. Write it down;
 *      you will paste the SAME value into the app's Settings.
 *   5. Click Save  (the floppy-disk icon).
 *   6. Click  Deploy  >  New deployment.
 *        - gear icon next to "Select type"  >  Web app
 *        - Description:  anything
 *        - Execute as:   Me
 *        - Who has access:  Anyone
 *   7. Click Deploy. Google will ask for permission:
 *        - Choose your account  >  Advanced
 *        - "Go to <project> (unsafe)"  >  Allow
 *      The "unsafe" warning is normal for your own unreviewed script.
 *      It appears because Google has not personally checked the code.
 *   8. Copy the "Web app" URL. It ends in  /exec
 *   9. Paste that URL into the app:  Grown-ups  >  Google Sheet.
 *      Paste the same SECRET into the "Shared token" box. Save.
 *  10. Click "Test" in the app. You want every line green.
 *
 *  ------------------------------------------------------------
 *  ABOUT THE SECRET — please read
 *  ------------------------------------------------------------
 *  The token sits in plain text inside index.html. On a public
 *  GitHub Pages site, ANYONE can read it by viewing the page
 *  source. It is a doorbell, not a lock. It only turns away
 *  someone who has the URL but has never looked at the file.
 *
 *  What actually protects your family is this spreadsheet's own
 *  SHARING SETTINGS. Leave it private, or share it only with your
 *  own Google account. Do not publish it.
 *
 *  ------------------------------------------------------------
 *  IF YOU EDIT THIS FILE LATER
 *  ------------------------------------------------------------
 *  You must publish a NEW VERSION, or the live URL keeps serving
 *  the old code. Saving the editor is NOT enough:
 *
 *    Deploy > Manage deployments > pencil > Version: New version > Deploy
 *
 *  This is the single most common reason something "stops working".
 * ============================================================
 */


/* ------------------------------------------------------------------
   1. YOUR SETTINGS
   ------------------------------------------------------------------ */

/** CHANGE THIS to your own random words. About 30 characters.
    The same value goes into the app's "Shared token" box. */
var SECRET = 'change-me-to-something-yours';

/** The Drive folder that will hold drawings and photos.
    Copy the id out of the folder's web address:
      https://drive.google.com/drive/folders/  <-- this part -->
    The app may send its own folder id per request; this is the fallback. */
var DRIVE_FOLDER_ID = '';

/** Tab names. Leave these alone unless you have a reason. */
var TAB_KIDS  = 'Kids';
var TAB_POSTS = 'Posts';
var TAB_PICS  = 'Pictures';
var TAB_META  = 'Meta';

var HEAD_KIDS  = ['Kid ID','Name','Pikmin','Created'];
var HEAD_POSTS = ['Post ID','Kid ID','Kid','Title','Story','Status',
                  'Words','Pictures','Created','Updated','Approved'];
var HEAD_PICS  = ['File ID','Kid','Story','File name','KB','Uploaded','Link'];

/** Google Sheets allows 50,000 characters in one cell. Stay under it. */
var MAX_CELL = 49000;

/** Refuse an enormous image before trying to decode it (~15 MB). */
var MAX_IMAGE_B64 = 20000000;


/* ------------------------------------------------------------------
   2. WEB ENTRY POINTS
   ------------------------------------------------------------------ */

/** The app POSTs here: full snapshot, or one picture. */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return out({ ok:false, error:'No data received.' }, null);
    }
    var body = JSON.parse(e.postData.contents);

    if (body.token !== SECRET) {
      return out({ ok:false, error:'Bad token. Check it matches SECRET in the script.' }, null);
    }

    if (body.action === 'sync') {
      var wrote = writeSnapshot(body.data || {});
      return out({
        ok: true,
        at: new Date().toISOString(),
        kids: wrote.kids,
        posts: wrote.posts
      }, null);
    }

    if (body.action === 'uploadImage') {
      return out(uploadImage(body), null);
    }

    return out({ ok:false, error:'Unknown action: ' + body.action }, null);

  } catch (err) {
    return out({ ok:false, error:String(err) }, null);
  }
}

/** The app GETs here: a health check, or a full read. */
function doGet(e) {
  var p  = (e && e.parameter) || {};
  var cb = p.callback || null;      /* JSONP wrapper so a browser can read it */

  try {
    if (p.token !== SECRET) {
      return out({ ok:false, error:'Bad token. Check it matches SECRET in the script.' }, cb);
    }

    if (p.action === 'ping') {
      return out({
        ok: true,
        at: new Date().toISOString(),
        tabs: tabNames(),
        lastBackup: lastBackupTime(),
        drive: driveInfo()
      }, cb);
    }

    if (p.action === 'load') {
      return out({ ok:true, data: readSnapshot() }, cb);
    }

    return out({ ok:false, error:'Unknown action: ' + p.action }, cb);

  } catch (err) {
    return out({ ok:false, error:String(err) }, cb);
  }
}

/** Sends JSON — optionally wrapped as JSONP. */
function out(obj, cb) {
  var s = JSON.stringify(obj);
  if (cb) {
    return ContentService.createTextOutput(cb + '(' + s + ');')
                         .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(s)
                       .setMimeType(ContentService.MimeType.JSON);
}


/* ------------------------------------------------------------------
   3. WRITING THE SHEET
   ------------------------------------------------------------------ */

function writeSnapshot(data) {
  var kids  = data.kids  || [];
  var posts = data.posts || [];

  /* a lookup so the Posts tab can show a child's name, not a code */
  var names = {};
  kids.forEach(function (k) { names[k.id] = k.name; });

  /* ---------- Kids ---------- */
  var shK = tab(TAB_KIDS);
  shK.clear();
  shK.getRange(1, 1, 1, HEAD_KIDS.length).setValues([HEAD_KIDS]).setFontWeight('bold');
  var kidRows = kids.map(function (k) {
    return [ str(k.id), safe(k.name), str(k.pikmin), iso(k.createdAt) ];
  });
  if (kidRows.length) {
    shK.getRange(2, 1, kidRows.length, HEAD_KIDS.length).setValues(kidRows);
  }
  shK.setFrozenRows(1);
  shK.setColumnWidth(2, 160);

  /* ---------- Posts ---------- */
  var shP = tab(TAB_POSTS);
  shP.clear();
  shP.getRange(1, 1, 1, HEAD_POSTS.length).setValues([HEAD_POSTS]).setFontWeight('bold');
  var postRows = posts.map(function (p) {
    return [
      str(p.id),
      str(p.kidId),
      safe(names[p.kidId] || p.kidId),
      safe(p.title),
      clip(p.body),
      str(p.status),
      wordCount(p.body),
      countPics(p),
      iso(p.createdAt),
      iso(p.updatedAt),
      p.approvedAt ? iso(p.approvedAt) : ''
    ];
  });
  if (postRows.length) {
    shP.getRange(2, 1, postRows.length, HEAD_POSTS.length).setValues(postRows);
  }
  shP.setFrozenRows(1);
  shP.setColumnWidth(4, 240);
  shP.setColumnWidth(5, 520);

  /* ---------- Meta ---------- */
  var shM = tab(TAB_META);
  shM.clear();
  shM.getRange(1, 1, 4, 2).setValues([
    ['Key', 'Value'],
    ['Last backup', new Date()],
    ['Written', postRows.length + ' stories, ' + kidRows.length + ' Pikmin'],
    /* Stories deleted on one device are listed here so another device does
       not bring them back on its next read. The app expires these. */
    ['Deleted post ids', JSON.stringify(data.deleted || [])]
  ]);
  shM.getRange(1, 1, 1, 2).setFontWeight('bold');

  SpreadsheetApp.flush();
  return { kids:kidRows.length, posts:postRows.length };
}

/** How many pictures a story has — sent as a separate array, so count it. */
function countPics(p) {
  if (p && p.attachments && p.attachments.length) return p.attachments.length;
  return Number(p && p.attachmentCount) || 0;
}


/* ------------------------------------------------------------------
   4. READING THE SHEET
   ------------------------------------------------------------------ */

function readSnapshot() {
  return { kids:readKids(), posts:readPosts(), deleted:readDeleted() };
}

function readDeleted() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_META);
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getRange(2, 2).getValue();
  if (!v) return [];
  try {
    var list = JSON.parse(String(v));
    return Array.isArray(list) ? list.map(function (x) { return String(x); }) : [];
  } catch (e) { return []; }
}

function readKids() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_KIDS);
  if (!sh) return [];
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, HEAD_KIDS.length).getValues()
    .filter(function (r) { return String(r[0]).length; })
    .map(function (r) {
      return {
        id:        str(r[0]),
        name:      unsafe(r[1]),
        pikmin:    str(r[2]) || 'red',
        createdAt: ms(r[3])
      };
    });
}

function readPosts() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_POSTS);
  if (!sh) return [];
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, HEAD_POSTS.length).getValues()
    .filter(function (r) { return String(r[0]).length; })
    .map(function (r) {
      return {
        id:         str(r[0]),
        kidId:      str(r[1]),
        title:      unsafe(r[3]),
        body:       unsafe(r[4]),
        status:     str(r[5]) || 'draft',
        attachments: [],              /* pictures live in Drive, not here */
        createdAt:  ms(r[8]),
        updatedAt:  ms(r[9]),
        approvedAt: r[10] ? ms(r[10]) : null
      };
    });
}


/* ------------------------------------------------------------------
   5. PICTURES  ->  Google Drive
   ------------------------------------------------------------------ */

/**
 * Opens the folder a picture belongs in. The app may name its own;
 * otherwise DRIVE_FOLDER_ID is used. Returns null when it cannot be
 * reached, so the caller can give a plain message instead of crashing.
 */
function driveFolder(wantedId) {
  var id = String(wantedId || DRIVE_FOLDER_ID || '').trim();
  if (!id) return null;
  try { return DriveApp.getFolderById(id); }
  catch (e) { return null; }
}

/** Used by "ping", so the app can tell a grown-up whether Drive is ready. */
function driveInfo() {
  var f = driveFolder(null);
  if (!f) {
    return { ok:false, error:'No Drive folder could be opened. Set DRIVE_FOLDER_ID '
      + 'in the script, or paste a folder link in the app, and make sure this account '
      + 'can add files to it.' };
  }
  return { ok:true, id:f.getId(), name:f.getName() };
}

/**
 * Saves one picture as a real file, then logs a row in the Pictures tab
 * so there is a readable list of everything filed.
 *
 * The file inherits the FOLDER's sharing. This script never calls
 * setSharing — your pictures stay exactly as private as the folder is.
 */
function uploadImage(body) {
  var folder = driveFolder(body.folderId);
  if (!folder) {
    return { ok:false, error:'The Drive folder could not be opened. Check the folder '
      + 'link in the app, and that this script may add files to it.' };
  }

  var parsed = splitDataUrl(body.dataUrl);
  if (!parsed) return { ok:false, error:'That picture was not in a format the script can read.' };

  if (parsed.b64.length > MAX_IMAGE_B64) {
    return { ok:false, error:'That picture is too big to send (about '
      + Math.round(parsed.b64.length / 1365000) + ' MB). Try a smaller one.' };
  }

  var bytes, blob, file;
  try {
    bytes = Utilities.base64Decode(parsed.b64);
    blob  = Utilities.newBlob(bytes, parsed.mime, pictureName(body, parsed.mime));
    file  = folder.createFile(blob);
  } catch (e) {
    return { ok:false, error:'Drive refused the file: ' + String(e) };
  }

  var logged = true, logError = '';
  try { logPicture(file, body, bytes.length); }
  catch (e) { logged = false; logError = String(e); }   /* file is safe; only the row failed */

  return {
    ok: true,
    fileId: file.getId(),
    url: file.getUrl(),
    name: file.getName(),
    bytes: bytes.length,
    folder: folder.getName(),
    logged: logged,
    logError: logError
  };
}

/** "data:image/png;base64,AAAA…"  ->  {mime, b64} */
function splitDataUrl(s) {
  var m = String(s || '').match(/^data:([^;,]+);base64,([\s\S]*)$/);
  if (!m) return null;
  var b64 = m[2].replace(/\s+/g, '');
  return b64 ? { mime:m[1], b64:b64 } : null;
}

/** A tidy, sortable file name:  kaixuen_my-story_2026-09-27-134500.jpg */
function pictureName(body, mime) {
  var ext = mime.indexOf('png') >= 0 ? 'png'
          : (mime.indexOf('gif') >= 0 ? 'gif' : 'jpg');
  var kid  = slug(body.kidName || body.kidId || 'pikmin', 30);
  var what = slug(body.postTitle || 'story', 40);
  var when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd-HHmmss');
  return kid + '_' + what + '_' + when + '.' + ext;
}

/** Keep letters, numbers and dashes; collapse the rest. */
function slug(v, max) {
  var s = str(v).replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '');
  if (s.length > max) s = s.slice(0, max).replace(/-+$/, '');
  return s || 'untitled';
}

/** Appends one row. Never clears what is already there. */
function logPicture(file, body, byteCount) {
  var sh = tab(TAB_PICS);
  if (!String(sh.getRange(1, 1).getValue())) {
    sh.getRange(1, 1, 1, HEAD_PICS.length).setValues([HEAD_PICS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  sh.appendRow([
    file.getId(),
    safe(body.kidName || body.kidId || ''),
    safe(body.postTitle || body.postId || ''),
    file.getName(),
    Math.round(byteCount / 1024),
    new Date(),
    file.getUrl()
  ]);
  SpreadsheetApp.flush();
}


/* ------------------------------------------------------------------
   6. SMALL HELPERS
   ------------------------------------------------------------------ */

function tab(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  return sh || ss.insertSheet(name);
}

function tabNames() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets().map(function (s) {
    return s.getName();
  });
}

/**
 * When the last backup landed, read straight from the Meta tab. The app
 * uses this to confirm a write whose reply it could not read — and to
 * tell whether this DEPLOYMENT is current (an old one has no Meta row).
 */
function lastBackupTime() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_META);
  if (!sh || sh.getLastRow() < 2) return null;
  var v = sh.getRange(2, 2).getValue();
  if (v instanceof Date) return v.toISOString();
  return v ? String(v) : null;
}

/** Anything -> text that is safe for setValues. */
function str(v) { return v === null || v === undefined ? '' : String(v); }

/** A leading "=" makes Sheets treat a cell as a formula. Escape it. */
function safe(v) {
  var s = str(v);
  return s.charAt(0) === '=' ? "'" + s : s;
}

/** Undo the escape above when reading back. */
function unsafe(v) {
  var s = str(v);
  return s.charAt(0) === "'" ? s.slice(1) : s;
}

/** Sheets caps a cell at 50,000 characters. */
function clip(v) {
  var s = safe(v);
  return s.length > MAX_CELL
    ? s.slice(0, MAX_CELL) + '\n[shortened here — the full story is on the device]'
    : s;
}

function wordCount(v) {
  var m = str(v).trim().match(/\S+/g);
  return m ? m.length : 0;
}

/** epoch ms -> readable ISO text */
function iso(t) {
  if (!t) return '';
  var d = new Date(Number(t));
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

/** whatever Sheets gives back -> epoch ms */
function ms(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  var t = Date.parse(String(v));
  return isNaN(t) ? Date.now() : t;
}
