# Pikmin Blog v3 — Setup

Built from scratch 2026-09-27. Nothing here is shared with any earlier version.

**Time needed:** about 15 minutes, once.
**What you need:** a Google account, and the file `index.html`.

---

## What you are setting up

```
   the app (index.html)                 Google
   ────────────────────                 ──────
   story text          ──── sends ───▶  a Sheet  (one tab per kind of record)
   drawings & photos   ──── sends ───▶  a Drive folder (real image files)

   Any device that opens the app, logs in, and has the
   same URL + token reads and writes that same Sheet.
```

Two pieces of Google, three steps:

| Step | What | Where |
|---|---|---|
| 1 | Make the Sheet and the Drive folder | your Google account |
| 2 | Paste the backend code and deploy it | Apps Script |
| 3 | Connect the app to what you deployed | the app's Grown-ups screen |

---

## Step 1 — Make the two homes

### 1a. The Sheet (holds the words)

1. Go to **sheets.new**
2. Name it something like `Pikmin Blog v3`.
3. **Leave it private.** This matters more than anything else in this guide —
   see *About privacy* at the bottom.
4. You do **not** need to create any tabs. The script makes them
   (`Kids`, `Posts`, `Pictures`, `Meta`) on the first save.

### 1b. The Drive folder (holds the pictures)

1. In Google Drive, make a new folder, e.g. `Pikmin Pictures`.
2. Open it. Look at the address bar:
   `https://drive.google.com/drive/folders/`**`1AbC...xyz`**
3. Copy that last part — the folder id. You will paste it in step 3.
4. Leave the folder private too.

---

## Step 2 — Put the backend in place

1. In your **Sheet**, click **Extensions → Apps Script**.
2. Delete everything already in the editor.
3. Open `google-apps-script.gs`, copy **all** of it, and paste it in.
4. Near the top, change two lines:

```js
var SECRET = 'change-me-to-something-yours';
```
Make up about 30 characters of nonsense. This is the shared token — the app
must send the same one. **Write it down.**

```js
var DRIVE_FOLDER_ID = '';
```
Paste the folder id from step 1b between the quotes.

5. Click **Save** (the floppy-disk icon).
6. Click **Deploy → New deployment**.
   - Click the **gear** next to "Select type" and pick **Web app**
   - **Description:** anything
   - **Execute as:** Me
   - **Who has access:** Anyone
7. Click **Deploy**. Google will ask for permission:
   - Choose your account → **Advanced**
   - **Go to \<project\> (unsafe)** → **Allow**

   That "unsafe" warning is normal. It appears because Google has not
   personally reviewed your own private script.

8. **Copy the Web app URL.** It ends in `/exec`. This is your endpoint.

> ### ⚠️ The one mistake everybody makes
> **Saving the script does not change what the live URL serves.**
> If you edit the code later, you must publish a **New version**:
>
> **Deploy → Manage deployments → pencil → Version: New version → Deploy**
>
> Do this by editing the existing deployment, **not** by creating a second one —
> a new deployment gives you a different URL and you would have to reconnect the app.---

## Step 3 — Connect the app

1. Open `index.html` (double-click it, or host it — see below).
2. Click **Grown-ups** (top right). The first time, the PIN is **489487**.
3. Fill in the **Google Sheet** card:

| Box | What goes in it |
|---|---|
| **Web app URL** | the `/exec` URL from step 2 |
| **Shared token** | the same words you put in `SECRET` |
| **Drive folder link** | paste the whole folder **link**, not just the id |

4. Leave both checkboxes ticked.
5. Click **Save**. Then click **Test**.

> ### This copy is already connected
> The three values above are **already filled in** in this build, so a fresh
> copy syncs with nothing typed. You only need to touch them if you set up your
> **own** Sheet (in which case replace all three with your own).
>
> To disconnect entirely, empty all three boxes and click Save. It stays
> disconnected — the app will not re-fill a box you deliberately cleared.

You want to see all of this:

```
App build: v3.1.4
Sheet URL: https://script.google.com/macros/s/…/exec
Drive folder: 1AbC...xyz
Stories on this device: 0

Asking the Sheet…
  answered at 2026-09-27T06:14:02.113Z
  tabs: Kids, Posts, Pictures, Meta
  last backup: ...
  drive: OK (Pikmin Pictures)

Reading the Sheet…
  stories on the Sheet: 0
  Pikmin on the Sheet: 0
```

