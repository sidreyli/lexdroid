# LexDroid web interface

The interface is a Next.js app in the repository's npm workspace.

## Run locally

From the repository root, a fresh checkout takes two commands:

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. Without a working SQLite store the interface uses its checked-in
snapshot; run `npm run setup` and the pipeline commands from the root README for live data.

## Deploy to Vercel

From the repository root:

```bash
npm run deploy
```

This deploys `frontend/` as a read-only snapshot. Vercel sets `VERCEL=1`, which automatically
disables operations that need a persistent local store or worker process. No environment variables
are needed. `npm run deploy:preview` creates a preview deployment and `npm run check:deploy` runs
the typecheck, tests, and production build first.

When importing the Git repository through the Vercel dashboard, set the Root Directory to
`frontend`. The local `vercel.json` handles installation and the build.
