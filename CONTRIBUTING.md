# Contributing to NetLearn

This guide covers how to add content and interactives. **Everything here is a contract**: if you follow it, new
modules, lessons, quizzes, simulators and diagrams appear on the site without editing any core code.

```bash
pnpm dev                # local dev server (search index only exists after a build)
pnpm validate:content   # cross-reference checks (run after every content change)
pnpm check              # TypeScript / Astro diagnostics
pnpm test               # Vitest unit tests
pnpm build              # production build + Pagefind index
pnpm test:e2e           # Playwright (needs `pnpm build` first)
pnpm verify             # validate + check + test + build
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
| `<Sequence title actors={[{id,label,kind}]} steps={[{from,to,label,note,kind}]} />` | One-off animated sequence diagram. `kind` is `reliable\|unreliable\|rpc\|event\|local` |

MDX gotchas: leave a blank line after an opening component tag and before its closing tag when the content is
Markdown. Write `{'{'}` or use code spans for literal braces in prose.

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
- **Glossary:** every `<Term>` needs an entry. `short` is limited to 240 characters (it's the tooltip), with an optional `long`, plus `lesson` (where the term is taught) and `seeAlso`. **Term ids are global**: check other modules' files before adding one, and reuse existing terms rather than duplicating them.

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

## 7. Curriculum: lesson keys

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
