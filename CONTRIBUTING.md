# Contributing to NetLearn

This guide covers how to add content and interactives. **Everything here is a contract**: if you follow it, new
modules, lessons, quizzes, simulators and diagrams appear on the site without editing any core code.

```bash
pnpm dev                # local dev server (search index only exists after a build)
pnpm validate:content   # cross-reference checks (run after every content change)
pnpm check              # TypeScript / Astro diagnostics
pnpm test               # Vitest unit tests
pnpm build              # production build + Pagefind index
pnpm check:links        # every internal href/src in dist/ resolves (needs a build)
CI=1 pnpm test:e2e      # Playwright against the build (see "Testing" below)
pnpm verify             # validate + check + test + build + check:links
```

The golden reference lesson is `src/content/lessons/theory/01-packets-and-protocols.mdx`, together with its quiz,
flashcards and glossary entries. Copy its structure.

---

## 1. Content layout

| What | Where | Id |
|---|---|---|
| Module | `src/content/modules/<module>.yaml` | `<module>` |
| Lesson | `src/content/lessons/<module>/NN-<slug>.mdx` | lesson key `<module>/<slug>` (the `NN-` prefix only sorts files) |
| Lesson quiz | `src/content/quizzes/<module>/<slug>.yaml` | lesson key |
| Module exam | `src/content/exams/<module>.yaml` | `<module>` |
| Flashcards | `src/content/flashcards/<module>.yaml` | card `<module>/<card-id>` |
| Glossary | `src/content/glossary/<module>.yaml` | term id (**global** across all files) |

Schemas: `src/lib/content/schemas.ts`. URLs: `/modules/<module>/<slug>/`. The slug `exam` is reserved.

**Ids are permanent.** Learner progress is keyed by lesson keys and card ids, so renaming one resets that progress.
Renumbering a file's `NN-` prefix is safe.

### Add a module
1. Create `src/content/modules/<id>.yaml` with `title, short, order, summary, color, badge`, and optionally `prerequisites` and `estimatedHours`.
2. Create `src/content/lessons/<id>/` plus the matching quiz, flashcard, glossary and exam files.

The navigation, dashboard, exam page and certificate are generated automatically.

### Add a lesson
Frontmatter (see `lessonSchema`):

```yaml
---
title: NetworkVariables
order: 5                      # position within the module; must be unique
summary: One sentence for lists and search.
durationMin: 20
objectives: [ ... ]           # 3–5 "You will learn to ..." items
prerequisites: [ngo/network-objects]   # lesson keys
tags: [ngo, state]
targets:                      # REQUIRED for engine/SDK lessons
  unity: '6000.0'
  packages:
    - { name: com.unity.netcode.gameobjects, version: '2.x' }
sources:                      # REQUIRED for engine/SDK lessons: where every API claim was checked
  - { title: 'NGO docs: NetworkVariable', url: 'https://docs-multiplayer.unity3d.com/...' }
---
```

### Lesson template (follow this order)
1. **Hook**: one or two paragraphs that tie the topic to something the reader already knows from Unity.
2. **Concept** sections (`##`): short paragraphs, tables, and `<Term>` on the first use of each jargon word.
3. **Interactive**: at least one `<Sim>`, `<Diagram>` or `<Sequence>`, followed by a "What you should notice" list.
4. **Code**: real C# for Unity 6 / NGO 2.x / Facepunch.Steamworks. Give fenced blocks a `title="File.cs"`. Use `<CodeTabs>` for comparisons.
5. **Pitfalls**: `<Callout type="pitfall">` for the mistakes people actually make.
6. **`<KeyTakeaways>`**: 4–6 bullets that summarise the lesson.

The quiz is rendered automatically by the layout after the lesson. Do **not** add it to the MDX.

Writing style: second person, concrete, no filler. Explain *why* before *how*. The audience knows Unity
(MonoBehaviours, prefabs, the inspector) but is new to networking. Use `csharp` for code fences.

---

## 2. MDX components (available in every lesson without imports)

