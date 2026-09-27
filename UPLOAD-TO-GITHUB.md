# What to upload to GitHub

This folder is already staged with exactly the right files. Upload **this folder's
contents** — that's it.

| File | Upload? | Why |
|---|---|---|
| `index.html` | **Yes — this is the whole app** | Single self-contained file (~81 KB). No build step, no dependencies. This *is* the website. |
| `.gitignore` | Yes (optional) | Keeps stray junk out of the repo. Nothing in this app needs ignoring, so it's harmless either way. |
| `README.md` | Yes, **but read the warning below** | Describes the project. Contains the shared token and Sheet URL. |
| `google-apps-script.gs` | **NO** | This goes into Google Apps Script (Extensions → Apps Script), not GitHub. It is the backend. |
| `_test.js`, `_uitest.js`, `_livetest.js`, `_build-docs.js` | **NO** | Developer-only test scripts. |
| `SETUP.md` / `SETUP.html` | Your choice | Setup guide for *you*. Useful as a private reference; don't publish it publicly. |

## The one rule that actually protects your family

**Keep the Google Sheet and the Drive folder private.** Only share them with the
Google account that runs the Apps Script.

The token in `index.html` is a door handle, not a lock — anyone who views the page
source can read it. What actually keeps strangers out is:

1. The Sheet is **not** shared publicly.
2. The Drive folder is **not** shared publicly.
3. The Apps Script deployment is set to **"Anyone"** (needed so the browser can
   reach it) but it refuses any request whose `token` doesn't match.

So: publishing `index.html` is safe **as long as the Sheet and Drive folder stay
private.** If you ever share the Sheet, share it read-only with named accounts only.

## Publishing on GitHub Pages

1. Create a new repository (public is fine).
2. Upload `index.html` (drag-and-drop into the repo works).
3. Repo → **Settings → Pages**.
4. Source: **Deploy from a branch**, Branch: `main`, folder: `/ (root)`, then Save.
5. Wait ~1 minute. Your site is at
   `https://<your-username>.github.io/<repo-name>/`

Every family member opens that link on any device — no install, nothing to sign into.

## Before you tell the kids about it

The family passwords are already set inside `index.html`. To change them, search
for `FAMILY_PW_HASHES`:

- **Family passwords** — `ngkimhooi`, `ngkaixuen`, `ngyeeching`
  (search for `ngkimhooi`)
- **Grown-up PIN** — `489487` (search for `DEFAULT_PIN`)

Each kid gets their own Pikmin colour and their own PIN, so stories stay separate.

> **The sign-in card is a door, not a vault.** The passwords are stored only as
> short hashes in the page you publish, so a determined visitor could
> brute-force one offline. Keeping the **Sheet and Drive folder private** is
> what actually protects the stories.

## Signing in

The app opens on a sign-in card. Type any family password and press **Sign in**.
The device stays signed in across reloads until someone presses **🚪 Sign out**
in the top bar. **🔒 Lock** returns to the Pikmin picker without signing out.

## Tested

This exact `index.html` was loaded in a real browser over `http://` (the way GitHub
Pages serves it) and over `file://`:

- build `v3.1.0`
- connected: **true**
- pulled the live stories from the Sheet
- cloud state: `Up to date — 7 stories.`
- console errors: **none**
- the status strip settles on its own in ~2–4s, no tapping needed
- a fresh device lands on the sign-in card; a wrong password is refused; the
  right one signs in; signing out puts the wall back up

Unit suite: **214 passed, 0 failed**. Real-browser journey: **all 20 steps pass**.

### Fixed in this build — the "stuck on Reading the Sheet…" problem

If you saw the little status line sit on *"Reading the Sheet…"* for ages, that
was two things together:

1. The status line only repainted when you tapped something, so when the read
   finished in the background, the **screen kept showing the old message**.
2. Google takes a few seconds to wake up a Sheet that has not been used for a
   while — sometimes much longer. The app gave up after 20s with no retry.

Now: the status line repaints itself, the app **retries** a slow Google, shows
*"Still reading the Sheet… (2 of 3)"* while it waits, and if it truly cannot
reach the Sheet it says so plainly and lets you **tap the message to try again**.
It can never spin forever.
