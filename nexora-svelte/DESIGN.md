# The front door, as a brief

The design brief for `nexora-svelte`. It exists so that a later change can be
judged against something written down, instead of against a memory of what the
page used to look like.

## Purpose and audience

Two readers, in this order.

**The learner.** Someone who can follow a tutorial perfectly and cannot start
a blank file. They are not short of content; they are short of a verdict that
is not somebody's opinion. The page has to make one promise and keep it: the
lesson runs in the editor, the judgement is deterministic, and the record of
the work can be re-derived by a stranger.

**The hiring manager.** Someone who has been sold "graduates with portfolios"
before and does not believe it. They will not read a long page. They will look
for a way to check a claim in five minutes, with no onboarding, and for a
vendor willing to print their own gaps.

The learner is the default. The hiring manager has their own document at
`/employers`, and the homepage's hiring section is a summary that points
there.

## Register

**Brand**, with a product's rigour. The design is the argument, so it is
built to be looked at; but every claim it makes is one the code can back, so
it is built to be checked.

## Aesthetic direction

**Laboratory instrumentation.** One extreme, committed: this is a bench, not a
lounge. A dark ground ruled like a measuring surface, hairlines instead of
borders, one amber that means "an action", a mono face for every reading, and
a serif that appears only where a person is reading prose.

What that rules out: soft shadows (elevation is a rule and a background step,
never a blur), large radii (the corner is a cut corner, as on a plate),
card grids, decorative icons, stock photography, and any colour that is not
doing a job.

## The unforgettable thing

**The receipt.** A slip of paper that says what ran, what it judged, what
failed, why, and how long it took, with a hash and a signature, which any
stranger can re-derive at `/verify`. It is the product's artefact, it is the
thing the whole site is arguing for, and it is the only picture of the
product that is not a screenshot of a screen that does not exist yet.

Behind it, in the courses section, **the field**: the eighty shipped phases
as eighty points in space, three arms of one spine, green where the phase is
open on the free tier and amber where it opens with Pro. It is the same data
the ledger prints, read a third way.

## Palette

Restrained neutrals with one committed accent.

| Role | Token | Use |
|---|---|---|
| Ground | `--color-ground` | the page |
| Panel | `--color-panel` | a surface inside a surface |
| Ink | `--color-ink` | the reading text |
| Muted, faint | `--color-muted`, `--color-faint` | second and third voices |
| Rule | `--color-rule`, `--color-rule-strong` | the hairlines that divide |
| Accent | `--color-accent` | an action, and only an action |
| Added, removed, review, approved | the state inks | a state, never a decoration |
| Paper | `--color-paper` | the receipt, and the printed page |

Every neutral is tinted: the ground is a cool near-black and the paper a warm
off-white. There is no pure black and no pure white anywhere, in either
medium, and the suite fails the build if one appears.

Amber is the only colour a reader can act on. If it is not a thing you can
click, it does not get to be amber.

## Typography

- **Archivo** for display and text. A grotesque with a width axis, set tight
  and large.
- **IBM Plex Mono** for every reading: counts, phases, hashes, commands,
  timestamps, labels.
- **Newsreader** for prose, and for one word inside a poster line, in italic.
  The serif is the reading voice; it is not allowed anywhere else.

One marked word per poster: the word that carries the promise, said by the
other instrument.

## Motion

One lens: **polish**. Choreographed, measured, with a reason.

- The reveal: a line masked and lifted out of its own overflow box, once, and
  never again.
- The stagger: a list arriving in order, because a list has an order.
- The scrub: the proof chain tied to the scroll, because the chain is the
  argument.
- The field: the one continuous moment, in the courses section, where the
  reader has asked for it.
- The cross-fade: between documents, where the browser has the API for it.

Rules: under reduced motion everything is static and everything is visible,
with no exceptions and no faster animations. No motion that does not carry
meaning. No motion in the first paint that waits for a library.

## Composition

Full-bleed bands, a measured column inside them, and a shape change between
them: a poster, a ruled form, a plate of lights, a field, a receipt, a
scrubbed chain, a set of limits, a plain list of questions.

The grid is broken twice: the poster overlaps the light behind it, and the
field runs off the right edge of the page.

## Constraints

- Dark only. Light is what a printer gets.
- Every control is at least 44 pixels tall, and a checkbox is a 44 pixel
  target with a 20 pixel drawing on it.
- WCAG AA, and axe clean, on every route.
- 320 pixels and up, reflow without a sideways scroll.
- One label per intent: the download is called "Download the IDE" everywhere.
- No em dash or en dash in a visible string.
- Nothing on the page that the code cannot back: no customer logo, no
  placement rate, no testimonial, no count that is not the shipped manifest.
- Print is a first-class output: the legal documents and the hiring one-pager
  print on paper, with a paper palette and their chrome removed.

## What this site will not do

It will not use the moves the reference designs reach for, and each refusal
has a reason:

- **Shadows and glows.** The surface system declares elevation as a rule and
  a background step. A blur of whatever happens to be behind is the thing
  this house refuses.
- **A custom cursor.** The reader is aiming at a word, not at a picture.
- **A 3D object in the first paint.** The renderer is 700 kilobytes and the
  first screen does not wait for a library. The field is flat, still and a
  few kilobytes, and the rotating one is further down the page.
- **A headline that changes on every visit.** The headline test assigns one
  variant on the server and keeps it, so the page means the same thing twice.
- **A gradient doing the work of a claim.** Depth comes from one pool of
  light under the poster and from the rules; the argument comes from the
  sentences.
