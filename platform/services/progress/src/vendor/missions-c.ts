import type { Mission } from "./types.js";

/* Stage 2: CSS Foundations — assessed with stylesheet-text rules plus live
   computed-style observations from the sandboxed preview (scripts blocked).
   Authoring rules honored throughout:
   - computed checks only assert values browsers DON'T resolve (display,
     flex-direction, px spacing, rgb() colors) — never fr/percent/auto.
   - anything viewport-dependent (@media) is assessed via stylesheet text. */

const MINT_RGB = "85,\\s*230,\\s*193"; // #55e6c1
const INK_RGB = "16,\\s*22,\\s*29"; // #10161d
const PANEL_RGB = "24,\\s*34,\\s*43"; // #18222b
const SALMON_RGB = "250,\\s*128,\\s*114"; // #fa8072

const SKELETON = (title: string, body: string) =>
  `<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <title>${title}</title>\n    <style>\n      /* TODO: write your CSS here */\n    </style>\n  </head>\n  <body>\n${body}\n  </body>\n</html>\n`;

export const MISSIONS_C: Mission[] = [
  {
    id: "css-selectors",
    stageId: "css",
    title: "Selectors & the cascade",
    tagline: "Target elements precisely — classes beat cleverness.",
    type: "practice",
    difficulty: 1,
    estMinutes: 15,
    objectives: [
      "Style elements, classes, and IDs with CSS selectors",
      "Predict which rule wins using specificity basics",
      "Keep presentation out of the HTML",
    ],
    prereqIds: ["personal-website"],
    competencyIds: ["css-layout"],
    whyItMatters:
      "Every redesign you'll ever do is 90% re-targeting selectors. Precise selectors mean you change one rule — not forty lines of HTML.",
    lesson: [
      {
        kind: "prose",
        body: "CSS is a list of **rules**. Each rule has a **selector** (what to style) and declarations (how): `h1 { color: salmon; }`.\n\n- `h1` — **element** selector: every h1.\n- `.tag` — **class** selector: anything with `class=\"tag\"`. Reusable. Prefer these.\n- `#name` — **ID** selector: one unique element. Powerful but rigid.\n\nWhen rules collide, the **more specific** selector wins: ID beats class beats element. Equal specificity? The **later** rule wins.",
      },
      {
        kind: "example",
        body: "The whole mission in three rules:",
        code: "h1 { color: #fa8072; }\n.card { background: #18222b; padding: 16px; }\n.tag { background: #55e6c1; color: #10161d; }",
      },
      {
        kind: "task",
        body: "In the `<style>` block: make the `<h1>` **salmon** (`#fa8072`), give `.card` a dark **panel background** (`#18222b`), and style `.tag` as a mint (`#55e6c1`) pill with dark text. Then **Check**.",
      },
    ],
    starterCode: SKELETON(
      "Profile card",
      `    <article class="card">\n      <h1>Ada Lovelace</h1>\n      <p>First programmer. <span class="tag">analytical engines</span></p>\n    </article>`
    ),
    checks: [
      {
        id: "heading-color",
        label: "The heading is salmon (#fa8072)",
        feedback:
          "The h1 isn't salmon yet. Add a rule like h1 { color: #fa8072; } in the <style> block.",
        rule: { kind: "computed-style", selector: "h1", property: "color", pattern: SALMON_RGB },
      },
      {
        id: "card-bg",
        label: "The card has the dark panel background",
        feedback:
          "The .card background isn't #18222b. Target the class: .card { background: #18222b; }.",
        rule: { kind: "computed-style", selector: ".card", property: "background-color", pattern: PANEL_RGB },
      },
      {
        id: "tag-pill",
        label: "The tag uses the mint accent with dark text",
        feedback:
          "The .tag needs background #55e6c1 and color #10161d. Classes are reusable — that's why we prefer them over IDs here.",
        rule: { kind: "computed-style", selector: ".tag", property: "background-color", pattern: MINT_RGB },
      },
    ],
    hintLadder: [
      "Which selector targets a class? Look at the example's three rules and match each to its element.",
      "h1 styles the heading, .card styles the article, .tag styles the span. Colors: #fa8072, #18222b, #55e6c1.",
      "Write three rules in <style>: h1 { color: #fa8072; }, .card { background: #18222b; }, .tag { background: #55e6c1; color: #10161d; }.",
      "If a rule seems ignored, check spelling of the selector and that it's inside the <style> block — then press Run before Check.",
      "Solution shape is the three rules above. Transfer: add a second .tag and confirm both change from the single rule — that's the class advantage.",
    ],
    misconceptions: [
      "Styling with IDs everywhere — high specificity that can't be reused or overridden cleanly.",
      "Reaching for !important to win a specificity fight — a loan shark for stylesheets.",
      "Putting style=\"...\" attributes in HTML — unmaintainable past three elements.",
    ],
    completionNote: "You target elements, classes, and IDs with intention.",
    masteryNote: "Selector thinking is precise with minimal help.",
  },
  {
    id: "css-box-model",
    stageId: "css",
    title: "The box model",
    tagline: "Padding in, border around, margin out.",
    type: "practice",
    difficulty: 2,
    estMinutes: 20,
    objectives: [
      "Control padding, border, and margin independently",
      "Use box-sizing: border-box to end width surprises",
      "Debug spacing with directional properties",
    ],
    prereqIds: ["css-selectors"],
    competencyIds: ["css-layout"],
    whyItMatters:
      "“Why is there a gap?” and “why is it overflowing?” are box-model questions. This mental model answers half of all CSS debugging.",
    lesson: [
      {
        kind: "prose",
        body: "Every element is a box of four layers, outside in:\n\n- **margin** — space *outside*, separating from neighbors.\n- **border** — the edge itself.\n- **padding** — space *inside*, between border and content.\n- **content** — the text or image.\n\nThe classic trap: `width: 200px` + `padding: 20px` = **240px** wide. Fix it globally with `box-sizing: border-box`, which folds padding and border *into* the declared width.",
      },
      {
        kind: "example",
        body: "A box with breathing room inside and separation outside:",
        code: "* { box-sizing: border-box; }\n.box {\n  padding: 24px;\n  border: 2px solid #55e6c1;\n  margin-bottom: 16px;\n}",
      },
      {
        kind: "task",
        body: "Style both `.box` elements: **24px padding**, a **2px solid mint border**, **16px bottom margin**, and set **`box-sizing: border-box`** so widths stay honest. Then **Check**.",
      },
    ],
    starterCode: SKELETON(
      "Boxes",
      `    <div class="box">\n      <h2>Box one</h2>\n      <p>Padding keeps content off the border.</p>\n    </div>\n    <div class="box">\n      <h2>Box two</h2>\n      <p>Margin separates me from box one.</p>\n    </div>`
    ),
    checks: [
      {
        id: "padding",
        label: "Boxes have 24px padding",
        feedback:
          "Computed padding-top isn't 24px. Add padding: 24px to the .box rule.",
        rule: { kind: "computed-style", selector: ".box", property: "padding-top", pattern: "^24px$" },
      },
      {
        id: "border",
        label: "Boxes have a 2px border",
        feedback:
          "No 2px border detected. Add border: 2px solid #55e6c1 to .box.",
        rule: { kind: "computed-style", selector: ".box", property: "border-top-width", pattern: "^2px$" },
      },
      {
        id: "margin",
        label: "Boxes are separated by 16px margin",
        feedback:
          "margin-bottom isn't 16px. Space *between* boxes is margin's job, not padding's.",
        rule: { kind: "computed-style", selector: ".box", property: "margin-bottom", pattern: "^16px$" },
      },
      {
        id: "border-box",
        label: "box-sizing: border-box is set",
        feedback:
          "No box-sizing: border-box found. Set it (the * selector is fine here) so padding stops breaking widths.",
        rule: { kind: "style-text-match", pattern: "box-sizing\\s*:\\s*border-box" },
      },
    ],
    hintLadder: [
      "Inside or outside? Padding is inside the border, margin is outside. Which property does each failing check name?",
      "One .box rule holds all three: padding: 24px; border: 2px solid #55e6c1; margin-bottom: 16px; — plus the box-sizing line.",
      "Directional longhands (padding-top etc.) also work, but the shorthand is shorter. The computed check reads the final value either way.",
      "Compare your .box rule line-by-line with the example. Missing semicolons silently eat the next declaration.",
      "Solution shape is the example's four declarations. Transfer: inspect any site's boxes in devtools and read the box-model diagram — fluency there pays off forever.",
    ],
    misconceptions: [
      "Padding to separate two elements — margin is the outside voice.",
      "width + padding overflowing — border-box exists precisely for this.",
      "Margin on first/last children leaking out — collapsing margins strike again.",
    ],
    completionNote: "You control all four box layers deliberately.",
    masteryNote: "Box-model fluency with minimal help.",
  },
  {
    id: "css-flexbox",
    stageId: "css",
    title: "Flexbox in action",
    tagline: "Rows, gaps, and wrapping — layout that flexes.",
    type: "build",
    difficulty: 2,
    estMinutes: 25,
    objectives: [
      "Lay out rows with display: flex",
      "Space items with gap instead of margins",
      "Wrap gracefully with flex-wrap",
    ],
    prereqIds: ["css-box-model"],
    competencyIds: ["css-layout"],
    whyItMatters:
      "Navbars, card rows, toolbars, form lines — one-dimensional layouts are Flexbox territory, and they cover most of the web's components.",
    lesson: [
      {
        kind: "prose",
        body: "Make an element a **flex container** and its children line up along an axis:\n\n- `display: flex` — children become a row (the default `flex-direction: row`).\n- `gap: 16px` — even gutters between items. No first/last-child margin hacks.\n- `flex-wrap: wrap` — items flow onto new lines instead of overflowing.\n\nAxis alignment (`justify-content`, `align-items`) distributes leftover space — you'll feel it once rows exist.",
      },
      {
        kind: "example",
        body: "A nav and a wrapping card row:",
        code: "nav { display: flex; gap: 16px; }\n.cards { display: flex; flex-wrap: wrap; gap: 16px; }",
      },
      {
        kind: "task",
        body: "Lay out the page: the `<nav>` becomes a **flex row with 16px gap**, and `.cards` becomes a **flex row that wraps**, also with **16px gap**. Then **Check**.",
      },
    ],
    starterCode: SKELETON(
      "Flexbox",
      `    <nav>\n      <a href="index.html">Home</a>\n      <a href="about.html">About</a>\n      <a href="projects.html">Projects</a>\n    </nav>\n    <section class="cards">\n      <article class="card">Alpha</article>\n      <article class="card">Beta</article>\n      <article class="card">Gamma</article>\n      <article class="card">Delta</article>\n    </section>`
    ),
    checks: [
      {
        id: "nav-flex",
        label: "Navigation is a flex row",
        feedback:
          "The nav isn't display: flex. Links stack vertically until you make their parent a flex container.",
        rule: { kind: "computed-style", selector: "nav", property: "display", pattern: "^flex$" },
      },
      {
        id: "cards-flex",
        label: "Cards sit in a flex row",
        feedback:
          ".cards isn't display: flex. The container — not the cards — gets the display rule.",
        rule: { kind: "computed-style", selector: ".cards", property: "display", pattern: "^flex$" },
      },
      {
        id: "cards-wrap",
        label: "Cards wrap instead of overflowing",
        feedback:
          "flex-wrap isn't wrap on .cards. Narrow the preview: without wrap, the row overflows.",
        rule: { kind: "computed-style", selector: ".cards", property: "flex-wrap", pattern: "^wrap$" },
      },
      {
        id: "gap",
        label: "Rows use gap for spacing",
        feedback:
          "No gap found on .cards. gap replaces the old margin-on-every-item dance.",
        rule: { kind: "style-text-match", pattern: "\\.cards\\s*\\{[^}]*gap\\s*:\\s*16px" },
      },
    ],
    questions: [
      {
        id: "f1",
        prompt: "A flex container holds five wide cards and flex-wrap is NOT set. The viewport narrows. What happens?",
        options: [
          "Cards wrap onto new lines automatically",
          "Cards shrink if possible, otherwise overflow the container",
          "Cards stack vertically",
          "The container grows taller to fit",
        ],
        answer: 1,
        explanation:
          "Flex items shrink by default but never wrap unless flex-wrap: wrap is set — overflow is the silent default.",
      },
    ],
    hintLadder: [
      "Which element gets display: flex — the items, or their parent?",
      "nav { display: flex; gap: 16px; } and .cards { display: flex; flex-wrap: wrap; gap: 16px; } — the pattern is container-first.",
      "The gap check reads your stylesheet text: it wants gap: 16px literally inside the .cards rule.",
      "Press Run, then narrow the preview panel: wrapping should kick in. If not, flex-wrap is missing or misspelled.",
      "Solution shape is the two example rules. Transfer: remove flex-wrap and watch the overflow — knowing the default is the lesson.",
    ],
    misconceptions: [
      "Putting display: flex on the items — the container establishes the context.",
      "Margin hacks for gutters — gap is simpler and symmetric.",
      "Assuming wrap is default — nowrap is, and it overflows silently.",
    ],
    completionNote: "Your rows flex, gap, and wrap on purpose.",
    masteryNote: "Flexbox container-thinking with minimal help.",
  },
  {
    id: "css-grid",
    stageId: "css",
    title: "Grid dashboards",
    tagline: "Two-dimensional layout with explicit tracks.",
    type: "build",
    difficulty: 3,
    estMinutes: 25,
    objectives: [
      "Define grid tracks with grid-template-columns",
      "Span items across tracks",
      "Choose Grid for 2D layout, Flexbox for 1D rows",
    ],
    prereqIds: ["css-flexbox"],
    competencyIds: ["css-layout"],
    whyItMatters:
      "Dashboards, galleries, page shells — when alignment must hold in *both* directions, Grid's explicit tracks beat nested flex hacks.",
    lesson: [
      {
        kind: "prose",
        body: "`display: grid` turns children into items placed on **tracks** you define:\n\n- `grid-template-columns: 200px 1fr` — a fixed 200px sidebar track plus a flexible `1fr` track that drinks the remaining space.\n- `grid-column: 1 / -1` — span from the first line to the last: full width.\n- `gap` works here too — same gutters, both axes.\n\nRule of thumb: **one direction → Flexbox; two directions → Grid.**",
      },
      {
        kind: "example",
        body: "A sidebar shell with a full-width header:",
        code: ".dashboard {\n  display: grid;\n  grid-template-columns: 200px 1fr;\n  gap: 16px;\n}\n.topbar { grid-column: 1 / -1; }",
      },
      {
        kind: "task",
        body: "Build the shell: `.dashboard` becomes a **grid** with **`200px 1fr` columns** and **16px gap**; `.topbar` **spans all columns**. Then **Check**.",
      },
    ],
    starterCode: SKELETON(
      "Dashboard",
      `    <div class="dashboard">\n      <header class="topbar">Dashboard</header>\n      <aside class="sidebar">Nav</aside>\n      <main class="content">Charts go here</main>\n    </div>`
    ),
    checks: [
      {
        id: "grid-on",
        label: "The dashboard is a grid",
        feedback:
          ".dashboard isn't display: grid. Tracks only exist inside a grid container.",
        rule: { kind: "computed-style", selector: ".dashboard", property: "display", pattern: "^grid$" },
      },
      {
        id: "tracks",
        label: "Columns are 200px + flexible",
        feedback:
          "grid-template-columns should be exactly 200px 1fr — fixed sidebar, fluid content. (Checked in your stylesheet: computed tracks resolve fr to pixels.)",
        rule: { kind: "style-text-match", pattern: "grid-template-columns\\s*:\\s*200px\\s+1fr" },
      },
      {
        id: "span",
        label: "The topbar spans all columns",
        feedback:
          ".topbar should span the full width with grid-column: 1 / -1.",
        rule: { kind: "style-text-match", pattern: "\\.topbar\\s*\\{[^}]*grid-column\\s*:\\s*1\\s*/\\s*-1" },
      },
      {
        id: "gap-grid",
        label: "Tracks are separated by gap",
        feedback:
          "Add gap: 16px to .dashboard — one property gutters both axes.",
        rule: { kind: "style-text-match", pattern: "\\.dashboard\\s*\\{[^}]*gap\\s*:\\s*16px" },
      },
    ],
    hintLadder: [
      "Which rule creates tracks, and which makes an item span them? The example has both.",
      ".dashboard needs display: grid, the columns line, and gap. .topbar needs the grid-column span.",
      "fr values resolve to pixels in computed style — that's why the tracks check reads your stylesheet text, not the rendered value.",
      "Line numbers: 1 is the left edge, -1 the right edge. grid-column: 1 / -1 means 'everything'.",
      "Solution shape is the three example rules. Transfer: change 200px to 280px and predict the content track — fr thinking is the takeaway.",
    ],
    misconceptions: [
      "Reading grid-template-columns from computed style — fr resolves to px; author intent lives in the stylesheet.",
      "Nesting three flexboxes for a 2D shell — Grid says it in three lines.",
      "Fixed pixel columns everywhere — 1fr is how layouts survive unknown widths.",
    ],
    completionNote: "Your dashboard holds alignment in both directions.",
    masteryNote: "Grid track-thinking with minimal help.",
  },
  {
    id: "css-responsive",
    stageId: "css",
    title: "Responsive pages",
    tagline: "One stylesheet, every screen — via media queries.",
    type: "build",
    difficulty: 3,
    estMinutes: 30,
    objectives: [
      "Write a max-width media query that stacks columns",
      "Make images fluid with max-width: 100%",
      "Include the viewport meta tag",
    ],
    prereqIds: ["css-grid"],
    competencyIds: ["css-layout", "html-structure"],
    whyItMatters:
      "Most web traffic is mobile. A layout that only works at desktop width is broken for most of its audience.",
    lesson: [
      {
        kind: "prose",
        body: "Responsive design is **conditional CSS**: rules that apply only when the viewport matches.\n\n- `@media (max-width: 640px) { … }` — everything inside applies on narrow screens. Desktop-first: design wide, then override narrow.\n- Inside, **stack** the columns: `.layout { flex-direction: column; }`.\n- Images go fluid: `img { max-width: 100%; height: auto; }` — never wider than their container.\n- None of it matters without `<meta name=\"viewport\" …>` telling mobile browsers the viewport is the device width.",
      },
      {
        kind: "example",
        body: "Stack below 640px and fluid images:",
        code: "img { max-width: 100%; height: auto; }\n@media (max-width: 640px) {\n  .layout { flex-direction: column; }\n}",
      },
      {
        kind: "task",
        body: "Make the product page responsive: **viewport meta** in `<head>`, **fluid images**, and a **`640px` media query** that **stacks `.layout` vertically**. Test by narrowing the preview. Then **Check**.",
      },
    ],
    starterCode:
      "<!DOCTYPE html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <title>Responsive product page</title>\n    <style>\n      .layout { display: flex; gap: 24px; }\n      .gallery { flex: 1; }\n      .details { flex: 1; }\n    </style>\n  </head>\n  <body>\n    <main class=\"layout\">\n      <div class=\"gallery\">\n        <img src=\"https://picsum.photos/seed/lamp/600/400\" alt=\"Minimal desk lamp glowing warmly\" width=\"600\" height=\"400\" />\n      </div>\n      <div class=\"details\">\n        <h1>Desk lamp</h1>\n        <p>Warm light, small footprint.</p>\n        <button type=\"button\">Add to cart</button>\n      </div>\n    </main>\n  </body>\n</html>\n",
    checks: [
      {
        id: "viewport",
        label: "Viewport meta tag is present",
        feedback:
          "No <meta name=\"viewport\"> in <head>. Without it, mobile browsers render a fake 980px viewport and your query never fires.",
        rule: { kind: "has-element", selector: 'meta[name="viewport"]' },
      },
      {
        id: "fluid-img",
        label: "Images are fluid (max-width: 100%)",
        feedback:
          "No max-width: 100% for images. Fixed-width images overflow narrow containers.",
        rule: { kind: "style-text-match", pattern: "img\\s*\\{[^}]*max-width\\s*:\\s*100%" },
      },
      {
        id: "media-query",
        label: "A 640px media query exists",
        feedback:
          "No @media (max-width: 640px) block found. The breakpoint must read max-width: 640px.",
        rule: { kind: "style-text-match", pattern: "@media[^{]*max-width\\s*:\\s*640px" },
      },
      {
        id: "stack",
        label: "The query stacks the layout vertically",
        feedback:
          "The media query should set .layout to flex-direction: column so columns stack on narrow screens.",
        rule: { kind: "style-text-match", pattern: "@media[\\s\\S]*?\\.layout\\s*\\{[^}]*flex-direction\\s*:\\s*column" },
      },
    ],
    hintLadder: [
      "Three ingredients: a meta tag, a fluid-image rule, and a conditional block. Which checks name which?",
      "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> to <head> first — it's the on-switch.",
      "img { max-width: 100%; height: auto; } plus @media (max-width: 640px) { .layout { flex-direction: column; } }.",
      "Narrow the preview panel to phone width: the gallery should sit above the details. If nothing changes, the query selector or breakpoint is off.",
      "Solution shape is the example plus the meta tag. Transfer: add a second breakpoint at 1024px and change the gap — breakpoints are just more of the same.",
    ],
    misconceptions: [
      "Media queries without the viewport meta — the #1 responsive bug.",
      "width: 100% on images — stretches small images; max-width only constrains.",
      "Device-specific breakpoints — design to your content's breaking points, not phone models.",
    ],
    completionNote: "Your page adapts from desktop to phone widths.",
    masteryNote: "Responsive thinking (meta + fluid + breakpoints) with minimal help.",
  },
  {
    id: "css-variables",
    stageId: "css",
    title: "Variables & polish",
    tagline: "One accent color, changed in one place.",
    type: "practice",
    difficulty: 2,
    estMinutes: 20,
    objectives: [
      "Define theme tokens with :root custom properties",
      "Consume them with var()",
      "Add transitions for state changes",
    ],
    prereqIds: ["css-responsive"],
    competencyIds: ["css-layout"],
    whyItMatters:
      "Hardcoded colors scattered across a stylesheet make rebrands a find-and-replace nightmare. Variables turn branding into a one-line change.",
    lesson: [
      {
        kind: "prose",
        body: "**Custom properties** (CSS variables) store values once:\n\n- Define on `:root` so everything inherits: `:root { --accent: #55e6c1; }`.\n- Consume anywhere: `background: var(--accent);`.\n- Change the token, retheme the site.\n\nPair with **`transition`** so state changes glide: `transition: background 0.2s;` on the base rule, a different `background` on `:hover`. Browsers interpolate between them.",
      },
      {
        kind: "example",
        body: "A themed button with a smooth hover:",
        code: ":root { --accent: #55e6c1; }\n.btn {\n  background: var(--accent);\n  color: #10161d;\n  border-radius: 8px;\n  transition: background 0.2s;\n}\n.btn:hover { background: #6ff0cf; }",
      },
      {
        kind: "task",
        body: "Theme the buttons: define **`--accent: #55e6c1`** on **`:root`**, use **`var(--accent)`** for `.btn` backgrounds, add a **`transition`**, and round corners (**8px**). Then **Check**.",
      },
    ],
    starterCode: SKELETON(
      "Buttons",
      `    <button class="btn" type="button">Primary</button>\n    <button class="btn" type="button">Secondary</button>`
    ),
    checks: [
      {
        id: "token",
        label: "An --accent token is defined on :root",
        feedback:
          "No --accent custom property on :root. Tokens live at the top: :root { --accent: #55e6c1; }.",
        rule: { kind: "style-text-match", pattern: ":root\\s*\\{[^}]*--accent\\s*:\\s*#55e6c1" },
      },
      {
        id: "consumed",
        label: "Buttons consume var(--accent)",
        feedback:
          "No var(--accent) usage found. The point of the token is consuming it: background: var(--accent).",
        rule: { kind: "style-text-match", pattern: "var\\(\\s*--accent\\s*\\)" },
      },
      {
        id: "resolved",
        label: "Buttons are wired to the token",
        feedback:
          "The .btn background should use the token: background: var(--accent). A misspelled token name fails silently — compare character by character.",
        rule: { kind: "style-text-match", pattern: "\\.btn\\s*\\{[^}]*background\\s*:\\s*var\\(\\s*--accent" },
      },
      {
        id: "transition",
        label: "State changes transition smoothly",
        feedback:
          "No transition found on .btn. Add transition: background 0.2s so the hover glides.",
        rule: { kind: "style-text-match", pattern: "\\.btn\\s*\\{[^}]*transition\\s*:" },
      },
    ],
    hintLadder: [
      "Define once on :root, use everywhere with var(). Which check verifies each half?",
      ":root { --accent: #55e6c1; } then .btn { background: var(--accent); … } — plus transition and border-radius.",
      "The resolved check reads the rendered color: if it fails but the text checks pass, your token name is misspelled somewhere (variables fail silently).",
      "Custom property names are case-sensitive: --accent ≠ --Accent. Compare every occurrence character by character.",
      "Solution shape is the example. Transfer: change --accent once and watch both buttons follow — then imagine doing that across 50 hardcoded files.",
    ],
    misconceptions: [
      "var() typos failing silently — unmatched variables compute to guaranteed-invalid, i.e., nothing.",
      "transition on :hover only — put it on the base rule so both directions animate.",
      "One-off hex values alongside tokens — every stray literal is a future rebrand bug.",
    ],
    completionNote: "Your buttons theme from a single token.",
    masteryNote: "Token-driven styling with minimal help.",
  },
  {
    id: "css-debug",
    stageId: "css",
    title: "Layout rescue",
    tagline: "A debugging mission: four layout bugs, zero redesign.",
    type: "debugging",
    difficulty: 3,
    estMinutes: 25,
    objectives: [
      "Diagnose overflow, stacking, contrast, and width bugs",
      "Fix with flex, max-width, color, and max-width rules",
      "Verify each fix in the preview before moving on",
    ],
    prereqIds: ["css-variables"],
    competencyIds: ["css-layout"],
    whyItMatters:
      "Real CSS work is 70% debugging inherited layouts. Reading a broken page and naming each bug precisely is the senior move.",
    lesson: [
      {
        kind: "prose",
        body: "The starter page renders — badly. Four independent bugs:\n\n1. **Nav stacks vertically** — links should be a horizontal flex row.\n2. **Hero image overflows** its card on narrow screens — needs fluid sizing.\n3. **Button text is unreadable** — pale text on mint; needs dark ink text.\n4. **Content column is 1200px fixed** — a rigid slab; cap it with `max-width: 720px` instead.\n\nFix the stylesheet only. HTML stays untouched.",
      },
      {
        kind: "task",
        body: "Fix all four bugs in `<style>`: flex nav, fluid image, readable button, fluid-width content. Press **Check** for the bug readout — it names what's still broken, not how to write it.",
      },
    ],
    starterCode:
      "<!DOCTYPE html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n    <title>Buggy layout</title>\n    <style>\n      nav a { margin-right: 8px; }\n      .hero img { width: 900px; }\n      .btn { background: #55e6c1; color: #c8d4da; }\n      .content { width: 1200px; margin: 0 auto; }\n    </style>\n  </head>\n  <body>\n    <nav>\n      <a href=\"index.html\">Home</a>\n      <a href=\"about.html\">About</a>\n    </nav>\n    <div class=\"hero\">\n      <img src=\"https://picsum.photos/seed/buggy/900/300\" alt=\"Wide banner photo of a workshop\" width=\"900\" height=\"300\" />\n    </div>\n    <main class=\"content\">\n      <h1>Our workshop</h1>\n      <p>Small teams, sharp tools.</p>\n      <button class=\"btn\" type=\"button\">Book a visit</button>\n    </main>\n  </body>\n</html>\n",
    checks: [
      {
        id: "fix-nav",
        label: "Bug 1 fixed: nav is a flex row",
        feedback:
          "Bug 1 still open: the nav isn't display: flex. The margin-right rule can't align anything by itself.",
        rule: { kind: "computed-style", selector: "nav", property: "display", pattern: "^flex$" },
      },
      {
        id: "fix-img",
        label: "Bug 2 fixed: hero image is fluid",
        feedback:
          "Bug 2 still open: the 900px-fixed image overflows narrow screens. Constrain with max-width: 100%.",
        rule: { kind: "style-text-match", pattern: "\\.hero\\s+img\\s*\\{[^}]*max-width\\s*:\\s*100%|img\\s*\\{[^}]*max-width\\s*:\\s*100%" },
      },
      {
        id: "fix-contrast",
        label: "Bug 3 fixed: button text is readable",
        feedback:
          "Bug 3 still open: computed button color isn't dark ink (#10161d). Pale-on-mint fails contrast for everyone.",
        rule: { kind: "computed-style", selector: ".btn", property: "color", pattern: INK_RGB },
      },
      {
        id: "fix-width",
        label: "Bug 4 fixed: content caps at 720px",
        feedback:
          "Bug 4 still open: .content is still a fixed 1200px slab. Replace width with max-width: 720px.",
        rule: { kind: "style-text-match", pattern: "\\.content\\s*\\{[^}]*max-width\\s*:\\s*720px" },
      },
    ],
    questions: [
      {
        id: "d1",
        prompt: "A page scrolls horizontally on phones but looks fine on desktop. What is the most likely cause?",
        options: [
          "Too many semantic landmarks",
          "A fixed-width element wider than the viewport",
          "Using gap instead of margins",
          "The viewport meta tag",
        ],
        answer: 1,
        explanation:
          "Fixed pixel widths that exceed small viewports are the classic overflow source — max-width and fluid rules are the fix.",
      },
    ],
    hintLadder: [
      "Take the bugs in order: which selector owns the nav? The image? The button? The content column?",
      "nav { display: flex; } … .hero img { max-width: 100%; } … .btn { color: #10161d; } … .content { max-width: 720px; } — one line each.",
      "Bug 4 keeps width: 1200px alongside your max-width? Fixed width wins the conflict — remove it, don't just add.",
      "Narrow the preview to ~360px after each fix: overflow, stacking, and contrast are all visible there.",
      "Solution shape is the four one-line fixes. Transfer: break a page on purpose (fixed widths, pale text) and practice naming each bug before fixing — diagnosis speed is the skill.",
    ],
    misconceptions: [
      "Adding rules without removing the broken ones — conflicting declarations keep the bug alive.",
      "Fixing desktop only — narrow the preview; most layout bugs live at small widths.",
      "Eyeballing contrast — pale-on-mint fails WCAG; compute or check, don't guess.",
    ],
    completionNote: "Four bugs diagnosed and fixed without a redesign.",
    masteryNote: "Independent layout debugging with minimal help.",
  },
  {
    id: "css-landing",
    stageId: "css",
    title: "Boss challenge: landing page",
    tagline: "A responsive landing page from a brief. Your CSS graduation.",
    type: "project",
    difficulty: 4,
    estMinutes: 60,
    objectives: [
      "Plan a styled page from a written specification",
      "Combine flex/grid, tokens, responsiveness, and landmarks",
      "Deliver without step-by-step instructions",
    ],
    prereqIds: ["css-debug"],
    competencyIds: ["css-layout", "html-structure"],
    whyItMatters:
      "Design briefs don't come with steps. This is the closest thing to real frontend ticket work in the curriculum so far.",
    lesson: [
      {
        kind: "prose",
        body: "**The brief.** Style a landing page for a fictional product (“Drift Notes”, a tiny note app). Requirements:\n\n1. **Header nav in a flex row** with 3+ links and real spacing.\n2. **Hero**: one `<h1>`, a paragraph, and a **mint CTA button** themed via a **`--accent` variable**.\n3. **Features section**: **3+ cards** in a **flex or grid row** with gap.\n4. **Responsive**: a **`640px` media query** that stacks the features vertically.\n5. **Semantics kept**: `<header>`, `<main>`, `<footer>` all present.\n6. **Viewport meta** present.\n\nWrite the HTML structure AND the stylesheet. No starter markup beyond the shell.",
      },
      {
        kind: "task",
        body: "Build the whole page. **Check** gives you the requirements readout — failing checks name what's missing, never the code to write.",
      },
    ],
    starterCode:
      "<!DOCTYPE html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <title><!-- Your landing page title --></title>\n    <style>\n      /* The brief is the instruction. Build it all here. */\n    </style>\n  </head>\n  <body>\n    <!-- Header, hero, features, footer — your structure, your styles. -->\n  </body>\n</html>\n",
    checks: [
      {
        id: "boss-nav",
        label: "Header nav is a spaced flex row",
        feedback:
          "Need <header> containing <nav> with 3+ links, displayed as flex. Structure AND layout both count.",
        rule: { kind: "count-min", selector: "header nav a", min: 3 },
      },
      {
        id: "boss-nav-flex",
        label: "Nav layout uses flexbox",
        feedback:
          "The header nav isn't display: flex. Three links alone don't make a row.",
        rule: { kind: "computed-style", selector: "header nav", property: "display", pattern: "^flex$" },
      },
      {
        id: "boss-hero",
        label: "Hero has a real h1 and CTA",
        feedback:
          "Need an <h1> with real text plus a .btn call-to-action.",
        rule: { kind: "text-match", selector: "h1", pattern: ".{4,}" },
      },
      {
        id: "boss-accent",
        label: "CTA background wired to --accent",
        feedback:
          "Need a --accent token on :root and a .btn rule using background: var(--accent).",
        rule: { kind: "style-text-match", pattern: "\\.btn\\s*\\{[^}]*background\\s*:\\s*var\\(\\s*--accent" },
      },
      {
        id: "boss-cta-el",
        label: "A real CTA button element exists",
        feedback:
          "No .btn element found. The stylesheet rule alone isn't a button — add the element too.",
        rule: { kind: "has-element", selector: ".btn" },
      },
      {
        id: "boss-features",
        label: "3+ feature cards in a flex/grid row",
        feedback:
          "Need a .features container with 3+ children, displayed as flex or grid.",
        rule: { kind: "count-min", selector: ".features > *", min: 3 },
      },
      {
        id: "boss-row",
        label: "Feature row uses flex or grid",
        feedback:
          ".features isn't display flex or grid. The container — not the cards — takes the layout rule.",
        rule: { kind: "computed-style", selector: ".features", property: "display", pattern: "^(flex|grid)$" },
      },
      {
        id: "boss-responsive",
        label: "Responsive: 640px stacking query",
        feedback:
          "Need @media (max-width: 640px) that stacks .features vertically (flex-direction: column).",
        rule: { kind: "style-text-match", pattern: "@media[\\s\\S]*?max-width\\s*:\\s*640px[\\s\\S]*?flex-direction\\s*:\\s*column" },
      },
      {
        id: "boss-semantics",
        label: "Landmarks and viewport kept",
        feedback:
          "Need <header>, <main>, <footer>, and the viewport meta — styling must not cost structure.",
        rule: { kind: "has-element", selector: "header" },
      },
      {
        id: "boss-main",
        label: "<main> landmark present",
        feedback: "No <main> found. The hero and features belong inside it.",
        rule: { kind: "has-element", selector: "main" },
      },
      {
        id: "boss-footer",
        label: "<footer> landmark present",
        feedback: "No <footer> found. Close the page properly.",
        rule: { kind: "has-element", selector: "footer" },
      },
    ],
    hintLadder: [
      "Which check is failing? Each names the exact element, value, or query it wants — that IS the spec.",
      "Build in layers: unstyled semantic HTML first (all landmarks + content), then tokens, then layout, then the media query.",
      "Reopen the missions behind each failing check — flexbox for rows, responsive for the query, variables for the CTA.",
      "The responsive check needs BOTH the 640px query AND flex-direction: column inside it. Half a media query fails honestly.",
      "This level stays thin by design: re-read the brief line for the failing check. Spec-reading under styling load is the assessed skill.",
    ],
    misconceptions: [
      "Styling before structure — unstyled semantic HTML first, always.",
      "Pixel-perfect obsession — the checks assess requirements, not taste. Ship, then polish.",
    ],
    completionNote:
      "You shipped a responsive, themed landing page from a brief — Stage 2 graduation evidence.",
    masteryNote:
      "Independent delivery with minimal help. You can target, space, flex, grid, theme, and respond.",
    isBoss: true,
  },
];
