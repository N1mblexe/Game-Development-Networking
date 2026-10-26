# NetLearn

An interactive course on multiplayer networking for Unity developers. It has four modules and 45 lessons:

1. **Networking for Games**: the theory (13 lessons)
2. **Unity Netcode for GameObjects** (13 lessons)
3. **Steamworks with Facepunch** (10 lessons)
4. **NGO + Steam Together** (9 lessons)

Progress is stored in the browser and can be exported or imported as JSON. Built with Astro, MDX, React islands,
Tailwind and Pagefind, and deployed to GitHub Pages.

## Features

- **Lessons** in MDX with glossary tooltips, callouts, tabbed code and Unity 6 / NGO 2.x / Facepunch.Steamworks samples.
- **10 network simulators** driven by a deterministic, seeded network model (latency, jitter, loss, bandwidth): link
  playground, TCP vs UDP, tick rate, prediction and reconciliation, interpolation, lag compensation, authority and
  cheating, snapshot delta compression, a bandwidth calculator and NAT traversal. All of them are on the
  playground page, and each lesson loads only the ones it embeds.
- **7 animated diagrams** (packet journey, topologies, NGO RPC / NetworkVariable / spawn flows, Steam lobby to P2P,
  NGO + Steam host and join) plus inline `<Sequence>` diagrams, all steppable and keyboard-accessible.
- **Quizzes** after every lesson (seven question types, including "click the buggy line" and ordering), which mark
  the lesson complete when passed.
- **Module exams** drawn from larger pools, with flags, review before submit and explanations, and a printable
  **certificate** per module once passed.
- **Spaced-repetition flashcards** (SM-2) per module, with a review queue across the course.
- **Glossary** of 160+ terms with filtering and deep links, and **full-text search** (Ctrl/⌘+K) over lessons and the
  glossary.
- Light and dark themes, works down to 360 px, and is checked with axe (WCAG 2.1 A/AA) in both themes.

## Scripts

```bash
pnpm install
pnpm dev                          # http://localhost:4321 (search needs a build)
pnpm validate:content [--strict]  # cross-reference checks for content (strict: warnings fail too)
pnpm check                        # TypeScript / Astro diagnostics
pnpm test                         # Vitest unit tests
pnpm build                        # production build + Pagefind index into dist/
pnpm check:links                  # every internal link, asset and #anchor in dist/ resolves
CI=1 pnpm test:e2e                # Playwright e2e against the build (E2E_PORT=... to change the port)
pnpm verify                       # validate + check + test + build + check:links
```

For a GitHub Pages project site, build with `SITE_URL=https://<user>.github.io BASE_PATH=/<repo> pnpm build` and check
it with `BASE_PATH=/<repo> pnpm check:links`. The deploy workflow (`.github/workflows/deploy.yml`) does both.

See [CONTRIBUTING.md](CONTRIBUTING.md) to add modules, lessons, quizzes, simulators or diagrams, and for the testing
conventions.