**If a line says the deployment is OLD, or that pictures will not upload** —
you skipped publishing a New version. Go back to step 2.6 and use
**Manage deployments → pencil → New version → Deploy**.

> ### If `drive:` says there is a problem, but pictures still work
> The app sends the folder with **every** request, so pictures upload using the
> folder link from step 3 — and that is the value that matters.
>
> The `drive:` line in the test comes from the **script's own**
> `DRIVE_FOLDER_ID`, which may still be empty. That is harmless: it is only a
> fallback for when the app does not send a folder. To silence the warning,
> paste the folder id into `DRIVE_FOLDER_ID` in the script and publish a
> **New version**.

---

## Step 4 — Change the things you should change

### The family password

The app opens on a **sign-in card**. Three family passwords are already set, so
any family member can get in with their own. To change them, open `index.html`
in any text editor and find:

```js
const FAMILY_PW_HASHES = [
  hashPw('ngkimhooi'),
  hashPw('ngkaixuen'),
  hashPw('ngyeeching')
];
```

Replace the words with your own. They are not stored as words — the app
hashes them — but you still type the plain word to sign in. All of them are
case-insensitive and ignore spaces at the ends.

> After changing this, every device must sign in again with a password from the
> new list. Nothing else breaks.

> **This is a door, not a vault.** The words are hashed in the shipped file, but
> a short password can be brute-forced offline by anyone who understands the
> hash — and anyone can see the whole file. The login keeps casual visitors out.
> What really protects the family is **keeping the Sheet and Drive private**,
> as explained under "About privacy" below.

### The grown-up PIN

The PIN ships as `489487`. Change it in the same file:

```js
const DEFAULT_PIN = '489487';
```

This gates the **Grown-ups** screen only (approvals, limits, the Sheet
connection). It is separate from the family password that opens the app.

**The PIN is shipped, not per-device.** Changing `DEFAULT_PIN` updates every
device on its next load, so you do not have to visit each one. If you are
replacing a PIN you shipped earlier, add the old one to `RETIRED_PINS` as well —
otherwise devices that already saved it will keep using it:

```js
const RETIRED_PINS = ['123456'];
```

Any PIN listed there is replaced by `DEFAULT_PIN` on sight. A PIN a grown-up set
by hand is never touched.

### Asking for approval

Grown-ups → **Hold new stories until a grown-up approves them**.

On (the default): a child's story is saved as a *Sprout*, and only appears in
the reader once a grown-up approves it. Off: stories publish immediately.

---

## Putting it online (GitHub Pages)

The app is a single file, so hosting is genuinely one step.

1. Make a new **public** repository on GitHub.
2. Upload `index.html` (rename it to `index.html` if it is not already).
3. Repo **Settings → Pages → Source: Deploy from a branch → main → / (root)**.
4. Your app is at `https://<your-name>.github.io/<repo>/`.

Keep `google-apps-script.gs` out of the public repo if you prefer — it contains
your token too, and it does not need to be there for the app to run.

> **Think before you publish.** A public page means anyone with the link can
> open the app and reach the sign-in card. The family passwords are stored only
> as short hashes, so they slow a casual visitor down but would not stop a
> determined one. **Keep the Sheet and the Drive folder private** — that is what
> actually protects the stories.

---

## About privacy — the honest version

There is one thing in this design you should understand clearly.

**The token and the Sheet URL are visible to anyone who views the page
source.** On a public GitHub Pages site, that is anyone at all. They are not a
lock; they only turn away someone who has the URL but has never looked at the
file.

**What actually protects your family is the Sheet's own sharing settings.**

- Keep the Sheet **private**, or shared only with your own Google account.
- Keep the Drive folder **private** too. The script deliberately never changes
  sharing on a picture — files inherit whatever the folder is set to.
- The app never makes anything public on its own.

So: a stranger who finds your GitHub page could *use* the app — but they cannot
read your family's stories, because those live in a Sheet they cannot open, and
the pictures live in a folder they cannot open. If that is not enough for you,
host the app privately instead (or keep it as a local file).

### If two families share one Sheet

Do not. Each family should have its own Sheet, its own token, and its own
Drive folder. Two apps pointing at one Sheet will write over each other.

---

## Day-to-day use

