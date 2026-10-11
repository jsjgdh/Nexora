import type { Mission } from "./types";

/* Stage 1, missions 5–9: media, lists, semantics debugging, forms, boss project. */

export const MISSIONS_B: Mission[] = [
  {
    id: "images-and-alt",
    stageId: "html",
    title: "Images & alt text",
    tagline: "Every image earns its place — or describes it.",
    type: "practice",
    difficulty: 2,
    estMinutes: 20,
    objectives: [
      "Embed images with <img>, src, and alt",
      "Write concise, meaningful alternative text",
      "Caption images with <figure> and <figcaption>",
    ],
    prereqIds: ["links-and-navigation"],
    competencyIds: ["html-media"],
    whyItMatters:
      "Alt text is the image for everyone who can't see it — screen-reader users, people on failed connections, search engines. Writing good alt is a small act with a large audience.",
    lesson: [
      {
        kind: "prose",
        body: "Images load from a `src` and describe themselves with an `alt`:\n\n- **Informative image** → alt says what the image conveys: `alt=\"Golden retriever puppy sleeping in a laundry basket\"`.\n- **Decorative image** → empty alt (`alt=\"\"`) so assistive tech skips it.\n- Never write “image of…” — screen readers already announce it as an image.\n\nWrap an image and its caption in `<figure>` + `<figcaption>` to bind them together semantically.",
      },
      {
        kind: "example",
        body: "A captioned photo with genuinely useful alt text:",
        code: "<figure>\n  <img\n    src=\"https://picsum.photos/seed/garden/600/400\"\n    alt=\"Community garden beds heavy with late-summer tomatoes\"\n    width=\"600\"\n    height=\"400\" />\n  <figcaption>August harvest at the community garden.</figcaption>\n</figure>",
      },
      {
        kind: "task",
        body: "Add a `<figure>`: an `<img>` with a real `src` and **meaningful alt text (8+ characters)**, plus a `<figcaption>`. Then **Check**.",
      },
    ],
    starterCode:
      "<!DOCTYPE html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <title>Photo journal</title>\n  </head>\n  <body>\n    <h1>Photo journal</h1>\n    <!-- TODO: add a figure with an img (src + meaningful alt) and a figcaption -->\n  </body>\n</html>\n",
    checks: [
      {
        id: "has-img",
        label: "An <img> with a src is present",
        feedback:
          "No <img> found. Add one with a src, e.g. the picsum URL from the example.",
        rule: { kind: "attr-match", selector: "img", attr: "src", pattern: "\\S{4,}" },
      },
      {
        id: "good-alt",
        label: "Alt text is meaningful (8+ characters)",
        feedback:
          "The alt text is missing or too short. Describe what the image shows in a short phrase — at least 8 characters, no “image of”.",
        rule: { kind: "attr-match", selector: "img", attr: "alt", pattern: ".{8,}" },
      },
      {
        id: "has-figure",
        label: "Image is captioned with <figure> + <figcaption>",
        feedback:
          "Wrap the <img> in a <figure> and add a <figcaption> describing it.",
        rule: { kind: "nested", child: "figcaption", ancestor: "figure" },
      },
    ],
    hintLadder: [
      "What three pieces does the example combine? Look at the element names, not just the text.",
      "You need <figure> wrapping an <img> (with src AND alt) plus a <figcaption>. Alt must be a real description, 8+ characters.",
      "Copy the example's shape but change the seed/alt/caption to your own photo subject. Decorative alt=\"\" will fail — this image is informative.",
      "Check each attribute: does your <img> have src? alt with 8+ meaningful characters? Is there a <figcaption> inside the same <figure>?",
      "Solution shape: <figure> → <img src alt> + <figcaption>. After passing, cover the example and rewrite your alt text from scratch — describing images precisely is the transferable skill.",
    ],
    misconceptions: [
      "alt=\"image of a dog\" — redundant; screen readers already say “image”.",
      "Leaving alt off informative images — for screen-reader users the image simply doesn't exist.",
      "Using images of text instead of real text — unselectable, untranslatable, inaccessible.",
    ],
    completionNote: "Your image is embedded, described, and captioned.",
    masteryNote: "Accessibility-first media habits with minimal help.",
  },
  {
    id: "lists",
    stageId: "html",
    title: "Lists & structure",
    tagline: "Unordered, ordered, and nested — data with shape.",
    type: "practice",
    difficulty: 1,
    estMinutes: 15,
    objectives: [
      "Choose <ul> for unordered and <ol> for ordered items",
      "Nest lists correctly with <li> wrappers",
    ],
    prereqIds: ["images-and-alt"],
    competencyIds: ["html-structure"],
    whyItMatters:
      "Navigation menus, recipes, rankings, checklists, table-of-contents — half the web's repeated content is a list wearing CSS. Semantic lists stay navigable when the styling is stripped away.",
    lesson: [
      {
        kind: "prose",
        body: "Two list flavors:\n\n- `<ul>` — **unordered**: order doesn't matter (ingredients, features, nav links).\n- `<ol>` — **ordered**: sequence matters (steps, rankings).\n\nEvery item is an `<li>`. To nest a list, put the whole sub-list **inside** an `<li>` — never as a direct child of `<ul>` or `<ol>`.",
      },
      {
        kind: "example",
        body: "A recipe with nested ingredients:",
        code: "<h2>Pancakes</h2>\n<ol>\n  <li>Mix the dry ingredients\n    <ul>\n      <li>200g flour</li>\n      <li>2 tbsp sugar</li>\n    </ul>\n  </li>\n  <li>Whisk in milk and eggs</li>\n  <li>Rest the batter 10 minutes</li>\n</ol>",
      },
      {
        kind: "task",
        body: "Build a recipe (or any how-to): an `<ol>` with **at least 3 steps**, one step containing a **nested `<ul>`** of items — **6+ `<li>` in total**. Then **Check**.",
      },
    ],
    starterCode:
      "<!DOCTYPE html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <title>My recipe</title>\n  </head>\n  <body>\n    <h1>My recipe</h1>\n    <!-- TODO: an ol with 3+ steps, one step nesting a ul; 6+ li total -->\n  </body>\n</html>\n",
    checks: [
      {
        id: "has-ol",
        label: "An ordered list with at least 3 steps",
        feedback:
          "No <ol> with three items found. Write your steps as <ol> → <li>…</li> × 3.",
        rule: { kind: "count-min", selector: "ol > li", min: 3 },
      },
      {
        id: "nested-ul",
        label: "A nested unordered list inside a step",
        feedback:
          "No <ul> nested inside the ordered list. Put a full <ul>…</ul> inside one of the <li> steps, like the example.",
        rule: { kind: "nested", child: "ul", ancestor: "ol" },
      },
      {
        id: "six-items",
        label: "At least 6 list items in total",
        feedback:
          "Fewer than 6 <li> elements. Add more steps or more nested items.",
        rule: { kind: "count-min", selector: "li", min: 6 },
      },
    ],
    hintLadder: [
      "What wraps the sub-list in the example — the <ol> directly, or something inside it?",
      "The nested <ul> sits INSIDE an <li>. An <ol> may only contain <li> children.",
      "Draft 3 steps as <li>s, then open a <ul> inside one step and add 2–3 ingredient <li>s before closing it.",
      "Count: 3 step <li>s + 3 nested <li>s = 6 total. Validate that every <ul>/<ol> contains only <li> children.",
      "Solution shape matches the example with your own content. Bonus transfer: when would you choose <ul> over <ol> for navigation links, and why?",
    ],
    misconceptions: [
      "Putting <ul> directly inside <ol> without an <li> wrapper — invalid HTML.",
      "Using <br> + dashes for lists — invisible structure for assistive tech.",
      "Choosing <ol> for things with no meaningful order.",
    ],
    completionNote: "Your how-to uses ordered steps with a correctly nested list.",
    masteryNote: "Nesting rules internalized with minimal help.",
  },
  {
    id: "semantic-html",
    stageId: "html",
    title: "Semantic rescue",
    tagline: "A debugging mission: turn div-soup into landmarks.",
    type: "debugging",
    difficulty: 3,
    estMinutes: 25,
    objectives: [
      "Replace generic <div>s with header/main/nav/article/footer",
      "Guarantee exactly one <h1> inside <main>",
      "Explain why landmarks matter for assistive tech",
    ],
    prereqIds: ["lists"],
    competencyIds: ["html-structure", "html-links-nav"],
    whyItMatters:
      "You will inherit div-soup in every real job. Refactoring it into landmarks is the fastest accessibility win in web development — and screen-reader users feel it instantly.",
    lesson: [
      {
        kind: "prose",
        body: "The starter page *looks* fine but *means* nothing: everything is a `<div>`. Browsers and screen readers see zero structure — no banner, no main content, no navigation landmark.\n\nYour refactor map:\n\n- `<div class=\"header\">` → `<header>` (+ `<nav>` for its links)\n- `<div class=\"content\">` → `<main>`\n- `<div class=\"post\">` → `<article>`\n- `<div class=\"footer\">` → `<footer>`\n- The page needs exactly one `<h1>`, inside `<main>`",
      },
      {
        kind: "example",
        body: "Before and after for one block:",
        code: "<!-- before: says nothing -->\n<div class=\"header\">\n  <div class=\"logo\">My blog</div>\n</div>\n\n<!-- after: says everything -->\n<header>\n  <p>My blog</p>\n  <nav><a href=\"index.html\">Home</a></nav>\n</header>",
      },
      {
        kind: "task",
        body: "Refactor the starter page: convert every layout `<div>` to its landmark element, keep all text and links working, end with **exactly one `<h1>` inside `<main>`**. Then **Check**.",
      },
    ],
    starterCode:
      "<!DOCTYPE html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <title>My blog</title>\n  </head>\n  <body>\n    <div class=\"header\">\n      <h1>My blog</h1>\n      <div class=\"links\">\n        <a href=\"index.html\">Home</a>\n        <a href=\"about.html\">About</a>\n      </div>\n    </div>\n    <div class=\"content\">\n      <div class=\"post\">\n        <h1>Why semantic HTML matters</h1>\n        <p>Divs say nothing about their content.</p>\n      </div>\n    </div>\n    <div class=\"footer\">\n      <p>© 2026 My blog</p>\n    </div>\n  </body>\n</html>\n",
    checks: [
      {
        id: "has-header",
        label: "A <header> landmark exists",
        feedback:
          "No <header> found. Convert <div class=\"header\"> into <header> (keep its content).",
        rule: { kind: "has-element", selector: "header" },
      },
      {
        id: "has-nav",
        label: "Links live inside a <nav>",
        feedback:
          "The header links are not in a <nav>. Wrap them: <nav>…links…</nav>.",
        rule: { kind: "nested", child: "a", ancestor: "nav" },
      },
      {
        id: "has-main",
        label: "A <main> landmark exists",
        feedback:
          "No <main> found. Convert <div class=\"content\"> into <main>.",
        rule: { kind: "has-element", selector: "main" },
      },
      {
        id: "has-article",
        label: "The post is an <article>",
        feedback:
          "No <article> found. Convert <div class=\"post\"> into <article>.",
        rule: { kind: "has-element", selector: "article" },
      },
      {
        id: "has-footer",
        label: "A <footer> landmark exists",
        feedback:
          "No <footer> found. Convert <div class=\"footer\"> into <footer>.",
        rule: { kind: "has-element", selector: "footer" },
      },
      {
        id: "h1-in-main",
        label: "Exactly one <h1>, inside <main>",
        feedback:
          "There should be exactly one <h1> and it must sit inside <main>. The site name in the header should become a <p>; the post title stays the single <h1>.",
        rule: { kind: "count-exact", selector: "main h1", exact: 1 },
      },
    ],
    questions: [
      {
        id: "s1",
        prompt: "A screen-reader user presses the landmark-navigation key. On the div-soup version, what happens?",
        options: [
          "They jump straight to the article",
          "Nothing useful — there are no landmarks to jump to",
          "The page reads faster",
          "Divs are announced as landmarks automatically",
        ],
        answer: 1,
        explanation:
          "Landmark navigation only sees header/main/nav/article/footer (and friends). Div-soup is invisible to it.",
      },
    ],
    hintLadder: [
      "List every div class in the starter. Which landmark matches each one's role?",
      "header ← .header, nav ← .links, main ← .content, article ← .post, footer ← .footer. Rename the tags, keep classes if you like.",
      "Two <h1>s exist but only one may remain: demote the site name to <p>, keep the post title as the single <h1> inside <main>.",
      "Your diff should show five tag renames and one h1→p demotion. Nothing else needs to change — text and links stay identical.",
      "Solution shape: header(+nav) / main > article > h1 / footer, zero layout divs. Transfer: open any news site and count its landmarks — that audit instinct is the real takeaway.",
    ],
    misconceptions: [
      "Renaming classes instead of tags — .header is still a meaningless div.",
      "Keeping two <h1>s — the page has one topic; the site name is not it.",
      "Deleting content during refactor — semantics change, content stays.",
    ],
    completionNote: "Div-soup refactored into landmarks. The page now means what it shows.",
    masteryNote: "Independent debugging with minimal help — landmark thinking transfers to any codebase.",
  },
  {
    id: "contact-form",
    stageId: "html",
    title: "Build a contact form",
    tagline: "Labels, input types, and native validation.",
    type: "build",
    difficulty: 3,
    estMinutes: 30,
    objectives: [
      "Build a <form> with labeled inputs",
      "Choose correct input types (email, text) and textarea",
      "Use required and native validation",
    ],
    prereqIds: ["semantic-html"],
    competencyIds: ["html-forms"],
    whyItMatters:
      "Forms are where users hand you their data — and where inaccessible markup locks people out. A correctly labeled form works with keyboards, screen readers, and autofill for free.",
    lesson: [
      {
        kind: "prose",
        body: "Every input needs a **programmatic label**: either `<label for=\"id\">` matching the input's `id`, or the input wrapped inside the `<label>`. Placeholder text is *not* a label — it vanishes when you type.\n\nMatch the `type` to the data: `type=\"email\"` brings email keyboards on mobile and free format validation. `required` blocks empty submission natively. Multi-line text gets `<textarea>`, and submission gets `<button type=\"submit\">`.",
      },
      {
        kind: "example",
        body: "The pattern to repeat for every field:",
        code: "<form action=\"/contact\" method=\"post\">\n  <label for=\"email\">Email address</label>\n  <input type=\"email\" id=\"email\" name=\"email\" required />\n  <label for=\"message\">Message</label>\n  <textarea id=\"message\" name=\"message\" rows=\"4\" required></textarea>\n  <button type=\"submit\">Send message</button>\n</form>",
      },
      {
        kind: "task",
        body: "Build the contact form: a `<form>` with a **name** field, an **email** field (`type=\"email\"`, `required`), a **message** `<textarea>` (`required`), **every input labeled**, and a **submit button**. Then **Check**.",
      },
    ],
    starterCode:
      "<!DOCTYPE html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <title>Contact me</title>\n  </head>\n  <body>\n    <h1>Contact me</h1>\n    <!-- TODO: build the form here -->\n  </body>\n</html>\n",
    checks: [
      {
        id: "has-form",
        label: "A <form> element exists",
        feedback: "No <form> found. Wrap your fields in <form action=\"/contact\" method=\"post\">.",
        rule: { kind: "has-element", selector: "form" },
      },
      {
        id: "labeled",
        label: "Every input is programmatically labeled",
        feedback:
          "A field has no accessible name. Use a visible <label for=\"id\"> with a matching id, or a non-empty aria-label/aria-labelledby that names real text. Placeholders alone don't count.",
        rule: { kind: "labeled-inputs" },
      },
      {
        id: "email-field",
        label: "An email input with type=\"email\"",
        feedback:
          "No <input type=\"email\"> found. The email field must use type=\"email\" for validation and mobile keyboards.",
        rule: { kind: "has-element", selector: 'form input[type="email"]' },
      },
      {
        id: "has-textarea",
        label: "A <textarea> for the message",
        feedback: "No <textarea> found. Multi-line messages need <textarea>, not <input>.",
        rule: { kind: "has-element", selector: "form textarea" },
      },
      {
        id: "has-submit",
        label: "A submit button",
        feedback:
          "No submit button found. Add <button type=\"submit\">Send message</button> inside the form.",
        rule: { kind: "has-element", selector: 'form button[type="submit"], form input[type="submit"]' },
      },
    ],
    hintLadder: [
      "Which example line connects a label to its input? Look at the for and id attributes.",
      "Each field needs: <label for=\"x\">…</label> + <input id=\"x\" …>. The email input needs type=\"email\" and required.",
      "You need at least: name (text), email (type=email, required), message (textarea, required), all labeled, plus <button type=\"submit\">.",
      "If the labeled-inputs check fails, inspect each field: does a visible label target its id, or does a non-empty ARIA name resolve to real text? A placeholder alone is not a label.",
      "Solution shape is the example extended with a name field. Transfer: tab through your form with only the keyboard — every field should announce its label. That test catches most form bugs.",
    ],
    misconceptions: [
      "Placeholder as label — it disappears on input and isn't announced reliably.",
      "type=\"text\" for emails — loses validation, email keyboards, and autofill hints.",
      "<div class=\"button\"> instead of <button> — not keyboard-operable, not a real control.",
    ],
    completionNote: "Your form is labeled, typed, and natively validated.",
    masteryNote: "Accessible form patterns with minimal help — ready for real user data.",
  },
  {
    id: "personal-website",
    stageId: "html",
    title: "Boss challenge: personal website",
    tagline: "A multi-page-grade site from a spec. No tutorial. Just you.",
    type: "project",
    difficulty: 4,
    estMinutes: 60,
    objectives: [
      "Plan a page from a written specification",
      "Combine landmarks, nav, media, lists, and a form",
      "Meet every requirement without step-by-step instructions",
    ],
    prereqIds: ["contact-form"],
    competencyIds: ["html-structure", "html-links-nav", "html-media", "html-forms"],
    whyItMatters:
      "Tutorials end; specifications don't. This is the first mission that hands you a brief instead of steps — the exact shape of real client and ticket work.",
    lesson: [
      {
        kind: "prose",
        body: "**The brief.** Build a single-page personal website for a fictional (or real) person. It must include:\n\n1. A `<header>` with the person's name and a `<nav>` of **3+ links** (2 relative `.html` pages, 1 absolute `https://` URL)\n2. A `<main>` with exactly one `<h1>` and **2+ `<h2>` sections**\n3. A `<figure>` with an `<img>` (real src, meaningful alt) and `<figcaption>`\n4. A list with **3+ items** (skills, projects, anything)\n5. A contact `<form>`: labeled email field + message `<textarea>` + submit button\n6. A `<footer>` with a copyright line\n\nNo starter markup beyond the skeleton. No step-by-step. Use the earlier missions as reference — they're all still open.",
      },
      {
        kind: "task",
        body: "Build the whole site in the editor. Press **Check** whenever you want a readout — failing checks tell you what's missing, not how to write it.",
      },
    ],
    starterCode:
      "<!DOCTYPE html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <title><!-- Your site title --></title>\n  </head>\n  <body>\n    <!-- The brief is the instruction. Build it all here. -->\n  </body>\n</html>\n",
    checks: [
      {
        id: "boss-title",
        label: "Meaningful <title>",
        feedback: "The tab title is still a placeholder. Name the site.",
        rule: { kind: "text-match", selector: "title", pattern: ".{4,}" },
      },
      {
        id: "boss-nav",
        label: "<header> with <nav> of 3+ real links",
        feedback:
          "Need <header> containing <nav> with 3+ links (2 relative .html, 1 absolute https://, no placeholders).",
        rule: { kind: "count-min", selector: "header nav a", min: 3 },
      },
      {
        id: "boss-nav-mix",
        label: "Nav mixes relative and absolute URLs",
        feedback:
          "The nav needs both relative page links (*.html) and one absolute https:// link.",
        rule: { kind: "has-element", selector: 'header nav a[href^="https://"]' },
      },
      {
        id: "boss-headings",
        label: "One <h1> in <main>, 2+ <h2> sections",
        feedback:
          "Need exactly one <h1> inside <main> plus at least two <h2> sections.",
        rule: { kind: "count-min", selector: "main h2", min: 2 },
      },
      {
        id: "boss-media",
        label: "<figure> with described <img>",
        feedback:
          "Need <figure> → <img> (real src, 8+ char alt) + <figcaption>.",
        rule: { kind: "attr-match", selector: "figure img", attr: "alt", pattern: ".{8,}" },
      },
      {
        id: "boss-list",
        label: "A list with 3+ items",
        feedback: "Need a <ul> or <ol> with at least three <li> items.",
        rule: { kind: "count-min", selector: "main li", min: 3 },
      },
      {
        id: "boss-form",
        label: "Contact form: labeled email + message + submit",
        feedback:
          "Need a <form> with a labeled type=\"email\" input, a labeled <textarea>, and a submit button.",
        rule: { kind: "has-element", selector: 'form input[type="email"]' },
      },
      {
        id: "boss-form-labeled",
        label: "All form inputs are labeled",
        feedback: "Every form field needs an accessible name from a visible <label> or a valid ARIA label — placeholders don't count.",
        rule: { kind: "labeled-inputs" },
      },
      {
        id: "boss-footer",
        label: "<footer> with content",
        feedback: "Need a <footer> with at least a copyright or contact line.",
        rule: { kind: "text-match", selector: "footer", pattern: ".{3,}" },
      },
    ],
    hintLadder: [
      "Which check is failing? Each one names the exact element and quantity it wants — that IS the spec.",
      "Build top-down: header+nav → main (h1, h2s, figure, list) → form → footer. Get structure passing before polishing words.",
      "Reopen the missions behind each failing check — semantic rescue for landmarks, links mission for nav, forms mission for labels.",
      "Compare your file section-by-section against the six brief items. Most failures are a missing landmark or an unlabeled input.",
      "This level stays deliberately thin: re-read the brief line for the failing check and implement exactly what it says. Struggling here is the training — spec-reading is the skill being assessed.",
    ],
    misconceptions: [
      "Treating the brief as ordered steps — it's a checklist; you choose the order.",
      "Perfecting one section while others are missing — breadth first, then polish.",
    ],
    completionNote:
      "You shipped a complete site from a written spec — the graduation evidence for Stage 1.",
    masteryNote:
      "Independent delivery with minimal help. Stage 1 mastered: you can structure, link, illustrate, list, and collect input.",
    isBoss: true,
  },
];
