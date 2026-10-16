# Pack

Family travel planning and packing. A mobile-first web app (installable PWA) that
keeps all its data as JSON in a private GitHub repo the whole family shares, with no
backend. See [`SPEC.md`](./SPEC.md) for the agreed design.

| Repo | Purpose |
|---|---|
| `pack` (this one) | App code. Built with Vue 3 + Vite and deployed to GitHub Pages by GitHub Actions. |
| `pack-data` (private) | Family, trips, packing lists and attachments. Read and written by the app through the GitHub API. |

## Features

- **Trips** built from one or more templates (ski, camping, hotel, weekend away…) or
  cloned from a past trip. Legs (drive, flight, train, ferry, stay, wait) with local
  and home times shown side by side. Bags with weight allowances. Bookings.
- **Tasks** with typed kinds that insist on the right details: bookings (parking,
  car hire, accommodation), online check-in with a configurable opening time and
  per-person boarding passes, bag weighing against the allowance, packing, document
  checks. Due dates relative to departure, the return journey or any leg.
- **Packing lists** per person, seeded from the template (adults can keep their own
  personal list per trip type). Need-to-buy flags roll up into a shopping list.
  Import plain text, one item per line. Save a list or task back to the template.
- **Countdown** to departure with completion of everything due before you leave,
  per-person progress, overdue items, and a second countdown for the return.
- **Attachments**: photos are downscaled in the browser, PDFs kept as-is. Mark
  boarding passes and confirmations "keep offline" to view them without signal. On
  Android, share screenshots and PDFs straight into the app from the share sheet.
- **Offline**: the last synced copy is shown read-only until you're back online.
- **Concurrent edits**: every change is a small operation. If someone else saved
  first, the app reloads and replays your change on top.

## Setting up

### 1. Data repo

Create a private repo called `pack-data` under your GitHub account. Leave it empty;
the app writes `family.json` and starter templates on first run.

### 2. Token

Create a fine-grained personal access token (GitHub → Settings → Developer settings)
limited to the `pack-data` repository with **Contents: read and write**. Share it
with the family; each person pastes it into the app on their own device.

### 3. App hosting

1. Push this repo to GitHub (it can be public; it contains no data).
2. Settings → Pages → **Source: GitHub Actions**.
3. Every push to `main` builds and deploys to `https://<owner>.github.io/pack/`.

If you fork under a different repo name, set `VITE_BASE` in the workflow to
`/<repo-name>/`.

### 4. First run

Open the app, enter the token, owner and repo, then add the family: names, adult or
child, and whether a parent manages their tasks. Pick who you are on each device.

On a phone, use "Add to Home screen" to install it. The share-sheet integration
needs the installed app (Android only for now).

## Development

```sh
npm install
npm run dev        # http://localhost:5173/pack/
npm test           # vitest unit tests (sync, time zones, templates)
npm run typecheck
npm run build      # typecheck + production build to dist/
```

Data layout and schemas are in [`SPEC.md`](./SPEC.md). The sync layer is
`src/lib/doc.ts` (optimistic ops with conflict replay) and `src/stores/repo.ts`
(one git tree request per refresh, diffing shas against the local cache).