| Component | Usage |
|---|---|
| `<Callout type="note\|tip\|warning\|danger\|pitfall\|unity\|steam" title="...">` | Highlighted aside with Markdown inside |
| `<Term id="jitter">jitter</Term>` | Glossary tooltip. The id must exist in a glossary file |
| `<Steps>` wrapping a Markdown `1.` list | Numbered procedure |
| `<KeyTakeaways>` wrapping a `-` list | End-of-lesson summary |
| `<CodeTabs labels={['A', 'B']}>` + one fenced block per label | Tabbed code |
| `<Sim name="..." preset="..." caption="..." />` | Simulator from `src/components/sim/registry.ts` |
| `<Diagram name="..." variant="..." caption="..." />` | Diagram from `src/components/diagrams/registry.ts` |
| `<Sequence title actors={[{id,label,kind}]} steps={[{from,to,label,note,kind,code,tone}]} />` | One-off animated sequence diagram (see below) |

**`<Sequence>` fields** (types in `src/components/diagrams/types.ts`):

| Field | Required | Meaning |
|---|---|---|
| `actors[].id`, `actors[].label` | yes | Column id (used by steps) and its visible name |
| `actors[].kind` | no | Icon and color: `client` (default) \| `server` \| `host` \| `steam` \| `relay` \| `service` |
| `steps[].from`, `steps[].to`, `steps[].label` | yes | Arrow between two actor ids. `from === to` draws a self-loop |
| `steps[].kind` | no | Line style: `reliable` (solid, default) \| `unreliable` (dashed) \| `rpc` (solid + RPC tag) \| `event` (dotted) \| `local` (self-loop) |
| `steps[].note` | no | Extra sentence shown in the caption while the step is active |
| `steps[].code` | no | API call shown in monospace under the label (and in the caption). On diagrams narrower than 520 px it only appears in the caption, so keep it to one call |
| `steps[].tone` | no | Emphasis: `warn` / `danger` mark a failure point (⚠ and colored label), `ok` a success, `muted` a non-event (italic) |

```mdx
<Sequence
  title="Joining through a lobby"
  actors={[{ id: 'c', label: 'Client', kind: 'client' }, { id: 's', label: 'Steam', kind: 'steam' }]}
  steps={[
    { from: 'c', to: 's', label: 'Join the lobby', code: 'await lobby.Join()' },
    { from: 's', to: 'c', label: 'Lobby is full', kind: 'event', tone: 'danger', note: 'RoomEnter.Full: show a message, do not retry.' },
  ]}
/>
```

MDX gotchas: leave a blank line after an opening component tag and before its closing tag when the content is
Markdown. Write `{'{'}` or use code spans for literal braces in prose.

**Links and tables.** Write internal links root-relative, for example `[the security lesson](/modules/theory/security/)`.
Markdown links are rendered by `src/components/mdx/Link.astro`, which adds the deploy base path (GitHub Pages serves
the site under `/<repo>/`), so never hardcode the base. Markdown tables are wrapped in a focusable, horizontally
scrollable region (`Table.astro`), so wide tables are fine on phones.

### Available simulators and presets
| name | presets |
|---|---|
| `link-playground` | `lan`, `broadband`, `mobile-4g`, `bad-wifi`, `intercontinental` |
| `tcp-vs-udp` | `clean`, `lossy` |
| `tick-rate` | `compare`, `low-tick` |
| `prediction` | `no-prediction`, `prediction-only`, `reconciliation`, `high-latency` |
| `interpolation` | `none`, `interpolation`, `extrapolation`, `jittery` |
| `lag-compensation` | `no-compensation`, `rewind` |
| `authority-cheat` | `client-authority`, `server-authority` |
| `snapshot-delta` | `full-snapshots`, `delta` |
| `bandwidth-calculator` | `coop-4p`, `arena-16p`, `battle-royale` |
| `nat-traversal` | `cone`, `symmetric` |

### Available diagrams and variants
| name | variants |
|---|---|
| `packet-journey` | |
| `topology` | `dedicated`, `listen-server`, `p2p`, `relay`, `distributed-authority` |
| `ngo-rpc-flow` | `to-server`, `to-everyone`, `to-owner` |
| `ngo-netvar-flow` | |
| `ngo-spawn-flow` | |
| `steam-lobby-p2p-flow` | |
| `ngo-steam-host-join` | `host`, `client`, `invite` |

For anything else, use `<Sequence>` inline instead of requesting a new diagram.

---

## 3. Quizzes, exams, flashcards, glossary

