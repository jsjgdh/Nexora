# NEXORA, Petrol Press

This is the design brief for `nexora-svelte`. A later change can be judged
against it instead of against a memory of the last screenshot.

Three worlds are gone. The dark laboratory bench and the austere field manual
both treated the product as a document. The near-white studio that followed
treated it as a brochure about a tool: soft corners, a lift on hover, one
bright action. This world treats it as something printed. Warm bone stock,
warm ink, one deep petrol action, and every surface cut square. It should feel
like a specification sheet someone actually pulled off a press, not like a
screen wearing a theme.

## Purpose and audience

Two readers, in this order.

**The learner.** Someone who can follow a tutorial and still freeze in front of
a blank file. They need a place where their own code is judged, the reason for
a failure is legible, and the record of the work can be checked by a stranger.

**The hiring manager.** Someone who has been promised "job-ready graduates"
before. They will look for one claim they can verify in five minutes, without an
account, and for a vendor willing to say what does not exist yet.

The learner is the default. The hiring manager has `/employers` and one section
on the home page.

## Register

**Confident, technical, plain.** Short sentences. Concrete claims. Evidence
next to the claim. No congratulation, no superlative where a fact will do, no
"journey", no "unlock", no "level up". The product is serious; the design can be
warm without being cute.

## Aesthetic direction

**Petrol Press.** A product-grade technical studio set like a printed sheet.

- Warm bone ground, warm near-black ink, petrol for the one action on a page.
- White sheets with an 8px cut, a hairline, and one tight warm elevation.
- Dark petrol product plates where the editor, terminal and receipt live.
- Each course has an identity colour used on its mark, tag and top rule. That
  colour never paints a button, a link or a verdict.
- Large neo-grotesk headlines, comfortable body copy, a mono face for data.
- Rules and whitespace carry structure; cards are reserved for a thing that is
  actually a unit (a course, a plan, a build item).
- One hand-drawn arrow annotation in the hero, because a human made the page.

**Commitment level: restrained on paper, committed on the plate.** The paper is
tinted neutrals plus one accent, and the accent never exceeds the band it is
allowed. The plate is the one place the surface becomes the colour: a full
petrol room with paper-coloured type. Mixing those two registers inside one
section reads as indecision, so a section is either paper or plate.

**The unforgettable thing: the receipt.** A white slip on warm stock, off by
less than a degree, perforated at the bottom edge, carrying a serial, a hash and
a signature line. It is the only object on the site that pretends to be
physical, and it is the argument: the record exists, it is signed, and anyone
can re-derive it at `/verify`.

What it is not: the dark bench, amber, a serif reading face, glass panels, a
3D field, a scroll rail, a custom cursor, an audience switch, three equal
benefit cards, stock photography, fake testimonials, customer logos, invented
metrics, or a screenshot of software that does not exist.

The product artifacts are the imagery. A product window may be composed from
the shipped manifest and the run transcript, but it is labelled as an
illustration. It is never presented as a screenshot of a published build.

## The order of the home page

1. **The statement.** A two-line headline, a lede, the release-aware action,
   and a real workspace illustration with a phase list, a failing check, the
   same check passing, and a receipt. No eyebrow: the headline is the label.
2. **The capabilities.** Build, Debug, Verify, Grow, in one ruled row with thin
   line marks. Not four cards.
3. **The shelf.** One card per course. Task Manager is featured; Go and Rust
   show both tracks; SQL, Zig and OCaml follow; APIs from the outside is a side
   course; a dark tile leads to the full catalogue. No count of courses.
4. **The gap.** The tutorial problem, in four short lines, ending on the turn.
5. **What you build.** The seven real beats of Task Manager with phase names.
6. **The proof.** The receipt as an object, with a verification path, the stamp,
   and the example label.
7. **The mechanism.** Four properties, each with where it is enforced.
8. **The plate.** The five moves of a phase, in a product window, on petrol.
9. **For hiring.** Three checks with the artefact behind each.
10. **The price.** Free and Pro, real prices, the Pro plan on the plate.
11. **The questions.** Native `<details>`, no numbering.
12. **The close.** A petrol band, the release action, and the launch list only
    when the build is not published.

## The course page contract

**A language is one page.** Go fundamentals and Go in production are two tracks
of `/courses/go`; Rust fundamentals and Rust in production are two tracks of
`/courses/rust`. `TRACK_TO_COURSE` maps every shipped track id to its page, so
the merged page can never invent a route of its own. The catalogue lists one
card per language, not one per track.

Every course page renders, in order:

1. Breadcrumb, language eyebrow, title, promise, release action and "Read the
   phases".