**Signing in.** The app opens on a sign-in card. Type any of the family
passwords (see "Step 4") and press **Sign in** — or just press Enter. The device
stays signed in until someone presses **🚪 Sign out** in the top bar, so a child
who reloads does not have to type it again.

| I want to… | Do this |
|---|---|
| Sign in | Type a family password → **Sign in** |
| Sign out | Top bar → **🚪 Sign out** |
| Switch child | Top bar → **🔒 Lock** (returns to the Pikmin picker, stays signed in) |
| Add a child | Main screen → **＋ New Pikmin** |
| Write | Pick your Pikmin → **✏️ Write** |
| Draw a picture | In the editor, **🎨** |
| Add a photo | In the editor, **📷** |
| Read a story | Open it from the list |
| Approve stories | **Grown-ups** → **Waiting for approval** |
| Force a backup | **Grown-ups → Back up now** |
| Check sync is healthy | **Grown-ups → Check this device** |
| Fix a device | **Grown-ups → Start over on this device** |

**Start over on this device** clears only that device. The Sheet is untouched,
so logging in again brings everything back. It is the fix for a device that has
somehow got stuck.

---

## If something goes wrong

**Ordered by how often each one actually happens.**

1. **"That is not the family password."**
   → the word is not in `FAMILY_PW_HASHES`. Check the spelling inside `index.html`.
   Passwords are case-insensitive, so capitals are not the problem; a wrong word is.

2. **"Unknown action: uploadImage"** or pictures never appear in Drive
   → the deployment is an old version. Publish a **New version** (step 2.6).
   Text will still sync while pictures fail, so this looks half-working.

3. **"Bad token"**
   → the token in the app does not match `SECRET` in the script. Compare them
   character by character.

4. **"Could not reach the script"**
   → the URL is wrong, or the deployment's *Who has access* is not **Anyone**,
   or the device is offline. Check all three.

5. **A second device shows nothing after signing in**
   → both devices must be running the same app build. Compare the **Build** line
   in Grown-ups → This device on each.

6. **Stories on one device, not the other**
   → click **Check this device** on both. It reports the real counts on each
   side, which tells you which device is behind.

7. **Asked for a password again on a device that was signed in**
   → that is what **Sign out** does. It is not a fault. Type the password again.

8. **Changed the PIN but a device still wants the old one**
   → the device had the old PIN saved. This build migrates retired PINs
   automatically, so first try reloading the page. If it still refuses, add the
   old PIN to `RETIRED_PINS` in `index.html` (see "The grown-up PIN"). In an
   emergency, **Grown-ups → Start over on this device** clears the device and it
   will take the shipped PIN on the next load.

---

## What is in this folder

| File | Role |
|---|---|
| `index.html` | The app. This is the whole thing. |
| `google-apps-script.gs` | The backend. Paste into Apps Script. |
| `SETUP.html` | This guide, as a web page. |
| `README.md` | How it works inside, for whoever maintains it. |
| `_test.js` | 214 checks. For a developer. `node _test.js` |
| `_uitest.js` | Drives the real UI in a browser. For a developer. |
| `_livetest.js` | End-to-end against the live Sheet and Drive. For a developer. |

---

## This build is already wired up

So you know exactly what is baked in:

| Thing | Value |
|---|---|
| Sheet URL | `https://script.google.com/macros/s/AKfycbzws…/exec` (full URL below) |
| Shared token | `ngkaixuenngyeeching` |
| Drive folder | `1Ec8nu9gqoowAnnIoejzUj17K4YM0Qas0` |
| Family passwords | `ngkimhooi` / `ngkaixuen` / `ngyeeching` — **change these** |
| Grown-up PIN | `489487` — **change this** |

The full Sheet URL, for copying:

```
https://script.google.com/macros/s/AKfycbzws40cS8CzCOzHB82oWURV89GaGYWdhg2LTYCEk03fUJbAi78TlhgkorUVEUL9OxzoSQ/exec
```

Verified against the live backend: a story written in the app reaches the Sheet,
a drawing is filed as a real image in Drive, and a second device sees both after
logging in.

> **A reminder about the token.** It is in `index.html` in plain text. On a
> public GitHub Pages site anyone can read it by viewing the page source. Keep
> the **Sheet and the Drive folder private** — that, not the token, is what
> keeps your family's writing and pictures away from strangers.
