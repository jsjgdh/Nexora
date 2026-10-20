# The front door, as a brief

The design brief for `nexora-svelte`. It exists so that a later change can be
judged against something written down, instead of against a memory of what the
page used to look like.

This brief was rewritten when the front door was rebuilt around the learner's
experience rather than around the product's argument. What changed is stated
below, and the reasons are given, because a brief that only describes the
current state cannot tell the next person what was tried and rejected.

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

The learner is the default and the homepage is written for them. The hiring
manager has their own document at `/employers`, and the homepage's hiring
section is a summary that points there.

## Register

**Brand**, with a product's rigour. The design is the argument, so it is
built to be looked at; but every claim it makes is one the code can back, so it
is built to be checked.

## Aesthetic direction

**Laboratory instrumentation.** One extreme, committed: this is a bench, not a
lounge. A dark ground ruled like a measuring surface, hairlines instead of
borders, one amber that means "an action", a mono face for every reading, and
a serif that appears only where a person is reading prose.

What that rules out: soft shadows (elevation is a rule and a background step,
never a blur), large radii (the corner is a cut corner, as on a plate),
card grids, decorative icons, stock photography, and any colour that is not
doing a job.

This direction survived the rebuild. It was never the problem. The problem was
that the page applied it evenly: every section had the same weight, the same
measure and the same type size, so a page with sixteen sections read as one
long document. The rebuild changed the order and the hierarchy, not the world.

## The order of the page

The old front door led with the argument. The market research came first, then
the datasheet, then the categories, then the refusals, and the experience was
somewhere near the bottom. A reader who had not yet understood the product was
asked to agree with its principles before they had seen what it does.

The order now is the argument, in the order a reader needs it:

1. **The poster.** What it is, and one action that is true today.
2. **What this is, and where it stands.** The release state and where the
   product runs.
3. **A real phase.** The shipped manifest, read: a phase, its goal, its
   activities, and the shape every phase has.
4. **What a phase is.** Learn, then Solve, then Review, which is the shipped
   manifest's own sentence.
5. **Most learning stops before the building starts.** The gap, in the
   learner's words.
6. **One app, from an empty folder to a reviewed pull request.** What they end
   up holding, and the other lines behind it.
7. **What makes the experience different.** The benefits.
8. **How a verdict earns trust.** The datasheet, the receipt chain, the
   disclosure about what can be re-derived, and the refusals, said once.
9. **The curriculum.** The readings, the field, and the way into the full list.
10. **For the people who hire.** The other reader.
11. **The questions, answered plainly.**
12. **The close.** One action again, and the way to be told when it changes.

A section earns its place by being the only place that says its thing. The
market research and the categories moved to `/employers`, where they are
context for the reader who came for them. The exhaustive phase list moved to
`/courses`, because a homepage that prints eighty names before it has said
what the product does is a catalogue.

## The unforgettable thing

**The receipt.** A slip of paper that says what ran, what it judged, what
failed, why, and how long it took, with a hash and a signature, which any
stranger can re-derive at `/verify`. It is the product's artefact, it is the
thing the whole site is arguing for, and it is the only picture of the
product that is not a screenshot of a screen that does not exist yet.

**The phase.** Above it, near the top of the page, a panel that shows one
phase of the shipped course: its real name, the manifest's own sentence about
what it is for, how many activities it holds, and the four steps every phase
has. It is not a drawing of the IDE. It reads the manifest, so it cannot fall
out of step with what the IDE ships, and a reader who never sees the picture
still gets the whole curriculum from the list beside it.

Behind it, in the courses section, **the field**: the eighty shipped phases
as eighty points in space, one arm of one spine for each of the courses,
every point the same ink, because a public page does not put a price on a
phase. It is the same data the ledger prints, read a third way.

## What is true today

There is one switch, `PUBLIC_IDE_DOWNLOAD_URL`, and it decides whether a
desktop build is published. The server reads it once, in
`+layout.server.ts`, and the answer travels with the page.

The label follows the state: a build means "Download the IDE", and no build
means "Get the IDE when it ships". There is no third label, and no surface is
allowed to write its own, because a page that says "try it free" over a build
that is not published is lying with a button.

The release state is a fact about the world, and it is written down in one
place (`$lib/release.ts`) so that the hero, the header, the footer, the
download page and the pricing page cannot disagree about it.

## How many courses there are

**Never written.** The courses are named, always, and the number of them is
never printed: a count of courses reads as a count of videos, and it is a
number that changes. That covers both orders, because "five courses" and
"course five" are the same mistake, and the second one is the way it sneaks
in, since an ordering reads like a fact rather than like a statistic.

So the site has no course count to go stale, and a course added in the IDE
reaches the page by way of the sync:

- The list of courses is the shipped list. `COURSES` carries the editorial
  title and line for each, and the suite compares it against the manifest, so
  a course that ships and is not on the page fails the build.
- The lines the homepage prints about the courses after the first are derived
  from that list. A course we have written something about is printed with
  what we wrote; a course we have not is printed with the shipped list's own
  line for it.
- The curriculum sentence and the answer to "what is actually in the
  curriculum" name every course and its depth, computed from the shipped
  phase lists.
- The course labels carry no ordering.

The same rule applies to the numbers that *are* printed, because a typed-in
number is a number that goes stale the day after a course is added. The
masthead's status line, the readings on the bench, the free-tier sentences,
the depth of the flagship course and the closing sentence are all computed
from the shipped phase list. The copy module is not allowed to contain a
literal count of phases or of courses at all, and the suite fails if one
appears.

What *is* allowed is a number that is a fact about the product rather than a
count of the curriculum: no badges, no scores, one editor. Those are true
whatever the curriculum does.

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

Two measures, and they are not the same. A heading is a poster line and is
allowed a wide measure, so it runs to two lines rather than five. A caption is
prose and is held to about sixty characters. The container is wide and the
caption narrows itself inside it, because a measure computed in characters of
the body face would break a display line into a block of fragments.

The body is set at 16.5px on a 1.66 line. The previous build set it at 15.5px
on 1.62, and the result was a page that was legible but thin: the copy read as
a label strip rather than as sentences. The raised size is the single biggest
readability change in this rebuild.

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
them: a poster, a strip of readings, a panel, a run, three columns, a ruled
run of beats, a datasheet, a scrubbed chain, a plate of lights, a field, a
set of limits, a plain list of questions.

The grid is broken twice: the poster overlaps the light behind it, and the
field runs off the right edge of the page.

## Constraints

- Dark only. Light is what a printer gets.
- Every control is at least 44 pixels tall, and a checkbox is a 44 pixel
  target with a 20 pixel drawing on it.
- WCAG AA, and axe clean, on every route.
- 320 pixels and up, reflow without a sideways scroll.
- One label per intent: the download is called the same thing everywhere, and
  the label is the release state's.
- No em dash or en dash in a visible string.
- Nothing on the page that the code cannot back: no customer logo, no
  placement rate, no testimonial, no count that is not the shipped manifest.
- Print is a first-class output: the legal documents and the hiring one-pager
  print on paper, with a paper palette and their chrome removed. The hiring
  sheet drops the form and the market context, so the sheet on paper is still
  one sheet.
- The curriculum the site prints is the manifest the IDE ships. The phase
  list, the goals and the activity counts are generated from the manifests and
  the suite fails if they drift.

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
- **A count of courses.** The curriculum is named, never counted. A count of
  courses reads as a count of videos.
- **A phase the IDE does not ship.** Every phase on the site is read from the
  shipped manifest, and the suite compares them one by one.
