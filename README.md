# Pikmin Blog v3 — how it works

For whoever maintains this next. Written after building it, 2026-09-27.

New to the app? Read **SETUP.md** first. This file is about the inside.

---

## Files

| File                    | Role                                                              |
| ----------------------- | ----------------------------------------------------------------- |
| `index.html`            | The entire app — HTML, CSS and JS in one file. ~70 KB.            |
| `google-apps-script.gs` | The Google backend. Not served anywhere; pasted into Apps Script. |
| `_test.js`              | 126 assertions against the app's real logic. `node _test.js`      |
| `_uitest.js`            | Drives the actual UI in Chrome via playwright-core.               |

There is **no build step and no dependency**. `index.html` is the deliverable.

---

## Signing in — the wall in front of everything

The app opens on a **sign-in card**, not the Pikmin picker. Nothing else exists
on screen until a family password is entered.

Two flags look similar and are deliberately **not** the same thing:

| Flag | Question it answers | Cleared by |
|---|---|---|
| `LOCKED`  | *May this person use the app at all?* | `loginTry` (right password) / `lockApp` (Sign out) |
| `SESSION` | *Which child, or grown-up?*           | Lock (🔒) returns to the Pikmin picker |

Clearing `SESSION` must **not** re-show the password card — that would be a bug
that locks a grown-up out every time they press Lock.

### The wall blocks content, not just the view

`render()` checks `LOCKED` **first** and returns early with only `viewLogin()`:

```js
function render(){
  const app = $('#app');
  rendering = true;
  let carried = null;
  try{
    if(LOCKED){
      app.innerHTML = viewLogin();
      renderGate();
      focusLoginInput();
      return;                      // <- nothing below this line ever runs
    }
    ...
```

This matters. A CSS overlay would leave the story text sitting in the DOM where
"View source" or devtools could read it. Returning early means **no story text is
ever written into the page while locked** — verified against the live Sheet: 3
stories were pulled into memory, and **zero titles appeared on screen**.

### Passwords

```js
const FAMILY_PW_HASHES = [ hashPw('ngkimhooi'), hashPw('ngkaixuen'), hashPw('ngyeeching') ];
```

`hashPw()` is a djb2-style string hash (base-36 output), and `pwOk()` trims and
lower-cases before comparing, so passwords are case-insensitive and tolerant of
stray spaces. Hashing keeps the words out of the shipped source in plain text —
it does **not** make a short password strong.

### Staying signed in

`KEY_UNLOCKED` (`pikminv3.unlocked`) records `'1'` after a successful sign-in, so
a reload keeps the door open. **Sign out (🚪) in the top bar clears it** and puts
the wall back, and that persists across reloads too. `wipeDevice()` removes it as
well. The Enter key is owned by the sign-in card while locked.

### The PIN is shipped config, not a device preference

This was a real bug, and worth understanding before touching `normalizeSettings`.

Settings are saved per device, and the old rule was *"a saved `pin` always wins"*.
So changing `DEFAULT_PIN` did nothing on any device that had already run the app —
that device kept the old PIN **forever**, and only a brand-new one picked up the
new value. The constant was correct in the file while the running app was wrong,
which is exactly why a test that only checks the constant stayed green.

The fix has two halves:

```js
const RETIRED_PINS = ['123456'];          /* superseded shippers */
pin: RETIRED_PINS.indexOf(pin) >= 0 ? DEFAULT_PIN : pin,
```

and `Store.readSettings()`, which writes the normalized value back when
normalization changed something — so the migration happens once, not on every
load. Only PINs that were *shipped* are migrated; a PIN a grown-up set by hand is
left alone. **`123456` is deliberately still in the file** as a list entry — it is
the thing being retired, not a credential.

**When you change `DEFAULT_PIN`, add the old value to `RETIRED_PINS`**, or every
device that already saved it will ignore the change.

### Testing this class of bug

Every test ran on a **fresh browser profile**, where no stale PIN exists — so all
of them passed while the bug was live. Assertions that only grep the source for a
constant cannot catch it. The suite now drives the behaviour instead:

- `normalizeSettings({pin:'123456'}).pin === '489487'`
- `normalizeSettings({pin:'my-own-pin'}).pin === 'my-own-pin'` (not clobbered)
- `_uitest.js` **seeds the old saved blob into `localStorage`**, reloads, and
  checks both the effective and the written-back value, then confirms `123456` is
  refused at the gate.

**If a feature can be defeated by previously-saved data, a clean-profile test will
never see it.** Seed the old state deliberately.

---

## The shape of the app

Four layers. Each one has a single job, and the boundaries are deliberate.

