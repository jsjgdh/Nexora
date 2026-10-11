import type { Mission } from "./types.js";

/* Stage 3 (continued): JavaScript Foundations — behavior assessed by driving
   the page through the sandbox harness. Stateful missions use ONE
   self-contained scripted flow per mission so checks stay deterministic
   whether run together (workspace) or in isolation (verification). */

const SHELL = (title: string, body: string, script: string) =>
  `<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <title>${title}</title>\n  </head>\n  <body>\n${body}\n    <script>\n${script}\n    </script>\n  </body>\n</html>\n`;

export const MISSIONS_E: Mission[] = [
  {
    id: "js-logic",
    stageId: "js",
    title: "Think in steps",
    tagline: "Decisions and greetings from pure functions.",
    type: "practice",
    difficulty: 2,
    estMinutes: 20,
    objectives: [
      "Write functions that take input and return output",
      "Branch with if/else on real conditions",
      "Predict return values before running",
    ],
    prereqIds: ["js-counter"],
    competencyIds: ["js-logic"],
    whyItMatters:
      "Every feature is a pile of small decisions like these. Functions you can call and predict are the unit of all later testing.",
    lesson: [
      {
        kind: "prose",
        body: "A **function** takes input and returns output: `function add(a, b) { return a + b; }`. A **condition** picks a branch: `if (age >= 18) { return true; } return false;`.\n\nThe discipline that matters: **predict the return value before you run**. `isAdult(18)` → ? Decide first, then let the test confirm.",
      },
      {
        kind: "example",
        body: "Branching on a threshold:",
        code: "function isAdult(age) {\n  if (age >= 18) {\n    return true;\n  }\n  return false;\n}",
      },
      {
        kind: "task",
        body: "Implement **`isAdult(age)`** (true at 18+) and **`greet(name)`** (`Hello, Ada!` — with the comma and bang). The checks call both. Then **Check**.",
      },
    ],
    starterCode: SHELL(
      "Logic",
      `    <h1>Logic gym</h1>\n    <p id="out">Run the checks to test your functions.</p>`,
      `      // TODO 1: define isAdult(age) — true when age is 18 or more\n      // TODO 2: define greet(name) — returns "Hello, Ada!" style greetings`
    ),
    checks: [
      {
        id: "writes-functions",
        label: "Real functions are defined",
        feedback:
          "No function definitions found. Write function isAdult(...) {...} and function greet(...) {...} — comments don't execute.",
        rule: { kind: "text-match", selector: "script", pattern: "function|=>" },
      },
      {
        id: "adult-works",
        label: "isAdult decides correctly",
        feedback:
          "isAdult(20) should be true and isAdult(15) false. Check the comparison operator and that you return — not just compute — the result.",
        rule: {
          kind: "scripted",
          ops: [
            { id: "a1", act: "call", fn: "isAdult", args: [20] },
            { id: "a2", act: "call", fn: "isAdult", args: [15] },
          ],
          assertions: [
            { op: "a1", equals: true },
            { op: "a2", equals: false },
          ],
        },
      },
      {
        id: "greet-works",
        label: "greet builds the exact string",
        feedback:
          "greet('Ada') should be exactly “Hello, Ada!”. Watch the comma, the space, and the exclamation mark.",
        rule: {
          kind: "scripted",
          ops: [{ id: "g1", act: "call", fn: "greet", args: ["Ada"] }],
          assertions: [{ op: "g1", equals: "Hello, Ada!" }],
        },
      },
    ],
    questions: [
      {
        id: "j1",
        prompt: "isAdult is implemented as age >= 18. What does isAdult(18) return?",
        options: ["true", "false", "18", "undefined"],
        answer: 0,
        explanation: ">= includes the boundary: 18 >= 18 is true. Off-by-one at boundaries is the classic bug — always test the edge.",
      },
    ],
    hintLadder: [
      "What does each function need to give back? Name the exact return values for the test inputs.",
      "isAdult returns a comparison: age >= 18. greet returns string building: 'Hello, ' + name + '!'.",
      "A function without return gives undefined — the test compares against true/false/strings, so every path needs its return.",
      "If greet is close but fails, log the length: 'Hello, Ada!' is 11 characters. Count yours.",
      "Solution shape: two small functions with returns on every path. Transfer: add isSenior(age) at 65+ without touching the others — isolated functions compose.",
    ],
    misconceptions: [
      "Computing without returning — the value evaporates; tests see undefined.",
      "Almost-exact strings — computers don't grade on intent; the bang matters.",
    ],
    completionNote: "Your functions decide and greet exactly as specified.",
    masteryNote: "Pure-function thinking with minimal help.",
    needsScript: true,
  },
  {
    id: "js-state",
    stageId: "js",
    title: "State that remembers",
    tagline: "Closures: functions with a memory.",
    type: "practice",
    difficulty: 2,
    estMinutes: 20,
    objectives: [
      "Hold state in a shared variable across calls",
      "Explain why repeated calls return growing values",
      "Reset state deliberately",
    ],
    prereqIds: ["js-logic"],
    competencyIds: ["js-logic"],
    whyItMatters:
      "Counters, carts, toggles, retries — interactive programs are state plus events. Understanding that a variable outlives one call is the whole game.",
    lesson: [
      {
        kind: "prose",
        body: "A variable declared **outside** a function survives between calls:\n\n- `let count = 0;` runs once, at load.\n- Each `tick()` call sees the *current* count, adds one, and returns it.\n- So consecutive calls return 1, then 2, then 3 — the function *remembers*.\n\nThis is the seed of all state management. Frameworks dress it up; the idea never changes.",
      },
      {
        kind: "example",
        body: "Memory in four lines:",
        code: "let count = 0;\nfunction tick() {\n  count += 1;\n  return count;\n}",
      },
      {
        kind: "task",
        body: "Build the counter: a shared `count` starting at 0, **`tick()`** adds one and returns the total, **`reset()`** sets it back to 0. The checks call them in sequence. Then **Check**.",
      },
    ],
    starterCode: SHELL(
      "Counter",
      `    <h1>Counter</h1>\n    <p>Tested through function calls — no page needed.</p>`,
      `      let count = 0;\n      function tick() {\n        // TODO: add one to count and return the new total\n      }\n      function reset() {\n        // TODO: set count back to 0\n      }`
    ),
    checks: [
      {
        id: "updates-state",
        label: "The shared variable is updated",
        feedback:
          "count never changes. Inside tick, write count += 1 (or count = count + 1) — reading it isn't enough.",
        rule: { kind: "text-match", selector: "script", pattern: "count\\s*\\+=\\s*1|count\\s*=\\s*count\\s*\\+|count\\+\\+" },
      },
      {
        id: "remembers",
        label: "Three ticks reach 3",
        feedback:
          "Three tick() calls didn't end at 3. Each call must add one to the SAME shared count and return it.",
        rule: {
          kind: "scripted",
          ops: [
            { id: "t1", act: "call", fn: "tick", args: [] },
            { id: "t2", act: "call", fn: "tick", args: [] },
            { id: "t3", act: "call", fn: "tick", args: [] },
          ],
          assertions: [{ op: "t3", equals: 3 }],
        },
      },
      {
        id: "resets",
        label: "reset returns to 0",
        feedback:
          "reset() should set count to 0 (and return it). The next tick after a reset must return 1.",
        rule: {
          kind: "scripted",
          ops: [{ id: "r1", act: "call", fn: "reset", args: [] }],
          assertions: [{ op: "r1", equals: 0 }],
        },
      },
    ],
    questions: [
      {
        id: "j1",
        prompt: "tick() is called twice on a fresh page. What is returned?",
        options: [
          "1, then 1 (each call starts over)",
          "1, then 2 (count persists between calls)",
          "0, then 1 (first call only initializes)",
          "2, then 2 (both see the final value)",
        ],
        answer: 1,
        explanation: "count lives outside tick, so it persists: first call returns 1, second returns 2.",
      },
    ],
    hintLadder: [
      "Where does count live — inside tick (recreated per call) or outside (shared)? Which does the task need?",
      "tick needs two lines: count += 1; then return count;. reset needs count = 0; (return it too).",
      "If ticks return null, the function has no return — adding without returning still fails the test.",
      "Each Check runs on a fresh page, so count always starts at 0 for the test. Your job is only the in-between behavior.",
      "Solution shape is the example plus reset. Transfer: add a step-by-two function sharing the same count — shared state, new behavior.",
    ],
    misconceptions: [
      "Declaring count inside tick — persistence needs the variable outside.",
      "Returning without updating (or updating without returning) — the test needs both halves.",
    ],
    completionNote: "Your functions share state correctly across calls.",
    masteryNote: "Stateful-function thinking with minimal help.",
    needsScript: true,
  },
  {
    id: "js-arrays",
    stageId: "js",
    title: "Arrays at work",
    tagline: "Map, filter, reduce — say what, not how.",
    type: "practice",
    difficulty: 2,
    estMinutes: 20,
    objectives: [
      "Transform arrays with map",
      "Select and combine with filter + reduce",
      "Prefer expressions over manual loops",
    ],
    prereqIds: ["js-state"],
    competencyIds: ["js-logic"],
    whyItMatters:
      "Lists of things — users, products, tasks, errors — are the day job. Array methods turn ten-line loops into one readable line.",
    lesson: [
      {
        kind: "prose",
        body: "Three methods cover most list work:\n\n- **`map`** transforms every item: `[1,2,3].map(n => n * 2)` → `[2,4,6]`.\n- **`filter`** keeps matches: `[4,9,2].filter(n => n > 3)` → `[4,9]`.\n- **`reduce`** combines into one value: sum, max, joined string.\n\nChain them: filter the list, then reduce what's left. Read it as a sentence: *“above five, totaled.”*",
      },
      {
        kind: "example",
        body: "Double, then total the big ones:",
        code: "function doubleAll(nums) {\n  return nums.map(function (n) { return n * 2; });\n}",
      },
      {
        kind: "task",
        body: "Implement **`doubleAll(nums)`** (every number doubled, new array) and **`totalAbove(nums, limit)`** (sum of numbers strictly above limit). Then **Check**.",
      },
    ],
    starterCode: SHELL(
      "Arrays",
      `    <h1>Array gym</h1>\n    <p>Tested through function calls.</p>`,
      `      // TODO 1: doubleAll(nums) — new array, every number doubled\n      // TODO 2: totalAbove(nums, limit) — sum of numbers strictly above limit`
    ),
    checks: [
      {
        id: "uses-methods",
        label: "Array methods do the work",
        feedback:
          "No map/filter/reduce found. Manual loops pass the tests but miss the point — rewrite with the methods.",
        rule: { kind: "text-match", selector: "script", pattern: "\\.map\\(|\\.filter\\(|\\.reduce\\(" },
      },
      {
        id: "doubles",
        label: "doubleAll doubles every item",
        feedback:
          "doubleAll([1,2,3]) should be [2,4,6]. map must RETURN the new array — and the callback must return each value.",
        rule: {
          kind: "scripted",
          ops: [{ id: "d1", act: "call", fn: "doubleAll", args: [[1, 2, 3]] }],
          assertions: [{ op: "d1", equals: [2, 4, 6] }],
        },
      },
      {
        id: "totals",
        label: "totalAbove sums the right items",
        feedback:
          "totalAbove([4,9,2,15], 5) should be 24 (9 + 15). Strictly above means > — and an empty result sums to 0, so start reduce at 0.",
        rule: {
          kind: "scripted",
          ops: [{ id: "t1", act: "call", fn: "totalAbove", args: [[4, 9, 2, 15], 5] }],
          assertions: [{ op: "t1", equals: 24 }],
        },
      },
    ],
    questions: [
      {
        id: "j1",
        prompt: "What is the practical difference between map and forEach?",
        options: [
          "None — they are interchangeable",
          "map returns a new array; forEach returns undefined",
          "forEach is faster on large arrays",
          "map only works on numbers",
        ],
        answer: 1,
        explanation: "map builds and returns a new array; forEach just runs side effects and returns undefined. Mixing them up is a classic undefined bug.",
      },
    ],
    hintLadder: [
      "Which method builds a new array? Which keeps matches? Which combines to one value?",
      "doubleAll is one map line; totalAbove is filter then reduce with a 0 start.",
      "Arrow callbacks without braces return implicitly; with braces you need return. Missing returns give [undefined, undefined].",
      "Test totalAbove([1,2], 99) mentally: filter gives [], reduce of [] with start 0 gives 0 — that edge is why the start matters.",
      "Solution shape: map / filter+reduce chains. Transfer: write pluck(users) returning just names with map — same shape, new domain.",
    ],
    misconceptions: [
      "forEach to build arrays (pushing inside) — map exists for exactly this.",
      "reduce without a start value — crashes or misbehaves on empty arrays.",
      "Mutating the input array — these methods should return new data.",
    ],
    completionNote: "Your list operations read like sentences.",
    masteryNote: "Declarative array thinking with minimal help.",
    needsScript: true,
  },
  {
    id: "js-dom",
    stageId: "js",
    title: "Command the page",
    tagline: "Build: a guest list that grows on click.",
    type: "build",
    difficulty: 3,
    estMinutes: 25,
    objectives: [
      "Create elements with document.createElement",
      "Append them to the live page",
      "Clear inputs after successful actions",
    ],
    prereqIds: ["js-arrays"],
    competencyIds: ["dom-events"],
    whyItMatters:
      "Search results, chat messages, todo items, notifications — the web is lists that grow. Creating and appending nodes is the motion behind all of them.",
    lesson: [
      {
        kind: "prose",
        body: "To grow a list on click:\n\n1. **Select** the input, button, and list once (getElementById).\n2. **Listen** on the button.\n3. Inside: **create** an `li` (`document.createElement('li')`), set its `textContent` from the input, **append** it (`list.appendChild(li)`), and **clear** the input.\n\n`textContent` — never `innerHTML` — for user input. innerHTML with user text is an XSS hole.",
      },
      {
        kind: "example",
        body: "The append pattern:",
        code: "const li = document.createElement('li');\nli.textContent = input.value;\nlist.appendChild(li);\ninput.value = '';",
      },
      {
        kind: "task",
        body: "Wire the guest list: typing a name and clicking **#add** appends it as an `li` in **#guests** and clears the input. The list starts with one guest. Then **Check**.",
      },
    ],
    starterCode: SHELL(
      "Guest list",
      `    <h1>Guest list</h1>\n    <input id="name" type="text" placeholder="Guest name" />\n    <button id="add" type="button">Add guest</button>\n    <ul id="guests">\n      <li>Mo</li>\n    </ul>`,
      `      // TODO: when #add is clicked, append the input value as a new li in #guests`
    ),
    checks: [
      {
        id: "has-list",
        label: "The guest list exists",
        feedback: "No #guests list found. Keep the starter structure — the test grows it.",
        rule: { kind: "has-element", selector: "#guests li" },
      },
      {
        id: "wiring",
        label: "Clicks are wired",
        feedback:
          "No click wiring found. Select #add and #guests, then addEventListener('click', …).",
        rule: { kind: "text-match", selector: "script", pattern: "addEventListener|onclick" },
      },
      {
        id: "grows",
        label: "Adding grows the list (interactive test)",
        feedback:
          "Typing “Ada” and clicking #add should leave 2 items ending in “Ada”. Check the ids, the append target, and that textContent (not innerHTML) carries the name.",
        rule: {
          kind: "scripted",
          ops: [
            { id: "f1", act: "fill", selector: "#name", value: "Ada" },
            { id: "c1", act: "click", selector: "#add" },
            { id: "r1", act: "read", selector: "#guests li", prop: "count" },
            { id: "r2", act: "read", selector: "#guests li:last-child", prop: "text" },
          ],
          assertions: [
            { op: "r1", equals: 2 },
            { op: "r2", equals: "Ada" },
          ],
        },
      },
    ],
    questions: [
      {
        id: "j1",
        prompt: "Why textContent instead of innerHTML for the guest name?",
        options: [
          "textContent renders faster",
          "innerHTML with user input enables script injection (XSS)",
          "textContent supports styling",
          "There is no real difference",
        ],
        answer: 1,
        explanation: "innerHTML parses the string as HTML — a guest named <img onerror=…> would execute. textContent treats everything as inert text.",
      },
    ],
    hintLadder: [
      "Four moves in the handler: create li, set text from input, append to list, clear input. Which is missing?",
      "document.createElement('li') makes it; list.appendChild(li) places it. The input's value is the text.",
      "If the count grows but the text is wrong, you're appending the wrong value — read input.value at click time, not earlier.",
      "If nothing happens, the listener never attached: verify both ids and that addEventListener runs without errors above it.",
      "Solution shape is the four example lines. Transfer: add a remove button per guest — creation in reverse.",
    ],
    misconceptions: [
      "innerHTML for user text — the XSS hole beginners ship most.",
      "Appending to document.body instead of the list — structure matters.",
      "Reading the input once at load — always read at click time.",
    ],
    completionNote: "Your list grows on demand from real user input.",
    masteryNote: "Create-append thinking with minimal help.",
    needsScript: true,
  },
  {
    id: "js-forms",
    stageId: "js",
    title: "Validate like you mean it",
    tagline: "Build: a signup form that refuses bad email.",
    type: "build",
    difficulty: 3,
    estMinutes: 30,
    objectives: [
      "Intercept submit and decide with preventDefault",
      "Validate input and show actionable errors",
      "Confirm success explicitly",
    ],
    prereqIds: ["js-dom"],
    competencyIds: ["dom-events", "js-logic"],
    whyItMatters:
      "Every signup, checkout, and settings page stands on this: never trust input, always explain rejection, confirm success.",
    lesson: [
      {
        kind: "prose",
        body: "HTML gives you `type=\"email\"` and `required` for free — but real rules need JavaScript:\n\n1. Listen for **`submit`** on the form (not click on the button — submits also come from Enter).\n2. Call **`e.preventDefault()`** to stop the page reload, then judge the value.\n3. Invalid → write a helpful message into **#error**. Valid → clear it and show **#done**.\n\nValidate the *value*, announce the *problem*, confirm the *outcome*.",
      },
      {
        kind: "example",
        body: "The validation shape:",
        code: "form.addEventListener('submit', (e) => {\n  e.preventDefault();\n  if (!email.value.includes('@')) {\n    error.textContent = 'Enter an email with @.';\n    return;\n  }\n  error.textContent = '';\n  done.textContent = 'Welcome!';\n});",
      },
      {
        kind: "task",
        body: "Validate the signup: submitting without an `@` in **#email** shows an error mentioning email; a valid address clears the error and shows **#done** as “Welcome!”. Then **Check**.",
      },
    ],
    starterCode: SHELL(
      "Signup",
      `    <h1>Signup</h1>\n    <form id="signup">\n      <label for="email">Email</label>\n      <input id="email" name="email" type="text" />\n      <button type="submit">Join</button>\n    </form>\n    <p id="error"></p>\n    <p id="done" hidden></p>`,
      `      // TODO: on #signup submit — without @ show an error, with @ show Welcome! in #done`
    ),
    checks: [
      {
        id: "has-form",
        label: "The signup form exists",
        feedback: "No #signup form found. Keep the starter structure.",
        rule: { kind: "has-element", selector: "#signup" },
      },
      {
        id: "wiring",
        label: "Submit is intercepted",
        feedback:
          "No submit interception found. Listen for submit on the form and call e.preventDefault() — a click-only handler misses Enter-key submits.",
        rule: { kind: "text-match", selector: "script", pattern: "addEventListener|onsubmit|preventDefault" },
      },
      {
        id: "rejects-bad",
        label: "Bad email is refused with guidance",
        feedback:
          "Submitting “not-an-email” left no helpful error. Check for @ and write a message that names the problem.",
        rule: {
          kind: "scripted",
          ops: [
            { id: "f1", act: "fill", selector: "#email", value: "not-an-email" },
            { id: "c1", act: "click", selector: "#signup button" },
            { id: "r1", act: "read", selector: "#error", prop: "text" },
          ],
          assertions: [{ op: "r1", matches: "email|@" }],
        },
      },
      {
        id: "accepts-good",
        label: "Good email clears and confirms",
        feedback:
          "Submitting ada@example.com should empty #error and set #done to “Welcome!”. Both halves matter.",
        rule: {
          kind: "scripted",
          ops: [
            { id: "f2", act: "fill", selector: "#email", value: "ada@example.com" },
            { id: "c2", act: "click", selector: "#signup button" },
            { id: "r2", act: "read", selector: "#error", prop: "text" },
            { id: "r3", act: "read", selector: "#done", prop: "text" },
          ],
          assertions: [
            { op: "r2", equals: "" },
            { op: "r3", equals: "Welcome!" },
          ],
        },
      },
    ],
    questions: [
      {
        id: "j1",
        prompt: "Why listen for submit on the form instead of click on the button?",
        options: [
          "Click handlers are slower",
          "Enter-key submits bypass button clicks entirely",
          "Forms cannot contain buttons",
          "Submit events carry the password",
        ],
        answer: 1,
        explanation: "Pressing Enter in a field submits the form without clicking anything — click-only validation silently skips those users.",
      },
    ],
    hintLadder: [
      "Two outcomes, one handler: what distinguishes them? The @ check decides the branch.",
      "e.preventDefault() first, then if (!email.value.includes('@')) set the error and return; otherwise clear and confirm.",
      "If the bad case passes but the good case fails, the error is never cleared or #done never set — handle both branches fully.",
      "Clicking the submit button in the test fires a real submit. If nothing happens, the listener target or event name is off.",
      "Solution shape is the example. Transfer: require 8+ character passwords too — validation composes by stacking rules.",
    ],
    misconceptions: [
      "Click-only validation — Enter-key users walk straight past it.",
      "Forgetting preventDefault — the page reloads and evidence vanishes.",
      "“Invalid input” as the whole message — name the fix, not just the failure.",
    ],
    completionNote: "Your form judges input and explains itself.",
    masteryNote: "Validation thinking (intercept, judge, announce) with minimal help.",
    needsScript: true,
  },
  {
    id: "js-async",
    stageId: "js",
    title: "Wait for it",
    tagline: "Promises that resolve late — and fail loudly.",
    type: "practice",
    difficulty: 3,
    estMinutes: 25,
    objectives: [
      "Return promises that settle after a delay",
      "Resolve values and reject with real Errors",
      "Distinguish waiting from blocking",
    ],
    prereqIds: ["js-forms"],
    competencyIds: ["async", "js-logic"],
    whyItMatters:
      "Network, timers, files, databases — everything slow in programming arrives as a promise. Awaiting without blocking the page is the skill underneath fetch, and fetch is underneath every app.",
    lesson: [
      {
        kind: "prose",
        body: "A **Promise** is a value with a delivery date:\n\n- `new Promise((resolve) => setTimeout(() => resolve({ name: 'Ada' }), 200))` delivers an object 200ms later. The page stays interactive meanwhile — **waiting is not blocking**.\n- Rejections carry **`Error` objects**: `reject(new Error('timeout'))` — always Errors, never bare strings, so stacks survive.\n- These exercises use short delays instead of real network (deterministic and offline). Real `fetch` arrives in later stages on top of exactly this mechanism.",
      },
      {
        kind: "example",
        body: "Deliver late, fail loudly:",
        code: "function loadUser() {\n  return new Promise((resolve) => {\n    setTimeout(() => resolve({ name: 'Ada', role: 'admin' }), 200);\n  });\n}",
      },
      {
        kind: "task",
        body: "Implement **`loadUser()`** (resolves `{ name: 'Ada', role: 'admin' }` after ~200ms) and **`failLogin()`** (rejects with `Error('timeout')` after ~100ms). The harness awaits both. Then **Check**.",
      },
    ],
    starterCode: SHELL(
      "Async",
      `    <h1>Async gym</h1>\n    <p>Tested through calls — the harness waits for your promises.</p>`,
      `      // TODO 1: loadUser() hands back { name: 'Ada', role: 'admin' } after a short delay\n      // TODO 2: failLogin() turns down the request with Error('timeout') after a short delay`
    ),
    checks: [
      {
        id: "promise-syntax",
        label: "Real async machinery is used",
        feedback:
          "No promise construction found. Return new Promise(...) with setTimeout inside — a plain object can't arrive late.",
        rule: { kind: "text-match", selector: "script", pattern: "new Promise|async function|\\.then\\(|await " },
      },
      {
        id: "resolves-user",
        label: "loadUser delivers the user",
        feedback:
          "loadUser() didn't resolve { name: 'Ada', role: 'admin' }. Resolve inside setTimeout — and make sure to RETURN the promise.",
        rule: {
          kind: "scripted",
          ops: [{ id: "u1", act: "call", fn: "loadUser", args: [] }],
          assertions: [{ op: "u1", equals: { name: "Ada", role: "admin" } }],
        },
      },
      {
        id: "rejects-login",
        label: "failLogin fails with a real Error",
        feedback:
          "failLogin() should reject with Error('timeout'). Reject with an Error object, not a string — and return the promise so the failure reaches the caller.",
        rule: {
          kind: "scripted",
          ops: [{ id: "f1", act: "call", fn: "failLogin", args: [] }],
          assertions: [{ op: "f1", expectError: "timeout" }],
        },
      },
    ],
    questions: [
      {
        id: "j1",
        prompt: "While awaiting a 200ms promise, what can the page do?",
        options: [
          "Nothing — await freezes the whole page",
          "Everything else — waiting yields; only the awaiting function pauses",
          "Only CSS animations continue",
          "It depends on the browser brand",
        ],
        answer: 1,
        explanation: "await suspends that function, not the thread. Clicks, timers, and rendering continue — that non-blocking wait is the entire point.",
      },
    ],
    hintLadder: [
      "Who creates the delay, and who delivers the value? setTimeout waits; resolve/reject deliver.",
      "loadUser: return new Promise with setTimeout(() => resolve({...}), 200). failLogin mirrors with reject(new Error('timeout')).",
      "Forgetting return gives undefined immediately — the harness then waits on nothing. Return the promise itself.",
      "Rejecting with the string 'timeout' instead of Error('timeout') passes a loose check but loses the stack — Errors only.",
      "Solution shape: two promise factories. Transfer: chain loadUser().then(u => u.name) — composition over waiting.",
    ],
    misconceptions: [
      "Returning the value instead of a promise — late data needs the wrapper.",
      "Rejecting with strings — stacks vanish; always Error objects.",
      "Confusing waiting with blocking — the page lives on during await.",
    ],
    completionNote: "Your code waits without blocking and fails honestly.",
    masteryNote: "Promise thinking with minimal help — fetch will feel familiar.",
    needsScript: true,
  },
  {
    id: "js-debug",
    stageId: "js",
    title: "Broken cart",
    tagline: "A debugging mission: the total lies. Find out why.",
    type: "debugging",
    difficulty: 3,
    estMinutes: 25,
    objectives: [
      "Trace a wrong total back to string concatenation",
      "Convert dataset strings to numbers deliberately",
      "Verify with the exact failing inputs",
    ],
    prereqIds: ["js-async"],
    competencyIds: ["js-logic", "dom-events"],
    whyItMatters:
      "“The total is wrong” tickets are JavaScript's home turf: dataset values are strings, + concatenates, and the page happily displays nonsense with a straight face.",
    lesson: [
      {
        kind: "prose",
        body: "The starter cart adds prices — and lies. Click the $60 item, then the $45 item: the total reads **$06045** instead of **$105**.\n\nThe culprit class: `element.dataset.price` is a **string**. `\"0\" + \"60\"` isn't addition, it's gluing: `\"060\"`. JavaScript won't warn you — strings plus anything is more string.\n\nThe fix is one conversion at the boundary: `Number(btn.dataset.price)` before it touches the total.",
      },
      {
        kind: "task",
        body: "Fix the total: convert prices with **`Number(...)`** (or equivalent) so $60 + $45 reads **$105**. Change the script only — the HTML stays. Then **Check**.",
      },
    ],
    starterCode: SHELL(
      "Shop",
      `    <h1>Shop</h1>\n    <button data-add data-price="60" type="button">Add gadget ($60)</button>\n    <button data-add data-price="45" type="button">Add widget ($45)</button>\n    <p>Total: <span id="total">$0</span></p>`,
      `      let total = 0;\n      const out = document.getElementById('total');\n      document.querySelectorAll('[data-add]').forEach((btn) => {\n        btn.addEventListener('click', () => {\n          total = total + btn.dataset.price;\n          out.textContent = '$' + total;\n        });\n      });`
    ),
    checks: [
      {
        id: "has-buttons",
        label: "Both price buttons exist",
        feedback: "The [data-add] buttons are missing. Keep the starter HTML — the bug is in the script.",
        rule: { kind: "count-min", selector: "[data-add]", min: 2 },
      },
      {
        id: "converts",
        label: "Prices convert to numbers",
        feedback:
          "No conversion found. dataset values are strings — wrap with Number(...) (or parseInt/+) before adding.",
        rule: { kind: "text-match", selector: "script", pattern: "Number\\(|parseInt\\(|parseFloat\\(|\\+btn\\.dataset|\\+price" },
      },
      {
        id: "total-right",
        label: "$60 + $45 reads $105 (interactive test)",
        feedback:
          "The total still isn't $105 after both clicks. Reproduce it yourself in the preview, then check what + does to a string.",
        rule: {
          kind: "scripted",
          ops: [
            { id: "c1", act: "click", selector: 'button[data-price="60"]' },
            { id: "c2", act: "click", selector: 'button[data-price="45"]' },
            { id: "r1", act: "read", selector: "#total", prop: "text" },
          ],
          assertions: [{ op: "r1", equals: "$105" }],
        },
      },
    ],
    questions: [
      {
        id: "j1",
        prompt: "Why did '$0' + 60 produce '$060' instead of 60?",
        options: [
          "JavaScript rounds string math down",
          "The + operator with a string concatenates instead of adding",
          "dataset values are encrypted",
          "The dollar sign disables arithmetic",
        ],
        answer: 1,
        explanation: "+ with any string operand means concatenation. Convert first, then add — the boundary between DOM strings and math is where this bug always lives.",
      },
    ],
    hintLadder: [
      "Reproduce first: click both buttons in the preview and read the total. What operation glues instead of adds?",
      "btn.dataset.price is a string like \"60\", not the number 60. The + then concatenates.",
      "Convert at the boundary: Number(btn.dataset.price) before it meets total. One expression changes.",
      "If the total is now right but the text check fails, your conversion spells differently than the patterns — Number(...) is the canonical fix.",
      "Solution shape: one Number() wrap. Transfer: audit any code adding dataset or input values — strings at every boundary.",
    ],
    misconceptions: [
      "Trusting + to mean add — with strings it means glue, silently.",
      "Converting the total instead of the price — fix inputs at the boundary, not outputs.",
      "Rewriting the whole handler — one expression is the bug; scope the fix.",
    ],
    completionNote: "You traced a lying total to a type boundary and fixed it.",
    masteryNote: "String-boundary debugging with minimal help.",
    needsScript: true,
  },
  {
    id: "js-boss",
    stageId: "js",
    title: "Boss challenge: task board",
    tagline: "A working task app from a brief. No steps. Just you.",
    type: "project",
    difficulty: 4,
    estMinutes: 60,
    objectives: [
      "Plan an interactive app from a written specification",
      "Combine state, events, filtering, and derived counts",
      "Deliver without step-by-step instructions",
    ],
    prereqIds: ["js-debug"],
    competencyIds: ["js-logic", "dom-events"],
    whyItMatters:
      "Todo apps are the \"hello world\" of real frontend work because they compress everything — state, events, filtering, derived data — into one honest little program.",
    lesson: [
      {
        kind: "prose",
        body: "**The brief.** Build “Drift Tasks”, a task board:\n\n1. Typing text into **#task** and clicking **#add** appends an `li.task` with that text and clears the input. Empty input adds nothing.\n2. Clicking a task **toggles** its `done` class.\n3. **#show-all / #show-open / #show-done** filter which tasks display (`display: none` hides).\n4. **#open-count** always reads “N open” for the current number of non-done tasks.\n\nStructure is given; behavior is yours. The checks run one full user session: add → toggle → filter, then read the evidence.",
      },
      {
        kind: "task",
        body: "Build the whole app in the editor. **Check** runs the user session and reports what diverged — never the code to write.",
      },
    ],
    starterCode: SHELL(
      "Drift Tasks",
      `    <h1>Drift Tasks</h1>\n    <input id="task" type="text" placeholder="New task" />\n    <button id="add" type="button">Add</button>\n    <div>\n      <button id="show-all" type="button">All</button>\n      <button id="show-open" type="button">Open</button>\n      <button id="show-done" type="button">Done</button>\n    </div>\n    <ul id="tasks">\n      <li class="task">Sample task</li>\n    </ul>\n    <p id="open-count">1 open</p>`,
      `      // The brief is the instruction. Build it all here.`
    ),
    checks: [
      {
        id: "boss-structure",
        label: "Task list exists with a sample",
        feedback: "No #tasks list found. Keep the starter structure — behavior is what's assessed.",
        rule: { kind: "count-min", selector: "#tasks li", min: 1 },
      },
      {
        id: "boss-input",
        label: "Input and add button exist",
        feedback: "Need #task input and #add button. Keep the starter elements.",
        rule: { kind: "has-element", selector: "#task" },
      },
      {
        id: "boss-add-btn",
        label: "Add control exists",
        feedback: "No #add button found.",
        rule: { kind: "has-element", selector: "#add" },
      },
      {
        id: "boss-title",
        label: "Real heading",
        feedback: "The h1 needs real text.",
        rule: { kind: "text-match", selector: "h1", pattern: ".{4,}" },
      },
      {
        id: "boss-wiring",
        label: "Events are wired",
        feedback:
          "No event wiring found. Clicks (add, toggle, filters) all need listeners.",
        rule: { kind: "text-match", selector: "script", pattern: "addEventListener|onclick" },
      },
      {
        id: "boss-flow",
        label: "Full user session works (interactive test)",
        feedback:
          "The session diverged: add “Write tests”, toggle the first task, filter Open — then #open-count must read “1 open”, the done task must hide, and the last item must read “Write tests”. Walk the session yourself in the preview.",
        rule: {
          kind: "scripted",
          ops: [
            { id: "f1", act: "fill", selector: "#task", value: "Write tests" },
            { id: "c1", act: "click", selector: "#add" },
            { id: "c2", act: "click", selector: "#tasks li" },
            { id: "c3", act: "click", selector: "#show-open" },
            { id: "r1", act: "read", selector: "#open-count", prop: "text" },
            { id: "r2", act: "read", selector: "#tasks li.done", prop: "attr", attr: "style" },
            { id: "r3", act: "read", selector: "#tasks li:last-child", prop: "text" },
          ],
          assertions: [
            { op: "r1", equals: "1 open" },
            { op: "r2", matches: "none" },
            { op: "r3", equals: "Write tests" },
          ],
        },
      },
    ],
    hintLadder: [
      "Which assertion fails? Each names the exact evidence: count text, hidden style, last item. That IS the spec.",
      "Build in layers: add works → toggle works → filters work → count refreshes on every change. Verify each layer in the preview before the next.",
      "The count must refresh on ADD, TOGGLE, and FILTER — one refresh() called from all three paths.",
      "Filtering hides with style.display = 'none' and reveals with ''. Toggling flips the done class; count reads non-done items.",
      "This level stays thin by design: re-read the brief line for the failing evidence. Session-thinking under load is the assessed skill.",
    ],
    misconceptions: [
      "Refreshing the count on add only — toggle and filter change it too.",
      "Removing instead of hiding for filters — hiding preserves state for the next filter.",
      "Empty input adding blank tasks — guard with trim().",
    ],
    completionNote:
      "You shipped a working task app from a brief — Stage 3 graduation evidence.",
    masteryNote:
      "Independent interactive delivery with minimal help. State, events, filtering, derived counts — the frontend loop is yours.",
    isBoss: true,
    needsScript: true,
  },
];