2. A product window built from the manifest: the first track's phases, the
   language, track count, phase count, activity count, free count, and a
   terminal that loads the course.
3. Four stats: phases, activities, free, tracks.
4. What it is, where it is used, and what you build.
5. The phases. Every phase in the track, with its number, title, tier word, the
   manifest's goal and its activity count. Nothing is behind a disclosure. Go and
   Rust show both tracks, each with a jump link and a strong divider.
6. The shape of a phase, in five moves.
7. The record, compact, with the receipt and `/verify`.
8. Previous and next volumes, then a course-specific close.

A course added to the manifest must reach the site through `COURSE_PAGES` and
`COURSES`; no phase name, count or goal is typed in a route.

## Palette

All values are OKLCH tokens in `src/app.css`. Text combinations are checked
against WCAG AA in the verification suite.

| Token | Value | Role |
|---|---|---|
| `--color-ground` | `oklch(97.6% 0.006 85)` | page |
| `--color-panel` | `oklch(99.4% 0.003 85)` | sheet |
| `--color-raised` | `oklch(95.4% 0.009 85)` | inset band |
| `--color-raised-2` | `oklch(92.2% 0.013 85)` | deeper band |
| `--color-ink` | `oklch(22% 0.018 60)` | reading text |
| `--color-muted` | `oklch(44% 0.017 60)` | second voice |
| `--color-faint` | `oklch(49% 0.015 60)` | third voice, AA at 12px |
| `--color-rule` | `oklch(88.5% 0.01 80)` | hairline |
| `--color-rule-strong` | `oklch(78% 0.014 80)` | structural rule |
| `--color-control` | `oklch(55% 0.02 80)` | field boundary |
| `--color-accent` | `oklch(45% 0.09 210)` | petrol, action only |
| `--color-accent-strong` | `oklch(38% 0.085 210)` | pressed |
| `--color-accent-soft` | `oklch(95% 0.02 210)` | tinted band |
| `--color-accent-bright` | `oklch(66% 0.085 210)` | petrol action on the plate only |
| `--color-on-accent` | `oklch(99% 0.003 85)` | text on petrol |
| `--color-screen` | `oklch(22% 0.02 215)` | product plate |
| `--color-screen-2` | `oklch(26% 0.022 215)` | plate step |
| `--color-screen-ink` | `oklch(96% 0.005 85)` | plate text |
| `--color-screen-muted` | `oklch(74% 0.012 85)` | plate annotation |
| `--color-screen-rule` | `oklch(36% 0.02 215)` | plate boundary |
| `--color-screen-glow` | `oklch(30% 0.06 215)` | the plate tint, always mixed over `screen` |
| `--color-pass` | `oklch(47% 0.115 155)` | passed check, free marker |
| `--color-fail` | `oklch(50% 0.19 27)` | failed check, destructive |
| `--color-pass-screen` | `oklch(80% 0.15 155)` | passed check on petrol |
| `--color-fail-screen` | `oklch(74% 0.17 27)` | failed check on petrol |
| `--color-go` | `oklch(50% 0.1 205)` | Go identity |
| `--color-rust` | `oklch(52% 0.15 48)` | Rust identity |
| `--color-zig` | `oklch(60% 0.13 88)` | Zig identity |
| `--color-ocaml` | `oklch(50% 0.15 305)` | OCaml identity |
| `--color-sql` | `oklch(47% 0.125 255)` | SQL identity |
| `--color-api` | `oklch(48% 0.11 160)` | API identity |
| `--color-script` | `oklch(55% 0.13 80)` | Task Manager identity |

Rules:

- Petrol is the only action hue. A link, a button, a focus ring, an active nav
  mark. It is not a background for a whole section except the close and the
  plate. On the plate the action steps up to `--color-accent-bright`, the one
  token that exists only for the dark room and never appears on paper.
- Course colours are identity, not status. They may tint a mark, a tag border,
  a top rule and a decorative dot. They never colour an action.
- Pass green and fail red mean a verdict. Green also marks a free phase, because
  free access is a fact worth seeing. They never decorate. On the petrol plate
  the two verdicts step up to `--color-pass-screen` and `--color-fail-screen`,
  which are the same meanings at a contrast that clears AA on the dark ground.
- No gradient except a subtle radial tint behind a product area or a closing
  band, and the paper edge of the receipt. On the plate that tint is
  `--color-screen-glow` mixed over `screen`; on paper it is `--color-accent-soft`
  or a course colour at a low mix. There is no third kind, and no plate carries
  a petrol of its own.
- Every neutral is tinted toward the warm hue, from 0.005 chroma upward. On
  screen there is no pure white and no pure black anywhere. Print is the one
  exception and only because paper is the medium: the print sheet is white
  stock and prints white, which is why the `@media print` block redefines the
  ground rather than inheriting the screen's bone.