```
   render()          the ONLY code that writes to the page
   ────────
   ACTIONS           the ONLY code that changes state, wired by [data-act]
   ────────
   Cloud             the ONLY code that talks to Google
```

### No local storage

**Store is removed.** The device holds nothing between reloads — not stories,
not kids, not settings, not session state. The Google Sheet is the sole source
of truth. Every reload fetches fresh data from the cloud.

This is a deliberate privacy choice: a child using a shared or school device
leaves no trace when they close the page. The trade-off is that a reload starts
from scratch — the password must be re-entered, and the Sheet must be reachable.

### `DB` and `SET` — the whole world

```js
DB  = { kids:[], posts:[], deleted:[] }
```

- `kids` — `{id, name, pikmin, createdAt}`
- `posts` — `{id, kidId, title, body, attachments[], status, createdAt, updatedAt, approvedAt}`
- `deleted` — tombstones. The reason a deleted story does not come back.

`SET` is always built by `normalizeSettings()`. **Never construct a settings  
object by hand.** Every field the app reads is guaranteed present, because this  
one function fills the gaps. Skipping it is how "cannot read property of  
undefined" bugs are born.

### `ACTIONS`

One plain function per user action, all dispatched from one delegated  
`click` listener reading `data-act`. To add a feature you add a function and a  
`data-act` attribute — **no new event listeners**.

```js
document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-act]');
  if(!t || !ACTIONS[t.dataset.act]) return;
  ACTIONS[t.dataset.act](t.dataset);
});
```

### `render()` — one function, six screens

`VIEW.name` picks the screen: `profiles`, `kid`, `editor`, `read`, `log`,  
`newKid`. `render()` rebuilds the current screen's HTML and re-attaches nothing  
(delegation handles that). It also calls `renderGate()`.

**After changing state, call `render()`.** Forgetting is the most common way to  
"save something and see nothing happen".

---

## Sync: the part worth understanding

Two directions, and they are not symmetrical.

### Reading — `pullFromSheet()`

Uses **JSONP**, not `fetch`.

Why: Apps Script answers a GET with a `302` to `script.googleusercontent.com`.  
`fetch` follows that but you cannot read the body cross-origin. A `<script>` tag  
has no such problem, so reads go through one with `?callback=NAME`. This is not  
a stylistic choice — a plain `fetch` read **does not work**.

`pullFromSheet({force:true})` ignores the check-on-open setting.  
`pullFromSheet({force:false})` honours it. The boot call is unforced; the login  
call is forced.

#### Cold starts, retries, and the status strip

An Apps Script deployment nobody has touched for a while is **slow to wake**.
Google holds the request in its queue before the script runs at all — measured
at ~2.7s on a warm-ish deployment, and a genuinely cold one can exceed 30s.
Treating that as a hard failure is what produced the "stuck on *Reading the
Sheet…*" bug.

Three rules now apply:

1. **`readSheetWithRetry()`** — up to 3 attempts with a widening gap
   (1.2s, 2.4s). Only *transient* faults are retried; a refusal from the script
   (bad token) is never retried, because it can never fix itself.
2. **The strip repaints itself.** `setCloudState()` calls `repaint()` whenever
   the status actually changes, so no user action is needed to clear a stale
   message. `render()` sets a `rendering` guard so a repaint cannot recurse into
   itself, and `repaint()` coalesces bursts through `requestAnimationFrame`.
3. **Nothing spins forever.** A 75s watchdog converts any still-running read
   into a plain-language error, and failed reads make the strip tappable
   (`data-act="retryRead"`) so "try again" is a real instruction.

The spinner is pure CSS, injected once — no image, no request.



### Writing — `pushToSheet()`

Uses `fetch` with `Content-Type: text/plain`.

Why: `text/plain` is a "simple" content type, so the browser skips the CORS  
preflight. And a POST reply *is* readable, because Apps Script sends  
`Access-Control-Allow-Origin: *` on the redirect target.

### `mergeSnapshot(mine, theirs)` — a version clock, not last-write-wins

The rules, all four of which have tests:

| Situation                    | Result                                        |
| ---------------------------- | --------------------------------------------- |
| Remote `updatedAt` is newer  | Remote text wins                              |
| Timestamps are equal         | **Local** wins — it has the pictures          |
| A story is deleted anywhere  | It stays deleted, even if a newer copy exists |
| Remote copy has an approval  | The approval is never undone                  |
| Local copy has more pictures | Pictures are not lost to a newer text copy    |

It also returns `changed`, computed by comparing canonical signatures — so a  
pull that changes nothing does not write to storage or trigger a repaint.