**Question types** (`questionSchema`). Every question has `id` (kebab-case, unique in its file), `prompt`, and `explanation`
(which explains *why*; it is shown after answering), plus optional `code`, `lang` (default `csharp`), `difficulty` (1–3) and `tags`.

| type | fields |
|---|---|
| `single` | `options` (2–6), `answer` (0-based index) |
| `multi` | `options` (3–8), `answers` (0-based indices) |
| `truefalse` | `answer: true\|false` |
| `order` | `items` (3–8) listed in the **correct** order; the UI shuffles them |
| `codeline` | `code`, `answerLines` (1-based): "click the buggy line" |
| `fill` | `answers` (accepted strings), `caseSensitive`, `placeholder` |
| `numeric` | `answer`, `tolerance`, `unit` |

- **Lesson quiz:** 4–6 questions mixing at least 3 types, with `passPct` 70 by default. Test understanding, not trivia.
- **Module exam:** `title`, `drawCount` (15), `passPct` (80), and a pool of **25 or more** questions spread across all lessons. Use different questions from the lesson quizzes.
- **Flashcards:** **8 or more per lesson**, each with `lesson:` set. The front is a question and the back is a short answer (≤ 2 sentences), with optional `code`.
- **Glossary:** every `<Term>` needs an entry. `short` is limited to 240 characters (it's the tooltip), with an optional `long`, plus `lesson` (where the term is taught) and `seeAlso`. **Term ids are global** across all glossary files, and defining the same id twice is a validation error. General networking terms (latency, host, ownership, host migration, …) live in `glossary/theory.yaml` even when an engine module uses them first; a module's own file only holds terms specific to that engine or SDK. Search all four files before adding a term, and link to the existing one instead of redefining it.

---

## 4. Adding a simulator or diagram

1. Build the component in `src/components/sim/` (or `diagrams/`) as a **default-exported React component**.
2. Register it in `registry.ts` with `title`, `description`, `lessons`, `load: () => import('./YourSim')`, and `presets`/`defaultPreset` (or `variants` for a diagram).
3. Sims receive `SimBaseProps` (`seed`, `compact`) merged with the chosen preset's `props`. Network behaviour must come
   from `src/lib/netsim` (deterministic, seeded) so presets always play out the same way.
4. Requirements: work at 360 px width; support both themes (use the CSS variables `--text`, `--muted`, `--accent`, `--surface`, …
   read via `getComputedStyle`); have play/pause/step/reset controls where time is involved; honour `prefers-reduced-motion`
   (start paused); provide an accessible text summary (`aria-live` stats or a description).

The playground page lists every registered sim automatically. Once you register it, `validate-content` accepts its name and presets.

Also check `<Sim name="..." compact />` at 390 px: compact mode hides secondary controls and stats, and must still read
well. Use the shared controls in `sim/ui/controls.tsx` (the stat grid sizes its columns from the sim's own width with
container queries). For text in a module's color, use the `text-module-ink` / `bg-module-solid` utilities from
`global.css` rather than the raw `--module` color, which isn't guaranteed to meet contrast.

---

## 5. Engine and SDK accuracy rule

Everything about Unity Netcode for GameObjects, Unity Transport, Facepunch.Steamworks and the FacepunchTransport
**must be checked against current official sources** before it is written, and those sources must be listed in `sources:`.
- NGO: https://docs.unity3d.com/Packages/com.unity.netcode.gameobjects@2.4/manual/index.html (and the API reference)
- Facepunch.Steamworks: https://wiki.facepunch.com/steamworks/ and https://github.com/Facepunch/Facepunch.Steamworks
- FacepunchTransport: https://github.com/Unity-Technologies/multiplayer-community-contributions (`Transports/com.community.netcode.transport.facepunch`)
- Steamworks concepts: https://partner.steamgames.com/doc/

When an API changed between versions (for example `[ServerRpc]`/`[ClientRpc]` vs `[Rpc(SendTo.X)]`), teach the current one and mention the old one.

---

## 6. Code ownership

| Area | Paths |
|---|---|
| Foundation (layouts, routing, schemas, registries' *names*) | `src/layouts`, `src/pages/modules`, `src/lib/content`, `src/content.config.ts`, `src/components/mdx`, `src/components/layout` |
| Learning engine | `src/components/quiz`, `src/components/srs`, `src/components/progress`, `src/lib/quiz`, `src/lib/srs`, `src/lib/progress`, `src/pages/{review,progress}.astro`, `src/pages/certificate` |
| Simulators | `src/lib/netsim`, `src/components/sim` |
| Diagrams & discovery | `src/components/diagrams`, `src/components/mdx/Term.astro`, `src/components/layout/SearchBox.astro`, `src/pages/{glossary,search,index}.astro` |
| Content | `src/content/**` (one module per author) |

Changing a contract (schemas, component props, registry names and presets) requires updating this file and
`scripts/validate-content.ts` in the same change.

---

## 7. Testing

**Unit tests** (`tests/unit`, Vitest) cover the pure logic: netsim, grading, seeded draws, SRS.

**End-to-end tests** (`tests/e2e`, Playwright) run against the production build in a desktop and a mobile project:

```bash
pnpm build
CI=1 pnpm test:e2e                       # always set CI=1
CI=1 E2E_PORT=4361 pnpm test:e2e         # if port 4322 is taken (another worktree or agent)
CI=1 pnpm test:e2e discovery.spec.ts --repeat-each=10   # prove a fix for a flaky test
```

- `CI=1` makes Playwright start its own `astro preview` instead of reusing whatever is already listening on the
  port, which may be another worktree's (stale) build. It also enables one retry.
- Several agents or worktrees may run at once, so give every server its own port: `E2E_PORT` for the test server,
  and a unique port for manual previews, for example `pnpm astro preview --port 4350 --ignore-lock`.
- `site.spec.ts` derives every route from `src/content` (no hardcoded lesson lists) and checks that each renders without
  console errors, nothing scrolls sideways at 360 px, axe finds no WCAG A/AA violations on a representative set in both
  themes, and lessons only download the sim chunks they embed. New lessons and modules are covered automatically.
- `engine.spec.ts` answers the real exams from `src/content/exams/*.yaml`, including every question's answer key. The
  draw is reproducible through a test hook: set `window.__NETLEARN_EXAM_SEED__` before pressing Start, and
  `drawExam(questions, drawCount, seed)` from `src/lib/quiz/random.ts` gives the same questions in the same order.
- Islands are server-rendered with live-looking buttons, so a click before hydration is lost. Wait for the hydration
  markers before interacting: `data-ready="true"` on quizzes, exams, decks, review, progress, certificates and
  `[data-sequence]` (plus `data-stepper-ready` on stepper controls). Use `page.clock` for autoplay timers instead of
  long timeouts.

**Links.** `pnpm check:links` scans `dist/` for internal `href`/`src` values (plus astro-island chunks, Pagefind's
bundle path, JS chunk imports and CSS `url()`s) and checks each resolves to a file, with or without a trailing slash,
and that `#fragments` exist as ids on the target page. Check a project-site build with
`BASE_PATH=/netlearn SITE_URL=https://example.github.io pnpm build && BASE_PATH=/netlearn pnpm check:links`, which
also flags any link that skips the base. The deploy workflow runs it on every build.

---

## 8. Curriculum: lesson keys

These keys are fixed because registries, glossary entries and prerequisites already point to them.

**theory**: `packets-and-protocols` · `latency-jitter-loss` · `topologies` · `authority-models` · `tick-rate` · `state-sync` ·
`prediction-reconciliation` · `interpolation-extrapolation` · `lag-compensation` · `reliability-serialization` ·
`nat-and-relays` · `lockstep-rollback` · `security`

**ngo**: `setup` · `network-manager` · `network-objects` · `network-behaviour` · `network-variables` · `rpcs` ·
`network-components` · `connection-and-scenes` · `custom-serialization` · `prediction-anticipation` ·
`distributed-authority` · `debugging-tools` · `unity-services`

**steam**: `steamworks-overview` · `setup-and-callbacks` · `users-and-friends` · `lobbies` · `invites-and-presence` ·
`networking-sockets` · `messages-and-channels` · `auth-tickets` · `testing` · `stats-and-achievements`

**ngo-steam**: `architecture` · `facepunch-transport` · `host-flow` · `client-flow` · `player-identity` ·
`steam-auth-approval` · `disconnects` · `dev-workflow` · `shipping-checklist`

The file for lesson N is `NN-<key>.mdx` in that order, for example `lessons/ngo/06-rpcs.mdx`.
