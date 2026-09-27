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
2. Click **Grown-ups** (top right). The first time, the PIN is **123456**.
3. Fill in the **Google Sheet** card:

| Box | What goes in it |
|---|---|
| **Web app URL** | the `/exec` URL from step 2 |
| **Shared token** | the same words you put in `SECRET` |
| **Drive folder link** | paste the whole folder **link**, not just the id |

4. Leave both checkboxes ticked.
5. Click **Save**. Then click **Test**.

You want to see all of this:

```
App build: v3.0.0
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

---

## Step 4 — Change the things you should change

### The family password

Two passwords ship with the app so it works out of the box. **Change them.**
Open `index.html` in any text editor and find:

```js
const FAMILY_PW_HASHES = [
  hashPw('letmewrite'),
  hashPw('pikminv3')
];
```

Replace the two words with your own. They are not stored as words — the app
hashes them — but you still type the plain word to log in. Both are
case-insensitive and ignore spaces at the ends.

> After changing this, every device must log in again with a password from the
> new list. Nothing else breaks.

### The grown-up PIN

The PIN ships as `123456`. Change it in the same file:

```js
const DEFAULT_PIN = '123456';
```

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
> open the app and see the family password box. With the shipped password that
> is an open door. **Change the passwords first.**

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

| I want to… | Do this |
|---|---|
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

1. **"Unknown action: uploadImage"** or pictures never appear in Drive
   → the deployment is an old version. Publish a **New version** (step 2.6).
   Text will still sync while pictures fail, so this looks half-working.

2. **"Bad token"**
   → the token in the app does not match `SECRET` in the script. Compare them
   character by character.

3. **"Could not reach the script"**
   → the URL is wrong, or the deployment's *Who has access* is not **Anyone**,
   or the device is offline. Check all three.

4. **A second device shows nothing after logging in**
   → both devices must be running the same app build. Compare the **Build** line
   in Grown-ups → This device on each.

5. **Stories on one device, not the other**
   → click **Check this device** on both. It reports the real counts on each
   side, which tells you which device is behind.

---

## What is in this folder

| File | Role |
|---|---|
| `index.html` | The app. This is the whole thing. |
| `google-apps-script.gs` | The backend. Paste into Apps Script. |
| `SETUP.html` | This guide, as a web page. |
| `README.md` | How it works inside, for whoever maintains it. |
| `_test.js` | 126 checks. For a developer. `node _test.js` |
| `_uitest.js` | Drives the real UI in a browser. For a developer. |