**If a sync looks wrong, fix the invoking code, not the merge.** The merge is  
what is tested hardest.

### Two switches, and one thing they must never break

- `autoPush` — governs the app's *unbidden* write (`pushSoon()`)
- `pullOnOpen` — governs the app's *unbidden* read (`pullFromSheet()` unforced)

**`syncOnLogin()` ignores both.** It runs on every successful login, reads  
*and* writes, and the only thing allowed to stop it is an unconfigured Sheet.

> **THE RULE: a settings switch must never make an explicit user action a  
> silent no-op.**
>
> Logging in is a person asking. If a switch could make that do nothing, the  
> user loses exactly the thing they just requested, with no message. This was a  
> real bug in an earlier version of this app — every login synced nothing,  
> silently and permanently, while reporting success.

### `suppressPush`

Held `true` across a pull, so a debounced leftover save cannot push a  
pre-pull snapshot over the stories being read.

Two rules:

1. **Release it explicitly before calling `pushSoon()`** — `pushSoon()` returns  
   early while suppressed, so releasing afterwards means the re-sync silently  
   does nothing.
2. **`finally` must set it to `false` unconditionally.** A captured  
   `wasSuppressed` looks tidier and is a trap: once it latches `true`,  
   auto-backup stops for the rest of the session with no error anywhere.

### Timers

- `scheduleSave()` — `AUTOSAVE_MS` (800 ms). One write per burst of typing.
- `pushSoon()` — `PUSH_DEBOUNCE_MS` (1600 ms). One upload per burst of edits.

Tests assert that work was **scheduled** (`hasPendingPush()`), not that it  
happened, so they stay fast and deterministic.

---

## Pictures

Drawings and photos never go into the Sheet. They are real files in Drive.

1. `shrinkImage()` scales to `PIC_MAX_EDGE` (1400 px) and re-encodes as JPEG.  
   This happens in the browser, on a canvas.
2. `queuePictureUpload()` sends them **after** the story text is saved — so a  
   failed picture never costs you the words.
3. `uploadPicture()` POSTs `action=uploadImage`; the script writes the file and  
   logs a row in the `Pictures` tab.
4. On success the attachment keeps its local `thumb` but drops `src`, and gains  
   `driveId` + `url`. A grey/amber dot on the thumbnail shows which state it is in.
5. **After a successful upload the app pushes again.** The text went up *before*
   the pictures, so the Sheet's picture count was written as zero. Without the
   re-push the Sheet permanently claims a story has no pictures. That re-push
   deliberately bypasses the backup switch and clears `suppressPush` first — the
   child pressed Save, so it is an explicit action, not the app's own initiative.
   A test asserts a `sync` *follows* the `uploadImage`.

**`uploadPicture` must never call `setSharing`.** Pictures inherit the folder's  
sharing. A script that widens sharing on a child's photo is a serious bug.

**The folder LINK beats the bare folder id.** Shipping sets both. A grown-up
edits the link, so if the two ever disagree the one they can see is the one they
meant — `driveFolderId()` reads the link first and falls back to the id only when
there is no link.

---

## The backend (`google-apps-script.gs`)

Four tabs, made on demand:

| Tab        | Holds                                     |
| ---------- | ----------------------------------------- |
| `Kids`     | one row per Pikmin                        |
| `Posts`    | one row per story — **text only**         |
| `Pictures` | one row per filed image                   |
| `Meta`     | last backup time, row counts, deleted ids |

`Meta` is not decoration. `lastBackupTime()` is how the app can tell whether  
the **deployed** script is the current one — an older deployment has no Meta  
tab, and reports no `lastBackup`. `runDoctor()` uses exactly this.

### Gotchas

- **A leading `=` in a cell makes Sheets treat it as a formula.** `safe()`  
  escapes it, `unsafe()` undoes it on read. Both are needed; do not remove  
  either.
- **Sheets caps a cell at 50,000 characters.** `clip()` truncates and says so.
- **`doGet` has a JSONP path and a plain-JSON path.** The app uses the JSONP  
  one for reads. Testing with `curl` and no `callback=` exercises the *other*  
  path — so it does not prove the app's path works.
- **`curl -X POST` to the `/exec` URL returns a spurious `HTTP 411`** from  
  Google regardless of headers. Probe POSTs from a real browser instead.
- **Editing the `.gs` changes nothing live** until you publish a New version.

---

## Testing

```bash
node _test.js        # 214 assertions, no dependencies
```

Block `[0]` of the suite is the login wall: it signs in first, so every later
block runs with the door open. If you add assertions that need the main page,
they must come **after** block `[0]`.

