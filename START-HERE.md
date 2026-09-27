# Pikmin Blog v3

A writing and drawing app for children, with a Pikmin theme.
Story text is stored in a Google Sheet. Drawings and photos are stored as real
files in a Google Drive folder. Any device that logs in sees the same work.

Built fresh on 2026-09-27. It shares nothing with any earlier version —
different code, different passwords, different Sheet.

---

## Start here

**To set it up:** open **`SETUP.html`** — it is a web page with the whole
walkthrough. About 15 minutes, once.

**To just look at the app:** double-click **`index.html`**.

---

## The files

| File | What it is |
|---|---|
| `index.html` | **The app.** One file. Double-click to run it. |
| `SETUP.html` | **The setup guide.** Open this first. |
| `google-apps-script.gs` | The Google backend. Pasted into Apps Script, never opened directly. |
| `README.md` | How it works inside — for whoever maintains it. |
| `SETUP.md` | The source text of `SETUP.html`. |
| `_test.js` | 142 checks. `node _test.js` |
| `_uitest.js` | Drives the real UI in Chrome. |
| `_build-docs.js` | Rebuilds `SETUP.html` from `SETUP.md`. |

---

## What it does

- **Children each get a Pikmin** — six colours, their own name, their own blog.
- **Write** with a word counter and a limit a grown-up sets.
- **Draw** on a built-in canvas, or **add a photo** from the device.
- **Grown-ups approve** stories before other children can read them (optional).
- **Syncs across devices.** Log in anywhere and the work is there.
- **Works offline.** Stories save to the device first, then go up.

Still private, still yours:

- Stories live in **your** Google Sheet. Keep it private and nobody else can read them.
- Pictures live in **your** Google Drive folder. Children's photos stay yours.

---

## Verified

```
142 checks pass            (node _test.js)
full UI journey passes     (create Pikmin, write, draw, save, reload, approve)
zero browser console errors
```

Tested in real Chrome, not just a simulated environment — the app was driven
through the whole child and grown-up flow, and the work was confirmed to survive
a page reload.

---

## Two things to do before publishing

1. **Change the family passwords.** They ship as `letmewrite` and `pikminv3` so
   the app works out of the box. Open `index.html`, find `FAMILY_PW_HASHES`,
   and put your own words in.
2. **Change the grown-up PIN.** It ships as `123456` (`DEFAULT_PIN`).

Both are explained in `SETUP.html`.

> **If you put this on GitHub Pages, remember:** the Sheet URL and token are
> visible to anyone who views the page source. That is fine — it is a doorbell,
> not a lock. What protects your family is that the **Sheet and the Drive folder
> stay private**. A stranger can then *use* the app but cannot read a single
> story or open a single picture.

---

## If something goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| Pictures never reach Drive | The Apps Script deployment is an old revision | Publish a **New version** (Setup, step 2.6) |
| "Bad token" | The app's token ≠ `SECRET` in the script | Compare them character by character |
| "Could not reach the script" | URL wrong, deployment not public, or offline | Check all three |
| A second device shows nothing | The devices run different app builds | Compare the **Build** line on each |
| One device behind the other | — | **Grown-ups → Check this device** reports the real counts |

The **Grown-ups → Check this device** button is the first thing to press. It
reports what is actually on the Sheet, not just whether the address answers.
