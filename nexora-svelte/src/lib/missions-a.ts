import type { Mission } from "./types";

/* Stage 1, missions 1–4: from "what is the web" to multi-page navigation. */

export const MISSIONS_A: Mission[] = [
  {
    id: "web-and-browsers",
    stageId: "html",
    title: "How the web works",
    tagline: "What browsers actually do with your code.",
    type: "concept",
    difficulty: 1,
    estMinutes: 10,
    objectives: [
      "Explain what a browser does with an HTML document",
      "Distinguish the roles of HTML, CSS, and JavaScript",
      "Identify the head and body of a document",
    ],
    // The application track opens only once the foundations layer is done.
    // A diagnostic-placed learner is unaffected: placement waives every
    // prerequisite that lies before their starting point.
    prereqIds: ["go-errors"],
    competencyIds: ["html-structure"],
    whyItMatters:
      "Every debugging session for the rest of your career starts with the same mental model: the browser reads your document and builds a page from it. Get this right once and layout bugs stop feeling like magic.",
    lesson: [
      {
        kind: "prose",
        body: "When you visit a website, your browser **requests a document** from a server, **reads it top to bottom**, and **renders a page** from what it finds. That document is written in **HTML** — HyperText Markup Language.\n\nHTML describes *what things are*: this is a heading, that is a paragraph, this is a link. It does not describe what they look like (that is CSS) or what they do when clicked (that is JavaScript):\n\n- **HTML** → structure and meaning\n- **CSS** → presentation and layout\n- **JavaScript** → behavior and interactivity",
      },
      {
        kind: "example",
        body: "Every HTML document has the same skeleton. The `<head>` holds metadata — information *about* the page, like its `<title>`. The `<body>` holds everything the visitor actually sees.",
        code: "<!DOCTYPE html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <title>My first page</title>\n  </head>\n  <body>\n    <h1>Hello, web</h1>\n    <p>Everything visible lives in the body.</p>\n  </body>\n</html>",
        codeCaption: "The smallest complete HTML document worth memorizing.",
      },
      {
        kind: "task",
        body: "Check your understanding with the two questions below. You can retry freely — this mission completes when both are answered correctly.",
      },
    ],
    starterCode:
      "<!DOCTYPE html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <title>Reading room</title>\n  </head>\n  <body>\n    <!-- No coding in this mission — answer the questions to complete it. -->\n    <h1>How the web works</h1>\n  </body>\n</html>\n",
    checks: [],
    questions: [
      {
        id: "w1",
        prompt: "What is HTML's job in a web page?",
        options: [
          "Describing the structure and meaning of content",
          "Making things colorful and animated",
          "Responding to clicks and fetching data",
          "Storing passwords securely",
        ],
        answer: 0,
        explanation:
          "HTML = structure and meaning. Styling is CSS's job; interactivity is JavaScript's.",
      },
      {
        id: "w2",
        prompt: "Where does the visible content of a page go?",
        options: [
          "Inside <head>",
          "Inside <body>",
          "Inside <title>",
          "Inside <meta>",
        ],
        answer: 1,
        explanation:
          "The <body> holds everything the visitor sees. The <head> holds metadata about the page.",
      },
    ],
    hintLadder: [
      "Re-read the example skeleton: which element wraps the visible heading?",
      "HTML describes *what things are*. Which option describes structure rather than looks or behavior?",
      "The <head> is metadata *about* the page; the <body> is the page itself.",
      "Question 1 is about meaning vs. appearance vs. behavior. Question 2: visible content lives in <body>.",
      "Answers: (1) structure and meaning, (2) <body>. Try explaining in your own words why <title> lives in <head> — that reasoning is the real skill here.",
    ],
    misconceptions: [
      "HTML controls colors and layout — that is CSS.",
      "The <head> is the top of the visible page — it is invisible metadata.",
    ],
    completionNote: "You can explain the browser's job and the HTML/CSS/JS split.",
    masteryNote: "Answered both checks correctly with at most one hint.",
  },
  {
    id: "first-page",
    stageId: "html",
    title: "Build your first page",
    tagline: "A title, a heading, and a paragraph — live in the preview.",
    type: "practice",
    difficulty: 1,
    estMinutes: 15,
    objectives: [
      "Write a complete HTML document from the skeleton",
      "Give the page a meaningful <title>",
      "Add a heading and a paragraph",
    ],
    prereqIds: ["web-and-browsers"],
    competencyIds: ["html-structure"],
    whyItMatters:
      "The document skeleton is the one piece of HTML you will write hundreds of times. Typing it yourself — not copying it — is what makes it stick.",
    lesson: [
      {
        kind: "prose",
        body: "An HTML document is built from **elements**: an opening tag, some content, and a closing tag. `<h1>Hello</h1>` is an `h1` element containing the text “Hello”.\n\nThree elements carry the whole page:\n\n- `<title>` — the name shown in the browser tab (lives in `<head>`)\n- `<h1>` — the main heading of the page (lives in `<body>`)\n- `<p>` — a paragraph of text",
      },
      {
        kind: "example",
        body: "Replace the placeholder text with your own words. The preview updates when you press **Run**.",
        code: "<title>Ada's notes</title>\n<h1>Things I am learning</h1>\n<p>HTML is simpler than I expected.</p>",
      },
      {
        kind: "task",
        body: "In the editor: **(1)** set the `<title>` to something meaningful, **(2)** write an `<h1>` heading, **(3)** write a `<p>` paragraph. Then press **Check**.",
      },
    ],
    starterCode:
      "<!DOCTYPE html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <title>Untitled page</title>\n  </head>\n  <body>\n    <!-- TODO: add an h1 heading and a p paragraph below -->\n  </body>\n</html>\n",
    checks: [
      {
        id: "has-title",
        label: "The page has a meaningful <title>",
        feedback:
          "The browser tab still says “Untitled page”. Edit the text inside <title> in the <head> to name your page.",
        rule: { kind: "text-match", selector: "title", pattern: "^(?!untitled page).{3,}$" },
      },
      {
        id: "has-h1",
        label: "The page has an <h1> heading with text",
        feedback:
          "No <h1> with text was found in the <body>. Add one, e.g. <h1>My page</h1>.",
        rule: { kind: "text-match", selector: "h1", pattern: ".{2,}" },
      },
      {
        id: "has-p",
        label: "The page has a <p> paragraph with text",
        feedback:
          "No paragraph found. Add a <p> element with at least a short sentence.",
        rule: { kind: "text-match", selector: "p", pattern: ".{5,}" },
      },
    ],
    hintLadder: [
      "Look at the example: which three elements do you need, and where does each one live?",
      "<title> goes inside <head>; <h1> and <p> go inside <body>. The starter file already has the skeleton.",
      "Replace “Untitled page” with your own title, and add <h1>…</h1> and <p>…</p> inside the <body>, where the TODO comment is.",
      "Something like:\n<h1>My learning page</h1>\n<p>I built this myself.</p>\n— but write your own words so the checks see real text.",
      "Solution shape: a <title> that is not “Untitled page”, one <h1> with text, one <p> with a sentence. After it passes, retype it once from memory — that is the transfer that counts.",
    ],
    misconceptions: [
      "Putting visible content inside <head> — it will not render.",
      "Forgetting the closing tag, e.g. <p> without </p>.",
    ],
    completionNote: "You wrote and previewed a complete HTML document.",
    masteryNote: "Passed all checks with at most one hint — the skeleton is becoming automatic.",
  },
  {
    id: "text-and-structure",
    stageId: "html",
    title: "Text & headings",
    tagline: "One h1, honest hierarchy, real paragraphs.",
    type: "practice",
    difficulty: 1,
    estMinutes: 20,
    objectives: [
      "Use exactly one <h1> per page",
      "Build a logical heading hierarchy with <h2>",
      "Use <p>, <em>, and <strong> for text meaning",
    ],
    prereqIds: ["first-page"],
    competencyIds: ["html-structure"],
    whyItMatters:
      "Headings are how screen readers navigate and how search engines understand a page. A skipped heading level is a broken promise to both.",
    lesson: [
      {
        kind: "prose",
        body: "Headings go from `<h1>` (the page's single main topic) down to `<h6>`. The rule is simple: **one `<h1>` per page, then `<h2>` for major sections** — never skip a level to get bigger text.\n\nFor emphasis inside text, `<em>` means *stress emphasis* and `<strong>` means **strong importance**. They are not just italics and bold: assistive technologies announce them differently.",
      },
      {
        kind: "example",
        body: "A well-structured article excerpt:",
        code: "<h1>City gardening guide</h1>\n<h2>Choosing containers</h2>\n<p>Drainage matters <em>more</em> than size.</p>\n<h2>Watering schedule</h2>\n<p><strong>Never</strong> water at midday in summer.</p>",
      },
      {
        kind: "task",
        body: "Restructure the starter article: keep **exactly one `<h1>`**, give it **at least two `<h2>` sections** with a paragraph each, and use `<em>` or `<strong>` where meaning demands it. Then **Check**.",
      },
    ],
    starterCode:
      "<!DOCTYPE html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <title>City gardening guide</title>\n  </head>\n  <body>\n    <h1>City gardening guide</h1>\n    <h1>Choosing containers</h1>\n    <p>Drainage matters more than size.</p>\n    <h3>Watering schedule</h3>\n    <p>Never water at midday in summer.</p>\n  </body>\n</html>\n",
    checks: [
      {
        id: "one-h1",
        label: "Exactly one <h1> on the page",
        feedback:
          "There should be exactly one <h1>. Demote the extra top-level heading to <h2>.",
        rule: { kind: "count-exact", selector: "h1", exact: 1 },
      },
      {
        id: "two-h2",
        label: "At least two <h2> section headings",
        feedback:
          "Found fewer than two <h2> elements. The “Watering schedule” heading skipped a level — make both sections <h2>.",
        rule: { kind: "count-min", selector: "h2", min: 2 },
      },
      {
        id: "two-p",
        label: "At least two paragraphs",
        feedback: "Each section needs its paragraph. Keep both <p> elements with their text.",
        rule: { kind: "count-min", selector: "p", min: 2 },
      },
      {
        id: "emphasis",
        label: "Meaningful emphasis with <em> or <strong>",
        feedback:
          "No <em> or <strong> found. Mark “more” with <em> and “Never” with <strong> — they carry real meaning here.",
        rule: { kind: "has-element", selector: "em, strong" },
      },
    ],
    hintLadder: [
      "Count the <h1> elements — how many does the rule allow? And which heading skipped a level?",
      "“Choosing containers” should be an <h2>, and “Watering schedule” is currently an <h3> sitting under an <h1> — that skips <h2>.",
      "Change the second <h1> to <h2>, change the <h3> to <h2>, then wrap “more” in <em> and “Never” in <strong>.",
      "The fixed structure is: h1 → h2 → p → h2 → p, with emphasis inside the paragraphs. Compare each line of your file against that shape.",
      "Solution shape: one <h1>, two <h2>s, two <p>s, plus <em>more</em> and <strong>Never</strong>. Rebuild it once more from the task description alone to lock in the pattern.",
    ],
    misconceptions: [
      "Using multiple <h1>s for big text — heading level is meaning, not font size.",
      "Skipping from <h1> to <h3> — screen readers use the hierarchy to navigate.",
      "Using <b>/<i> when the emphasis carries meaning — prefer <strong>/<em>.",
    ],
    completionNote: "Your article has an honest heading hierarchy and meaningful emphasis.",
    masteryNote: "Clean structure with minimal help — hierarchy thinking is in place.",
  },
  {
    id: "links-and-navigation",
    stageId: "html",
    title: "Links & navigation",
    tagline: "Connect pages with relative URLs and a real <nav>.",
    type: "build",
    difficulty: 2,
    estMinutes: 25,
    objectives: [
      "Write links with <a> and href",
      "Distinguish relative from absolute URLs",
      "Build site navigation inside <nav>",
    ],
    prereqIds: ["text-and-structure"],
    competencyIds: ["html-links-nav"],
    whyItMatters:
      "Links are the web's founding idea. Knowing when a URL is relative (points inside your site) versus absolute (points anywhere on the internet) decides whether your site survives being moved to a new domain.",
    lesson: [
      {
        kind: "prose",
        body: "A link is an `<a>` element whose `href` attribute says where to go:\n\n- **Relative URL** — `about.html`, `projects/site.html`. Resolved *from the current page*. Move the whole site and every link still works.\n- **Absolute URL** — `https://example.com/guide`. Points at one exact place on the internet.\n\nSite navigation belongs in a `<nav>` element containing a list of links. Link text should say where it goes — never “click here”.",
      },
      {
        kind: "example",
        body: "Navigation with two internal pages and one external reference:",
        code: "<nav>\n  <a href=\"index.html\">Home</a>\n  <a href=\"projects.html\">Projects</a>\n  <a href=\"https://developer.mozilla.org/\">MDN reference</a>\n</nav>",
      },
      {
        kind: "task",
        body: "Build the site navigation: a `<nav>` with **at least three links** — **two relative** page links (`*.html`) and **one absolute** (`https://…`) link — with meaningful text and no placeholder `href=\"#\"`. Then **Check**.",
      },
    ],
    starterCode:
      "<!DOCTYPE html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <title>My site</title>\n  </head>\n  <body>\n    <h1>My site</h1>\n    <!-- TODO: add a nav with 3 links: two relative pages, one absolute URL -->\n    <p>Welcome to my corner of the web.</p>\n  </body>\n</html>\n",
    checks: [
      {
        id: "nav-links",
        label: "<nav> contains at least three links",
        feedback:
          "No <nav> with three links found. Wrap your links: <nav> … at least three <a> elements … </nav>.",
        rule: { kind: "count-min", selector: "nav a", min: 3 },
      },
      {
        id: "relative-link",
        label: "At least one relative page link",
        feedback:
          "No relative link found. Add links like <a href=\"about.html\">About</a> — a plain filename, no https://.",
        rule: { kind: "has-element", selector: 'nav a[href$=".html"]' },
      },
      {
        id: "absolute-link",
        label: "At least one absolute (https://) link",
        feedback:
          "No absolute link found. Add one full URL, e.g. <a href=\"https://example.com\">Example</a>.",
        rule: { kind: "has-element", selector: 'nav a[href^="https://"]' },
      },
      {
        id: "no-placeholders",
        label: "No placeholder or empty links",
        feedback:
          "A link still points to “#” or has an empty href. Give every link a real destination.",
        rule: { kind: "no-placeholder-links" },
      },
    ],
    questions: [
      {
        id: "l1",
        prompt:
          "You move your whole site from localhost to example.com. Which links keep working with zero changes?",
        options: [
          "Relative links like about.html",
          "Absolute links like https://localhost/about",
          "Both break equally",
          "Links always need updating after a move",
        ],
        answer: 0,
        explanation:
          "Relative URLs resolve from the current page, so the whole site can move and they still work. Absolute URLs bake in the old domain.",
      },
    ],
    hintLadder: [
      "What does the example nav contain? Count its links and look at how each href starts.",
      "You need <nav> wrapping three <a> elements: two with plain filenames (about.html), one starting with https://.",
      "Placeholder href=\"#\" fails the checks — every link needs a real destination and meaningful text.",
      "Shape: <nav> → <a href=\"index.html\">Home</a>, <a href=\"about.html\">About</a>, <a href=\"https://…\">…</a>. Adapt it, don't just paste — use your own page names.",
      "Solution shape is the nav above with your own labels. Then answer: why would a team prefer relative links between its own pages?",
    ],
    misconceptions: [
      "href=\"#\" as a placeholder — it is a real link to the top of the page, and it breaks navigation.",
      "“Click here” link text — meaningless out of context for screen-reader users.",
      "Using absolute URLs for your own pages — they break when the domain changes.",
    ],
    completionNote: "Your navigation mixes relative and absolute URLs correctly.",
    masteryNote: "Correct link thinking with minimal help — the URL mental model is solid.",
  },
];