**A green suite is not proof the suite works.** After fixing a real bug,  
reintroduce it and confirm the run goes red with *specific* failures. This has  
already caught one hollow assertion in this codebase — a check that was  
matching its own documentation comment instead of the code.

```bash
# drive the real UI (needs playwright-core + Chrome)
cd "C:/Users/PC/.workbuddy-ai/binaries/node/workspace"
NODE_PATH="$PWD/node_modules" node "<path>/_uitest.js"
```

Run **both**. The Node suite cannot model CORS, rendering, or `localStorage`  
across a reload. A real browser caught the null-session crash on the  
Grown-ups tab that the Node suite passed straight through — because the  
sandbox never visited that screen as a first-time user.

### Harness notes

- **Real timers.** Faking `setTimeout` to `() => 0` means the JSONP timeout  
  never fires and an `await` on a network call never settles — the suite dies  
  silently with exit 0 and no summary. If the summary line is missing, the  
  suite is **hanging**, not passing.
- **JSONP is not `fetch`.** The harness intercepts `document.body.appendChild`  
  and calls the callback named in `script.src`.
- **A block that mutates shared state must hand it back**, or later blocks fail  
  for unrelated reasons.
- When a test fails, check the **assertion** before the app. Several failures  
  while building this were wrong expectations, not wrong code.

---

## Changing the app

1. Edit `index.html`.
2. `node --check` the extracted script, then `node _test.js`.
3. Bump `BUILD` at the top of the script.
4. Re-run `_uitest.js`.
5. Re-publish the deployment **if** you changed the `.gs`.

Bumping `BUILD` matters: it is shown in Grown-ups → This device, and it is the  
only reliable way to answer "which build is this device running?" when several  
copies are in circulation.

---

## Constants worth knowing

| Name                               | Where   | Meaning                                              |
| ---------------------------------- | ------- | ---------------------------------------------------- |
| `BUILD`                            | app     | Shown in the Grown-ups screen. Bump on every change. |
| `DEFAULT_BACKEND`                  | app     | Shipped Sheet URL, token, Drive folder. All set.     |
| `FAMILY_PW_HASHES`                 | app     | Accepted family passwords, as hashes.                |
| `DEFAULT_PIN`                      | app     | Shipped grown-up PIN. `489487`.                      |
| `RETIRED_PINS`                     | app     | Superseded PINs, replaced by `DEFAULT_PIN` on sight. |
| `KEY_SETTINGS` / `KEY_SESSION`     | app     | **Removed.** Nothing stored locally.                 |
| `PIC_MAX_EDGE`                     | app     | Longest edge a picture is shrunk to.                 |
| `AUTOSAVE_MS` / `PUSH_DEBOUNCE_MS` | app     | 800 / 1600 ms.                                       |
| `SECRET`                           | backend | Shared token. Must match the app's.                  |
| `DRIVE_FOLDER_ID`                  | backend | Fallback picture folder (may be empty — see below).  |
| `MAX_CELL` / `MAX_IMAGE_B64`       | backend | 49,000 chars / ~15 MB.                               |

**Why `DRIVE_FOLDER_ID` may be empty while pictures still work.** The app sends
the folder with every `uploadImage` request, so the app-side folder is what
actually matters. The script's constant is only a fallback. An empty one makes
`ping.drive` report `ok:false` — a harmless warning, not a failure, and SETUP.md
explains it to the user.

---

## Known limitations

Stated plainly, because pretending otherwise costs whoever maintains this next.

- **The token is not a secret.** It ships in `index.html` in plain text. The  
  Sheet's sharing settings are the real protection. This is a documented  
  trade-off, not an oversight.
- **No accounts.** One family password for everyone; the PIN gates the  
  grown-ups screen only. It is a child's writing app, not a multi-tenant system.
- **The login is a door, not a vault.** The family passwords ship as hashes, not
  plain words, but a short password is brute-forceable offline by anyone who
  understands the hash. What actually protects the family is that the **Sheet and
  Drive folder stay private** — then a stranger who guesses a password still
  finds nothing to read.
- **No conflict UI.** Merges are automatic. Two devices editing the same story  
  at once will keep the newer text; nobody is asked.
- **Tombstones grow.** `deleted` is never pruned on the Sheet. Fine for years of  
  family use; would need attention at a much larger scale.
- **Pictures upload one at a time, sequentially.** Ten drawings on one story  
  means ten round trips. Deliberate — it keeps failures isolated.
- **Nothing stored locally.** Every reload starts from scratch — password,
  Pikmin selection, everything. The Sheet must be reachable. This is the price
  of leaving no trace on the device.