## Typography

- **Display and text: Instrument Sans.** 700 for display, 400 to 600 for text.
  Roman only: no serif token, and no italic face is served at all. Emphasis is
  weight, the accent colour, or a drawn underline.
- **Data: JetBrains Mono.** Tabular numerals for phases, counts, commands,
  hashes, serials.
- The display scale is four tokens and a route picks one of them. It never
  writes a clamp of its own, which is why a title cannot drift from page to
  page again:
  - `--text-hero` `clamp(3rem, 6.6vw, 5.5rem)` — the front door statement.
  - `--text-page` `clamp(2.5rem, 5.4vw, 4.5rem)` — every page title.
  - `--text-section` `clamp(1.9rem, 3.6vw, 3rem)` — section heads and the
    footer's closing line.
  - `--text-band` `clamp(2.1rem, 4.6vw, 3.8rem)` — a title that sits on the
    plate or closes a band.
- `.display-tight` is the one step tighter than the scale, `line-height: 0.96`
  at `-0.045em`, reserved for the two-line hero statement and never for a
  wrapped heading.
- Display line-height `1.02`, tracking `-0.035em`; headings inside a page
  `1.1` at `-0.02em`.
- Body: 17px on 1.62; reading measures 46ch to 62ch; captions 56ch; display
  15ch to 22ch.
- Data labels: 8px to 11px mono at `0.12em`, uppercase only where it is a
  label. Never set a paragraph in mono.

## Shape, layout and depth

- Container 1320px, 12-column thinking, asymmetric splits. No centred hero.
- Section rhythm `clamp(4.5rem, 8vw, 7rem)`; internal rhythm 4px to 32px.
- Radii, and this is the whole scale: sheets and product windows 8px; inputs,
  small panels and the wordmark plate 4px; chips, tags, filters and actions 4px;
  rules square. Round is reserved for what genuinely is a dot or a ring: a
  status lamp, a bullet, a decorative orbit. No container is a pill.
- Elevation: one tight warm shadow for sheets, one deeper for product windows,
  one petrol glow for the primary action. The shadow is tinted by the ink the
  surface sits on and is pulled in close; no grey bloom under a white box.
- One surface step is also allowed (sheet on ground, raised band on sheet).
- Sticky header is a masthead, two rows: 48px for the name, then the 44px
  destination row, 93px with the rule. It does not change height; the edge
  beneath the masthead's own hairline inks in on scroll, so the pair closes as
  a double rule.

## Chrome

**Header.** An N6 masthead rather than a bar. The wordmark is centred on the
first row, flanked at 1280px and above by the two edition lines `MASTHEAD`
prints (the descriptor, and the shipped counts, both computed from the
manifest); a full-bleed rule separates that row from the destinations, which
sit centred beneath it, and a double rule closes the block. Courses, How it
works, Proof, Pricing, For hiring, Sign in, release-aware action. The Courses
menu is a real disclosure listing one row per course with its mark and counts;
Escape and outside click close it. Below 1024px the destination row is gone
and it becomes a native `<dialog>` with the same links and the full course
list.

**Footer.** One closing statement, the release note and action, then an index:
Courses, Product, For, Documents. A colophon line. No newsletter unless it is
the real launch list; no social icons that do not exist.

**Labels.** One label per intent. Primary action is always `release.label`
("Download the IDE" or "Get the IDE when it ships"). The catalogue action is
"All courses"; the course-page action is "Read the phases". Sign-in is always
"Sign in".

## Components and states

Every component is a deliberate unit, not a default box.

- **ActionLink / Button.** A cut chip, 48px target, 14px semibold, optional
  trailing arrow. Default, hover (lift and darken), focus (2px petrol ring,
  instant), active (settle), disabled (50% and no pointer), busy (`aria-busy`).
  The inverse variant is for the petrol band and the plate only.
- **Course card.** Accent top rule, mark, tag, title, promise, track list or
  phase preview, counts, arrow. Hover lifts 3px, deepens the shadow and moves
  the arrow. It is a link, so the whole card is clickable; focus rings the card.
- **Course mark.** One neutral specimen plate, sized by `--mark-size` and
  derived from it (padding, radius, type). Five courses carry official artwork:
  JavaScript, Rust, Zig, OCaml, and the Go gopher, which is the permitted Go
  mark. SQL and API use their letters because they have no official mark. The
  plate is hidden from assistive technology because the course title is always
  beside it. The footer carries the licences and sources for every third-party
  mark.
