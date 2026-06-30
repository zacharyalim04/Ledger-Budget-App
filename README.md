# Ledger — Budget App

A React + Vite Progressive Web App: track income/expenses, manage custom
categories, split each paycheck across Needs/Wants/Savings, and see budgets
and trends. Installable on phones ("Add to Home Screen") and runs at a public
URL on any computer.

It runs in two modes:

- **Local mode** (default): no account, data saved in the browser on one device.
  Great for trying it instantly.
- **Cloud mode**: email/password logins with private per-user data, synced
  across devices via Supabase. Turn this on by adding a `.env` file (below).

---

## 1. Prerequisites

Install **Node.js** (version 18 or newer) from https://nodejs.org — the LTS
build is fine. Verify in a terminal:

```bash
node --version
```

## 2. Open in VS Code and run

1. Open this folder in VS Code (File > Open Folder).
2. Open the integrated terminal (View > Terminal).
3. Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

4. Visit the printed URL (http://localhost:5173). Edits to files in `src/`
   hot-reload instantly. You're now in **local mode** — fully functional.

## 3. (Optional) Turn on logins + cloud sync with Supabase

This gives each person their own private budget, reachable from any computer.

1. Create a free project at https://supabase.com.
2. In the dashboard, open **SQL Editor**, paste the contents of
   `supabase-schema.sql`, and click **Run**. This creates the tables and the
   security rules that keep each user's data private.
3. Open **Project Settings > API** and copy the **Project URL** and the
   **anon public** key.
4. In this folder, copy `.env.example` to `.env` and paste those two values:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

5. Stop the dev server (Ctrl+C) and run `npm run dev` again. The app now shows
   a sign-in screen. New accounts are seeded with the starter categories.

> By default Supabase emails a confirmation link on signup. To skip that while
> testing, go to **Authentication > Providers > Email** and turn off
> "Confirm email".

## 4. Deploy to a public URL (free)

Using **Vercel** (any static host works — Netlify, Cloudflare Pages, etc.):

1. Push this folder to a GitHub repo.
2. Go to https://vercel.com, "Add New Project", and import that repo.
3. Vercel auto-detects Vite. If asked: Build command `npm run build`, output
   directory `dist`.
4. If you're using cloud mode, add the two `VITE_SUPABASE_…` variables under
   the project's **Environment Variables**, then deploy.
5. You get a URL like `https://your-app.vercel.app`. Share it. On a phone,
   open it in the browser and choose **Add to Home Screen** to install it.

## 5. Install as an app

- **iPhone/iPad (Safari):** Share button > Add to Home Screen.
- **Android (Chrome):** menu > Install app / Add to Home Screen.
- **Desktop (Chrome/Edge):** install icon in the address bar.

It opens fullscreen with its own icon and works offline for viewing.

---

## Project structure

```
ledger/
├─ index.html              App entry
├─ vite.config.js          Vite + PWA (manifest & service worker) config
├─ supabase-schema.sql     Run this in Supabase to create tables + security
├─ .env.example            Copy to .env to enable cloud mode
├─ public/                 Icons + favicon
└─ src/
   ├─ main.jsx             Boots React
   ├─ App.jsx              The whole app UI + logic
   ├─ Auth.jsx             Sign-in / sign-up screen (cloud mode)
   ├─ store.js             Data layer: local OR Supabase behind one interface
   ├─ supabase.js          Supabase client (null in local mode)
   ├─ seed.js              Starter data for a fresh user
   └─ index.css            Global styles
```

## How the data layer works

`src/store.js` exposes `load`, `saveTransactions`, `saveBudgets`, and
`saveCategories`. The UI only ever calls those. Without `.env` credentials it
uses `localStorage`; with them it uses Supabase tables scoped to the signed-in
user. That's the only file that knows where data lives — so you can change
backends without touching the interface.

## Notes & next steps

- Cloud saves use a simple "replace my rows" strategy, which is fine for a
  personal budgeting app. For heavy multi-device concurrent use you'd switch to
  per-record upserts.
- The bundle includes the charting library; if you want a smaller download,
  code-split the charts with dynamic `import()`.
