# NEXORA

A personalized programming-education platform whose promise is **real engineers, not tutorial
followers**: the learner always knows what to learn next, why it matters, and can prove they
learned it.

Two applications live here.

| Path | What it is | Stack |
|---|---|---|
| [`nexora-svelte/`](nexora-svelte) | The front door — the site, the download, the account, and the proof | SvelteKit 5 (Svelte 5 runes), Tailwind v4, adapter-node |
| [`platform/`](platform) | The service mesh — auth, curriculum, progress, execution, tutor, billing behind one gateway | Fastify + TypeScript, Postgres per service, Docker Compose |

Contributor-facing truth lives at the root: [`TODO.md`](TODO.md) (what is left
before launch), [`TRUST-MODEL.md`](TRUST-MODEL.md) (which verdicts the platform
computes and which it only reports), [`SCENARIOS.md`](SCENARIOS.md) (what a
learner actually does), and [`CONTRIBUTING.md`](CONTRIBUTING.md) (the design and
code rules). The pre-pivot design blueprint (`design.md`) and the original
requirements (`prd.md`) described the retired Next.js classroom and are preserved
in git history (commit `e1ad7b9`), not linked as current truth.

## The idea in one screen

The path is four layers, in the order a beginner actually needs them:

```
Foundations → one Language (Go) → Algorithms → Application tracks (Web)
```

You do not pick a specialisation first. The diagnostic places you at the earliest layer you have
**not** demonstrated, so a fluent learner skips ahead and a total beginner is never thrown into a
framework. See `LAYERS` / `TRACKS` in
[`nexora-svelte/src/lib/curriculum.ts`](nexora-svelte/src/lib/curriculum.ts).

Assessment is deterministic: declarative checks interpreted against the learner's own output, no
LLM in the grading path. AI may explain, never grade.

## Run the learner app

The public entry is `/`. It is the front door and nothing more: the download, the account, the tier,
and the proof surface at `/verify`. The learning itself happens in the desktop IDE, and there is no
second way to learn here. `/employers` is the same argument as a document: the hiring manager's
one-pager, which prints on a single sheet.

```bash
cd nexora-svelte
npm ci
npm run dev            # http://localhost:5173  (npm run dev -- --port 5199 to choose a port)
```

With no configuration the app runs in **local mode**: everything (progress, drafts, evidence)
stays in the browser. No account, no network, fully functional — this is the product's default
resilience, not a degraded state. See [`nexora-svelte/.env.example`](nexora-svelte/.env.example)
for the one variable that turns the cloud on.

## Run the platform

```bash
cd platform
cp .env.example .env      # fill in secrets; every value has a documented default
npm ci
npm run build
npm run verify            # in-process suite — no Docker, no Postgres required
```

Full stack (Postgres + seven services + the app behind one gateway on `:8080`):

```bash
docker compose up --build --wait
npm run verify:e2e        # drives the real HTTP surface end to end
```

`PUBLIC_API_URL` must be reachable **from the browser**, not from inside the container. Point the
learner app at the gateway (`http://127.0.0.1:8080`) to switch it from local mode to cloud mode.

Once it is up, one command asks whether it is actually well, and says why not:

```bash
cd platform && npm run healthcheck                                    # http://127.0.0.1:8080
cd platform && npm run healthcheck -- --url=http://gateway:8080 --quiet   # for cron
```

Exit `0` healthy; `1` the edge answered and said something is wrong — a mesh member's check failing,
or the auth service not answering the per-request revocation check (requests still succeed then,
on a bounded stale answer, which is exactly why this needs watching); `2` the check could not ask at
all. Failures print the reason to stderr, so `--quiet` in a crontab mails only when something is
wrong.

## Verify before you ship

Every suite in this repo is meant to be run, not admired:

```bash
cd nexora-svelte && npm run check       # svelte-check: types across every component
cd nexora-svelte && npm run verify      # assertion suite over curriculum, checks, placement, sync
cd nexora-svelte && npm run verify:a11y # axe over every public route
cd nexora-svelte && npm run verify:ux   # reflow, no-script, reduced-motion and keyboard sweep
cd platform && npm run verify           # contracts, crypto, gateway, execution, tutor, billing
cd platform && npm run verify:e2e       # the compose stack over real HTTP
```

CI runs the four learner-app jobs on every push and PR (see [`.github/workflows/verify.yml`](.github/workflows/verify.yml));
the compose e2e runs nightly and on demand.

## Conventions that are not negotiable

These are product decisions, not preferences — changing them changes what the product claims:

1. **Evidence over activity.** XP, streaks and completions never stand in for demonstrated skill.
   If the engine cannot verify it, the UI must not claim it.
2. **Deterministic assessment.** Checks are data interpreted by an inspectable engine. No model
   ever decides pass or fail.
3. **Local-first.** The app works fully with no account and no network. The cloud strengthens
   learning; it never gates it.
4. **Dark-first.** Learners study at night. The dark environment is a binding constraint, not a
   theme toggle.
5. **Never make the learner feel stupid.** No shaming copy, no punishment for breaks, hints or
   misses. A failed check is deliberate practice.
6. **Curriculum has one source of truth** — `nexora-svelte/src/lib/`. Backend services embed a
   version-stamped snapshot; run `npm run sync:curriculum` in `platform/` after editing it, and
   the suite will fail if the snapshots drift.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the workflow, the content-authoring rules, and what
"done" means for a mission.