- **Phase row.** Number, title, tier word, goal, activity count. Static, not
  clickable, so there is no hover affordance. Tier is text plus a green dot for
  free, never colour alone.
- **Product window.** A petrol card with a bar, a phase rail, the lesson or
  manifest, and a terminal. It is an illustration and says so. It is not fake
  browser chrome: no URL bar, no traffic lights pretending to be a browser, and
  no invented working directory. The terminal's head is a typographic rule with
  a mono label under it, which is a label and not a window bar.
- **Receipt.** White on paper in the home proof section; petrol in the course
  record strip. Same data, different ground. Off-square by less than a degree.
  Always labelled an example.
- **Form fields.** 4px radius, 44px minimum, visible label, focus border and
  petrol ring, error text in fail ink, no placeholder as the only label. Every
  form uses the shared `.field-label` and `.field-input` classes rather than
  utilities of its own.
- **FAQ.** Native `<details>`, 48px summary, plus rotates to a cross. No custom
  ARIA tree.

## Motion

The lens is **restraint on the product surfaces, polish on the front door**, and
neither is ever allowed to delay a sentence.

- One hero entrance: copy and product window fade and rise, CSS only, settled
  state visible without JavaScript.
- Cards and sections reveal once when they enter the viewport, staggered 55ms
  to 60ms. The hidden state exists only under `.js`. Four surfaces reveal on
  scroll; a fifth means the budget is spent.
- Hover: 180ms to 320ms, custom cubic-bezier. Arrows translate 2px to 3px.
- Page transitions between documents via the View Transitions API.
- Reduced motion settles everything immediately and never hides content.
- No scroll hijack, no scrub, no 3D, no magnetic controls, no infinite loops,
  no custom cursor, no marquee.

## Responsive

- Breakpoints: 640, 720, 768, 900, 980, 1024, 1080, 1280.
- 320 / 375 / 414: one column, 20px page padding, hero headline two or three
  lines, actions full width where they would wrap awkwardly, product window
  hides its left rail, phase list one column, cards one column.
- 768: two-column cards and phase lists.
- 1024: desktop navigation, two-column hero and two-column auth.
- 1080: three-column course grid.
- No horizontal scroll at any width. Grid tracks use `minmax(0, 1fr)`.

## Truth rules

- The download label is a function of `PUBLIC_IDE_DOWNLOAD_URL`. Never "start
  free" over a build that does not exist; never a static label.
- Phase names, goals, activity counts, tier words and counts come from the
  shipped manifest. Nothing is typed into a route.
- Never print a count of courses.
- No invented testimonial, logo, placement rate, salary, time estimate,
  difficulty score or metric.
- No em dash, en dash, exclamation mark or emoji in visible copy.
- A product illustration is labelled. A receipt is labelled an example. No
  claim is made about a build that is not published.

## Third-party marks

- A course mark is either the project's own published mark or the course's
  letters. It is never a redrawn, recoloured or cropped logo.
- JavaScript (MIT), Rust (CC BY 4.0), Zig (CC BY-SA 4.0), OCaml (public
  domain) and the Go gopher by Renee French (CC BY 4.0) use official artwork
  inside the neutral specimen plate. The gopher is cropped to its face so it
  reads at 30px, and the credit says so. The Go graphic logo is not used,
  because its brand rules restrict it on a commercial site. SQL and APIs have
  no official mark and use plain type.
- Attribution and licence links live in the footer credits. The source files
  and full licence texts are in `design-assets/logos/`; only the four marks
  that are actually rendered are copied to `static/logos/`.
- If a project changes its terms, remove its file and fall back to the letters.
  The course still works without the mark.

## Accessibility and print

- 2px petrol focus ring, 2px offset, instant. Skip link first in the document.
- 44px minimum targets; 48px for primary actions.
- Text combinations meet WCAG AA; the verification suite parses the tokens.
- Every form has a visible label, a described error and a status region.
- Without JavaScript: h1, lede, actions, course cards, phase lists, FAQ answers
  and the product windows are in the server-rendered document.
- Print: employer and legal sheets drop the chrome and forms, keep the address,
  and print in black on warm-neutral ink on white.

## Refusals

Do not add: a dark mode that reintroduces the bench; an audience switch; a
search that does not search; a newsletter that does not exist; a logo wall; a
testimonial carousel; a bento grid of invented metrics; a second accent; a new
radius; a new font; a pill container; a card for every paragraph; an animation
that delays the content; a page per track; a 3D hero; a grain or noise overlay;
a velocity marquee; a custom cursor; purple gradients on white.

The measure of this world is simple: every claim has an artefact, every colour
has a job, every corner is cut square, and every component would still make
sense if the page were printed.
