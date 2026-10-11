# NEXORA — Complete product design blueprint

Product experience · Interaction design · Component system · Responsive behavior · Implementation priorities

The most important design decision is this: NEXORA should be designed around the learner's next action, not around the number of features it can fit on screen.

The references suggest several useful principles. Boot.dev emphasizes substantial coding practice, structured career paths, projects, and Socratic AI assistance.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.boot.dev\&sz=32)

Boot.dev

&#x20;Codecademy organizes learning into paths with lessons, quizzes, projects, and milestones.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://help.codecademy.com\&sz=32)

Codecademy Help Center

&#x20;freeCodeCamp combines theory, workshops, labs, reviews, and quizzes, with automated tests to make practical progress visible.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://contribute.freecodecamp.org\&sz=32)

freeCodeCamp.org

&#x20;MDN also highlights the importance of fundamentals, accessibility, debugging, tooling, and problem-solving rather than rushing straight to frameworks.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://developer.mozilla.org\&sz=32)

MDN

+1



NEXORA's opportunity is to bring these learning methods together around a more adaptive, visually distinctive roadmap, while keeping the actual learning workspace separate.

## 1. The product experience

There should be five principal experiences, each with a specific job.

01 — The Roadmap

Orientation and discovery

An interactive map of stages and skills. Learners understand where they are, which paths are available, and what comes next. There is no embedded code editor on this screen.

02 — The Learning Workspace

Learning and practice

A dedicated experience for a selected mission. It adapts to the activity: explanation, prediction, code editing, preview, debugging, tests, and hints.

03 — Projects

Application and portfolio building

A dedicated place for larger projects, requirements, progress, test history, source code, deployment links, and project documentation.

04 — Skills and Evidence

Competence and reflection

A graph of demonstrated skills backed by assessment attempts, projects, code reviews, tests, and independent challenges—not just time spent or XP earned.

05 — Profile and Preferences

Personalization and continuity

Learning goal, chosen pace, accessibility settings, history, saved work, privacy choices, and account management.

These are different experiences, not five dashboards that all repeat the same statistics.

## 2. The end-to-end interaction model

The central interaction should be simple and predictable.

\#chatgpt-mermaid-\_r_mu\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_mu\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_mu\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_mu\_ .error-icon{fill:rgb(243, 243, 243);}#chatgpt-mermaid-\_r_mu\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_mu\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_mu\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_mu\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_mu\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_mu\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_mu\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_mu\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_mu\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_mu\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_mu\_ p{margin:0;}#chatgpt-mermaid-\_r_mu\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_mu\_ .cluster-label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_mu\_ .cluster-label span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_mu\_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-\_r_mu\_ .label text,#chatgpt-mermaid-\_r_mu\_ span{fill:rgb(13, 13, 13);color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_mu\_ .node rect,#chatgpt-mermaid-\_r_mu\_ .node circle,#chatgpt-mermaid-\_r_mu\_ .node ellipse,#chatgpt-mermaid-\_r_mu\_ .node polygon,#chatgpt-mermaid-\_r_mu\_ .node path{fill:rgb(222, 234, 251);stroke:rgb(83, 154, 248);stroke-width:1px;}#chatgpt-mermaid-\_r_mu\_ .rough-node .label text,#chatgpt-mermaid-\_r_mu\_ .node .label text,#chatgpt-mermaid-\_r_mu\_ .image-shape .label,#chatgpt-mermaid-\_r_mu\_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-\_r_mu\_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-\_r_mu\_ .rough-node .label,#chatgpt-mermaid-\_r_mu\_ .node .label,#chatgpt-mermaid-\_r_mu\_ .image-shape .label,#chatgpt-mermaid-\_r_mu\_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-\_r_mu\_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-\_r_mu\_ .root .anchor path{fill:rgb(143, 143, 143)!important;stroke-width:0;stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_mu\_ .arrowheadPath{fill:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_mu\_ .edgePath .path{stroke:rgb(143, 143, 143);stroke-width:1px;}#chatgpt-mermaid-\_r_mu\_ .flowchart-link{stroke:rgb(143, 143, 143);fill:none;}#chatgpt-mermaid-\_r_mu\_ .edgeLabel{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_mu\_ .edgeLabel p{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_mu\_ .edgeLabel rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_mu\_ .labelBkg{background-color:rgba(252, 252, 252, 0.5);}#chatgpt-mermaid-\_r_mu\_ .cluster rect{fill:rgb(243, 243, 243);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_mu\_ .cluster text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_mu\_ .cluster span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_mu\_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(243, 243, 243);border:1px solid rgba(0, 0, 0, 0.1);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-\_r_mu\_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_mu\_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-\_r_mu\_ .icon-shape,#chatgpt-mermaid-\_r_mu\_ .image-shape{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_mu\_ .icon-shape p,#chatgpt-mermaid-\_r_mu\_ .image-shape p{background-color:rgb(252, 252, 252);padding:2px;}#chatgpt-mermaid-\_r_mu\_ .icon-shape .label rect,#chatgpt-mermaid-\_r_mu\_ .image-shape .label rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_mu\_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-\_r_mu\_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-\_r_mu\_ .node .neo-node{stroke:rgb(83, 154, 248);}#chatgpt-mermaid-\_r_mu\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_mu\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_mu\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_mu\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_mu\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_mu\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_mu\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_mu\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_mu\_ [data-look="neo"].node .neo-line path{stroke:rgb(83, 154, 248);filter:none;}#chatgpt-mermaid-\_r_mu\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_mu\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_mu\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_mu\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_mu\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_mu\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_mu\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_mu\_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(0, 79, 153);}#chatgpt-mermaid-\_r_mu\_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(0, 79, 153);}#chatgpt-mermaid-\_r_mu\_ .node tspan[font-weight="normal"],#chatgpt-mermaid-\_r_mu\_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-\_r_mu\_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(245, 250, 255);stroke:rgb(206, 219, 229);stroke-width:1px;}#chatgpt-mermaid-\_r_mu\_ .node rect,#chatgpt-mermaid-\_r_mu\_ .node circle,#chatgpt-mermaid-\_r_mu\_ .node ellipse,#chatgpt-mermaid-\_r_mu\_ .node polygon,#chatgpt-mermaid-\_r_mu\_ .node path{fill:rgb(229, 243, 255);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_mu\_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-\_r_mu\_ .node.mermaid-decision .label-container{fill:rgb(245, 250, 255);stroke:rgb(206, 219, 229);stroke-dasharray:2,2;}#chatgpt-mermaid-\_r_mu\_ .edgePaths .flowchart-link{stroke:rgb(143, 143, 143);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-\_r_mu\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_mu\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}OnboardingPractical diagnosticPersonalized roadmapSelect a nodeShow missing prerequisiteOpen dedicated workspaceLearn, predict, practice or codeRun deterministic checksRequirements met?Feedback, hints and anotherattemptRecord completion andevidenceUpdate roadmap and masteryRecommend next missionUpdate project or portfoliowhen relevantLockedAvailable or in progressNoYes

Important interaction decision: clicking an available roadmap node should navigate to its dedicated mission workspace. It should not open an editor inside the map or produce a page filled with unrelated dashboard cards.

The workspace can begin with a lesson or challenge brief, and show the editor when that mission requires it. If the learner returns later, they resume the last relevant activity, not the first page of the course.

## 3. Design the roadmap screen component by component

The roadmap is NEXORA's signature. It needs to feel original, but the map must remain useful after a learner has completed hundreds of missions.

### 3.1 Page layout

Use a compact top navigation, a small amount of journey context, and a large central canvas. Do not use a permanent left sidebar on this screen.

NEXORA / Web Development

Search

YOUR LEARNING JOURNEY

# From the basics to building for real.

Stage 1 of 10 · HTML Foundations

Current stage

## HTML

4 of 8 missions

Skill evidence

## 3 skills

Demonstrated

Recommended

## Next mission

Links & navigation

### HTML Foundations

Stage map

Web and browsers

MASTERED · Assessment passed

HTML semantics

IN PROGRESS · Continue

Links and navigation

AVAILABLE · 20 min

Forms and accessibility

LOCKED · Complete the prerequisites

Illustrative stage preview

Explore the full map ↗

This is an information-architecture wireframe, not the final visual design. The production roadmap should use a spatially connected map as its primary view.

The critical hierarchy is:

1. Where the learner is in the curriculum.
2. The current stage and its interconnected missions.
3. The next appropriate action.
4. Supporting progress information.

All other information should be secondary.

### 3.2 Global header

Components: logo, current specialization, primary navigation, search, notifications when needed, and profile menu.

| Component               | Behavior                                                                   |
| ----------------------- | -------------------------------------------------------------------------- |
| Logo                    | Returns to the roadmap, preserving relevant progress.                      |
| Specialization switcher | Switches between enrolled learning paths; prompts for setup if none exist. |
| Roadmap                 | Opens the map at the learner's current position.                           |
| Projects                | Opens current projects and portfolio artifacts.                            |
| Skills                  | Opens the competency and evidence view.                                    |
| Search                  | Finds lessons, concepts, projects, and skills.                             |
| Profile                 | Opens account, preferences, saved work, and sign-out.                      |

Use a top navigation rather than a permanent desktop sidebar. Inside the workspace, the navigation should become even more compact to conserve coding space.

Do not add badges, social feeds, or notification counts unless there is meaningful information behind them.

### 3.3 Roadmap stage navigation

The curriculum contains ten stages, but the learner should not have to inspect all ten in detail on every visit.

The stage navigator should provide:

- Stage name and position.
- A compact completion indicator.
- Locked, available, active, or completed states.
- A way to move between stages without losing the current position.
- A stage summary on selection.

Show one stage at a time by default. Allow learners to zoom out to the full journey or open a list view for direct navigation.

Important: stage numbers describe the canonical curriculum, not mandatory pacing. A learner who demonstrates CSS proficiency should be able to advance without pretending they started from zero.

### 3.4 Roadmap canvas

The main canvas should use a technical atlas visual language: connected paths, purposeful branches, clear typography, sparse gridwork, and geometric node symbols. Avoid literal fantasy mountains, elaborate illustrated islands, or glowing decoration behind every item.

Each node should represent a meaningful activity:

| Node type      | Visual treatment                            | Purpose                                    |
| -------------- | ------------------------------------------- | ------------------------------------------ |
| Concept        | Simple circular or hexagonal marker         | Learn a specific concept.                  |
| Practice       | Compact marker with an exercise glyph       | Build fluency through repetition.          |
| Debugging      | Marker with a bug or wrench glyph           | Diagnose and fix a failure.                |
| Project        | Larger, distinct project marker             | Apply several competencies together.       |
| Review         | Marker with a recall or refresh glyph       | Revisit previously learned material.       |
| Boss challenge | Special milestone marker                    | Demonstrate independent competence.        |
| Optional quest | Branch marker with a visible optional label | Explore without blocking core progression. |

Do not use one identical circular icon for every type of activity.

Each node should display only its title, relevant state, and perhaps effort or duration when space allows. Detailed information belongs in the workspace or node preview.

### 3.5 Node statuses and interactions

The status model needs to be precise.

| State          | Meaning                                            | Interaction                                          |
| -------------- | -------------------------------------------------- | ---------------------------------------------------- |
| Locked         | One or more prerequisites are unmet.               | Show the missing prerequisite and how to satisfy it. |
| Available      | The learner is eligible to begin.                  | Open the mission workspace.                          |
| Recommended    | The engine identifies it as the best next action.  | Emphasize it without blocking alternatives.          |
| In progress    | Work has already started.                          | Resume from the last saved position.                 |
| Completed      | Minimum completion criteria have been met.         | Revisit or practice again.                           |
| Mastered       | Strong evidence supports the competency.           | View assessment evidence and continue.               |
| Needs practice | Recent evidence indicates a weakness.              | Offer a targeted refresher.                          |
| Optional       | The mission enriches the path but is not required. | Start freely without changing core prerequisites.    |

States need more than color. Use iconography, labels, outlines, and explanatory text. A red node must not be the only indication of an error, and a green node must not be the only indication of mastery.

Node click behavior

- Hover or keyboard focus: preview the node's title, type, and state.
- Click a locked node: display its missing prerequisite and a route to that prerequisite.
- Click an available or in-progress node: navigate to the dedicated workspace.
- Activate a completed node: reopen it or view the result.
- Activate a mastered node: inspect the evidence or launch a review exercise.

The map must remember its zoom, stage, and scroll position when the learner returns from a mission.

### 3.6 Persistent next-step action

Use one primary action, such as Continue learning, which always knows what should happen next.

Its destination should depend on the learner's state:

- No diagnostic completed → continue the diagnostic.
- No mission started → start the recommended introductory mission.
- Mission in progress → resume it.
- Mission completed, prerequisites satisfied → open the next recommendation.
- Learner needs practice → open the specific refresher with an explanation.
- All required missions completed → direct the learner toward the next milestone or independent project.

This is more valuable than displaying XP, streaks, and several competing action cards.

## 4. The learning workspace: define the most important screen

The workspace should be a focused environment that changes with the task. It is not simply a code editor with an article beside it.

A semantic HTML lesson, a debugging challenge, and a deployment incident require different arrangements.

### 4.1 Workspace structure

Roadmap / HTML / HTML semantics

Saved

MISSION 04

### HTML semantics

Learn what semantic elements communicate to browsers, assistive technologies, and developers.

Your task: replace generic containers with meaningful document structure and verify the result.

Hint available

index.html

\<main>   \<article>     \<h1>My first page\</h1>     \<p>Build something meaningful.\</p>   \</article> \</main>

&#x20;Run

Preview

### My first page

Build something meaningful.

Checks

2 of 3 requirements passed

One semantic element still needs attention.

Illustrative workspace structure. The real editor would provide full syntax highlighting, editing, keyboard shortcuts, and resizable panels.

### 4.2 Workspace header

Components: roadmap breadcrumb, mission title, lesson progress, save status, help menu, and exit action.

The header should answer:

- Which mission am I working on?
- Where am I within this mission?
- Is my work saved?
- How do I return to the roadmap?

Use a normal navigation action to exit, not a modal that unexpectedly destroys work. Unsaved changes should be saved automatically where possible and protected by a confirmation if they cannot be recovered.

### 4.3 Mission instructions panel

The instruction area contains:

- Mission introduction.
- Learning objectives.
- Current task.
- Completion criteria.
- Relevant examples.
- Hint entry point.
- Optional reference material.

The instructions should distinguish between what the learner must achieve and how they might achieve it. If the goal is to teach independent problem-solving, do not put the complete implementation in the initial instructions.

Provide a collapsible concept explanation and a visible task summary. The learner should not have to hunt through a long article to remember what the exercise asks.

### 4.4 Code editor

Required components:

- File tabs and an optional file explorer for multi-file tasks.
- Syntax highlighting.
- Line numbers and visible focus.
- Undo and redo.
- Useful error messages.
- Copy and paste.
- Keyboard shortcuts.
- Run and submit actions.
- A clear indication of unsaved or running work.

For an HTML-only beginner mission, the learner might initially see one `index.html` file. Introduce multiple files only when required by the lesson. Do not burden beginners with a professional IDE's full feature set before those features are relevant.

For more advanced projects, progressively introduce file trees, terminal access, diffs, Git, debugging, and multi-file workflows.

### 4.5 Preview panel

For web-development exercises, the learner should be able to see the website resulting from their code.

Components:

- Live or explicitly refreshed preview.
- Refresh and open-preview controls.
- Desktop and mobile viewport sizes.
- Error state if the preview fails.
- A clear distinction between the learner's output and the platform's instructions.

The preview should be hidden or minimized for missions where it is not useful. Not every coding exercise needs one.

Never execute untrusted HTML or JavaScript directly inside the privileged application context. Preview rendering must use an appropriately isolated environment.

### 4.6 Tests and console

Tests should tell learners what failed and what to investigate.

Each check should have a clear state: not run, running, passed, failed, or unavailable. A failed check should offer an actionable message and, where appropriate, a location or relevant output.

For example, instead of saying only “Test failed,” provide feedback such as:

> The main content is not inside a semantic landmark. Inspect the structure around your page's primary heading.

The platform should avoid revealing hidden test implementations or expected answers unnecessarily in independent assessments.

The console should appear only when relevant. It should be separate from test results so that browser output, runtime errors, and assessment status are not confused.

### 4.7 Hint and AI tutor

Keep assistance contextual and secondary. Use a collapsible panel or small overlay rather than a permanently open chatbot consuming a third of the workspace.

The hint ladder should provide progressively stronger support:

1. Nudge: Direct attention toward the relevant behavior.
2. Concept: Explain the idea that the learner is missing.
3. Investigation: Highlight a file, line, error, or documentation topic.
4. Similar example: Demonstrate an analogous problem.
5. Solution review: Explain a solution when appropriate, then provide a transfer challenge.

The tutor should know the mission instructions, relevant concepts, permitted code context, and public test feedback. It should not invent test results or claim code has passed without a real test result.

Hints must not be punitive. Record assistance level for learning analysis, but assess independent competence separately.

### 4.8 Mission action controls

Keep the control set predictable:

- Run: Execute code and refresh relevant output.
- Check: Run assessment tests.
- Hint: Request the next level of assistance.
- Reset: Restore starter code, with confirmation.
- Submit / Complete mission: Evaluate completion requirements.
- Next step: Continue after successful completion.

Do not show every action at equal visual weight. Run and Check should be prominent when coding is the primary task. Submit appears when the task is ready for evaluation. Next step becomes primary after successful completion.

## 5. One learning engine, multiple mission types

Not every mission should look like an IDE exercise. A common mission framework should support several activity types.

| Mission type           | Primary interface                            | Example                                       |
| ---------------------- | -------------------------------------------- | --------------------------------------------- |
| Concept lesson         | Explanation plus interactive example         | How semantic HTML works                       |
| Prediction             | Code snippet and selectable outcomes         | Predict the result of a JavaScript expression |
| Short practice         | Small editor and immediate checks            | Add a heading and paragraph                   |
| Build challenge        | Editor, task brief, tests, preview           | Build a contact form                          |
| Debugging              | Existing broken code, errors, diagnostics    | Fix a broken responsive layout                |
| Code review            | Diff viewer, requirements, review comments   | Identify an unsafe input-handling change      |
| Project                | Multi-file workspace and milestone checks    | Build a task manager                          |
| Recall review          | Short questions and small exercises          | Revisit array methods                         |
| Independent assessment | Minimal instruction, limited hints           | Implement a feature in unfamiliar code        |
| Engineering simulation | Repository, logs, incidents and test results | Diagnose a failed deployment                  |

These should share a consistent structure and visual system without forcing all of them into the same layout.

### 5.1 The mission lifecycle

Every mission should follow an adaptable sequence:

Orient → Understand → Attempt → Check → Improve → Demonstrate → Reflect

A factual concept may need just a short explanation and a knowledge check. A project could span multiple sessions, use several files, and include tests and milestones.

A mission should end with a meaningful result, not just a “Congratulations” animation.

### 5.2 Completion and mastery

These must be separate concepts throughout the UI.

- Completed: Minimum task requirements were met.
- Mastered: Evidence meets the proficiency criteria across sufficient attempts or contexts.
- Needs practice: Evidence indicates the skill needs reinforcement.
- Assessed independently: The learner demonstrated the ability without the normal hints or guidance.

Never equate XP earned, lessons opened, or time spent with mastery.

## 6. Onboarding and diagnostic design

Onboarding is the first place where the product's promise either becomes real or feels like marketing.

The learner should experience a useful first interaction quickly. Ask only what is necessary at each step and progressively gather information rather than showing a long registration form.

### 6.1 Onboarding components

Step 1 — Choose the goal

Cards or selectable options: build websites, become a frontend developer, become a full-stack developer, or improve existing skills. Each selection should explain what the path leads toward.

Step 2 — Establish a starting point

Ask about prior languages, projects, and relevant tools. Make it clear that these are estimates and can be revised through practical assessment.

Step 3 — Practical diagnostic

Present small tasks appropriate to the learner's reported background. Let them skip a question they cannot attempt without treating that as failure.

Step 4 — Reveal the personalized roadmap

Explain the recommended starting point, which material can be skipped, and which foundational skills require evidence. Let learners adjust the goal or challenge level.

### 6.2 Diagnostic interface details

A good diagnostic should have a few common components:

- One question or task at a time.
- Clear instructions and any necessary reference material.
- A visible progress indicator.
- A skip option.
- An explanation of the result.
- A way to resume later if the diagnostic is interrupted.

Questions should measure actual capabilities. For example, checking whether someone can fix a simple HTML structure is more informative than asking them to rate their HTML skills from one to ten.

Track the estimated skill level and confidence in that estimate separately. If the evidence is weak, recommend a short introductory assessment rather than pretending the platform knows the learner's exact level.

### 6.3 Personalized roadmap generation

Personalization should change actual mission eligibility, ordering, difficulty, or practice recommendations.

Example:

A learner already comfortable with HTML might pass the semantic markup diagnostic, skip some introductory missions, and complete an independent HTML transfer task. The system then unlocks the appropriate next stage.

A learner who knows basic syntax but struggles with semantic structure might keep the same overall progression while receiving a focused remedial mission.

The system should explain its decisions in plain language:

> You passed the HTML structure check, so the introductory exercise is optional. Your diagnostic found a gap in semantic elements, so we've recommended a focused practice mission before the accessibility challenge.

This makes adaptation understandable rather than mysterious.

## 7. Projects, skills, and portfolio

These screens are necessary to support the promise of developing real engineering ability, but they should not compete with the roadmap for attention.

### 7.1 Projects page

The Projects page should behave like a practical workbench, not a gallery of promotional cards.

Use three primary views:

In progress: Projects the learner is building, with the next milestone, last activity, and Resume action.

Ready to review: Projects that pass their minimum checks and need reflection, documentation, code review, or a final assessment.

Completed: Finished projects with source code, test results, deployed links where available, and associated skills.

Each project row or compact card needs only:

- Project name and purpose.
- Current state.
- Key milestone or requirement.
- Relevant skills.
- Last updated.
- Primary action.

Project thumbnails should be useful previews of the learner's actual work. Avoid fabricated artwork or decorative gradients used to fill space.

### 7.2 Project detail

Opening a project leads to a dedicated project view with tabs for:

- Overview and requirements.
- Workspace.
- Milestones and tests.
- Git history or change log, where supported.
- Documentation.
- Feedback and review.
- Deployment.
- Evidence contributing to the learner's portfolio.

Do not expose tabs for features the MVP does not actually implement.

A portfolio entry should distinguish between a guided practice project, a completed capstone, and independently assessed work. Those are different kinds of evidence.

### 7.3 Skills and evidence page

Organize competencies into meaningful domains rather than a wall of percentages.

Suggested domains:

| Domain                | Examples                                       |
| --------------------- | ---------------------------------------------- |
| Web foundations       | HTML structure, semantics, accessibility       |
| Frontend              | CSS layout, JavaScript, component architecture |
| Development workflow  | Git, CLI, debugging                            |
| Backend               | HTTP, APIs, validation, authentication         |
| Data                  | SQL, schema design, transactions               |
| Quality               | Testing, refactoring, security                 |
| Operations            | Deployment, monitoring, incident response      |
| Professional practice | Documentation, communication, code review      |

Selecting a skill should show:

1. What the skill means in practical terms.
2. What proficiency looks like.
3. Evidence already earned.
4. Recent mistakes and patterns, when enough evidence exists.
5. Exercises that can improve it.
6. Why it matters for the learner's goal.

### 7.4 Competency model

Use clear proficiency levels, but don't imply false precision with scores such as 83.7% mastery.

A better initial scale is:

- Introduced: Encountered the concept.
- Practiced: Completed guided exercises.
- Demonstrated: Passed defined checks.
- Independent: Succeeded in a different context with minimal guidance.
- Strong evidence: Repeatedly demonstrated the skill in relevant situations.

Each level must have explicit criteria. Not every competency needs all five states, and a single successful task should not immediately confer the highest level.

## 8. Adaptive recommendations and gamification

### 8.1 The recommendation engine

The recommended next mission should consider:

- Prerequisites.
- Recent assessment outcomes.
- Assistance required.
- Recurring misconceptions.
- Performance on transfer challenges.
- Time since relevant practice, when useful.
- The learner's goal and preferred project themes.

The initial engine should use explicit rules that the product team can inspect and test. AI can explain the reasoning and tailor the instruction, but it should not secretly decide whether a technical assessment passed.

### 8.2 Recommendation hierarchy

At any time, show one primary recommendation and, at most, a small number of alternatives.

For example:

Recommended: Practice semantic HTML.

Reason: Two recent submissions used generic containers where semantic elements were required.

Alternative: Review the concept, take a short knowledge check, or continue to another eligible mission.

Don't produce a feed of ten algorithmically recommended tasks. That would bring back the very decision fatigue the product intends to remove.

### 8.3 Gamification components

| Component         | Design rule                                                                        |
| ----------------- | ---------------------------------------------------------------------------------- |
| XP                | Reward completed learning activities, not time spent staring at the screen.        |
| Milestones        | Represent meaningful skills, projects, or independent assessments.                 |
| Streaks           | Optional and forgiving; missed days must not delete progress.                      |
| Boss challenges   | Larger, less-guided demonstrations of competence.                                  |
| Side quests       | Optional practice or enrichment that doesn't obstruct core progression.            |
| Unlock animations | Brief, restrained, and skippable.                                                  |
| Collectibles      | Represent meaningful artifacts or achievements, not a distracting virtual economy. |
| Leaderboards      | Defer from the MVP.                                                                |

A learner who struggles but eventually understands a concept should not feel punished compared with someone who answered it immediately. Reward persistence and successful recovery where appropriate, but preserve separate evidence of independent competence.

### 8.4 Completion state

When the learner finishes a mission, use a short, meaningful completion screen or overlay.

It should include:

- What was accomplished.
- Which tests or criteria passed.
- What skill evidence was recorded.
- Whether the skill is completed or mastered.
- The next recommendation.
- A way to inspect the work.

Don't force learners through an elaborate animation after every small exercise. Reserve the strongest celebration for significant milestones.

## 9. Visual identity and design system

The visual identity should make NEXORA recognizable without making the interface noisy.

### 9.1 Recommended art direction: technical cartography

The visual metaphor is a map of engineering knowledge, not a fantasy game world.

The map can use connected paths, precise geometry, subtle contour-like linework, carefully placed labels, and sparse accent colors. Progress is communicated through the routes the learner has travelled and the branches now available.

The workspace should use a related but more restrained visual language, prioritizing precision, readability, and code.

### 9.2 Starting color tokens

These are a proposed starting palette, to be validated in real screens rather than treated as final brand specifications.

Graphite

\#10161D

Primary dark canvas

Elevated surface

\#18222B

Panels and editor background

Main text

\#F1F5F7

Headings and primary content

Muted text

\#A5B3BC

Secondary content

Electric mint

\#55E6C1

Active route and primary actions

Success

\#57D6A0

Passed checks and confirmed progress

Warning

\#F3BC65

Caution and optional attention

Error

\#FF7777

Errors and failed checks

Use the accent color mainly for active and recommended elements. A screen where every node glows teal has no meaningful visual hierarchy.

Provide a light theme as an optional later enhancement if the MVP doesn't require it, but choose semantic tokens from the beginning so a second theme can be introduced without rebuilding every component.

### 9.3 Typography

Use two complementary roles:

- A highly readable interface typeface for headings, descriptions, controls, and lessons.
- A monospaced typeface for code, file paths, line references, command output, and technical metadata.

Keep lesson body text comfortable to read, avoid excessive all-caps labels, and limit tiny secondary text. Scale code independently from UI text. Allow users to increase text size without breaking the workspace.

### 9.4 Layout and spacing

Use a consistent spacing scale rather than arbitrary margins on each component. Separate global navigation, page titles, content groups, and actions through spacing and alignment.

Cards should be used selectively for genuinely separate objects. The map itself should not become a grid of cards simply because cards are easy to implement.

### 9.5 Motion

Use animation to explain a state change:

- A path becomes available.
- A node is completed.
- A test transitions from running to passed.
- A workspace panel opens.
- A saved indicator confirms persistence.

Keep motion brief, avoid constant pulsing, and respect reduced-motion preferences. No animated decoration should obscure text, code, or controls.

### 9.6 Reusable design-system components

Build a shared component library around:

Navigation: top bar, breadcrumb, specialization switcher, profile menu.

Roadmap: stage selector, path canvas, node, path connector, status marker, map/list toggle, node preview, recommendation action.

Learning: mission header, objective list, lesson content, interactive example, question, code editor, preview, test result, hint panel, completion view.

Progress: progress meter, milestone marker, competency badge, evidence record, streak indicator.

Projects: project row, milestone list, submission status, test summary, portfolio preview.

Foundations: button, tooltip, dialog, tabs, dropdown, input, checkbox, toast, skeleton loader, empty state, error state, divider.

Every reusable component needs documented states, keyboard behavior, and responsive rules. Avoid building different visual versions of the same control in separate parts of the product.

## 10. Responsive design and accessibility

Responsive behavior must be designed into the product rather than added after the desktop screens are finished.

### 10.1 Desktop

The desktop experience is the primary environment for coding.

- Roadmap uses a large, navigable canvas with a list alternative.
- Workspace uses adjustable panels.
- Editor, preview, and test results can be visible simultaneously when the activity benefits from them.
- Project details and skill evidence use structured multi-column layouts.
- Keyboard shortcuts and editor controls are easy to discover.

Use a minimum supported desktop width established through testing. At narrow widths, collapse secondary panes rather than shrinking the editor and instructions until neither is usable.

### 10.2 Tablet

- Roadmap switches to a more compact graph or stage-based view.
- Selected-node details open in a panel.
- Workspace panels become resizable or tabbed.
- Preview and tests can be shown as dedicated tabs.
- Core navigation remains available.

### 10.3 Mobile

Mobile should be genuinely useful for onboarding, reading, diagnostics, knowledge checks, reviewing progress, and revisiting concepts.

For complex code challenges, make the editor accessible but don't attempt to display three cramped columns.

Use a single active workspace view:

`Instructions | Code | Preview | Tests`

The selected view occupies the available space, with persistent mission context and navigation controls. Saving, switching views, and returning to the roadmap must not discard work.

### 10.4 Accessibility requirements

- Semantic page structure and keyboard navigation.
- Visible focus states and logical focus order.
- Properly labelled inputs and accessible dialogs.
- Contrast that meets WCAG 2.2 AA requirements where applicable.
- Status indicators that do not rely on color alone.
- Screen-reader-accessible alternatives to the graphical roadmap.
- Reduced-motion support.
- Accessible error messages and test results.
- Zoom and text resizing support.
- Instructions that don't depend on visual position alone.

The graphical map should not be the only representation of the curriculum. The list view must contain the same node names, prerequisites, states, and actions.

## 11. Components that are easy to overlook

These details often determine whether the product feels reliable rather than merely attractive.

### 11.1 Saving and recovery

The learner should never have to guess whether their work has been saved.

Provide clear states: Saving, Saved, Offline, and Save failed. Persist progress at meaningful intervals and preserve code drafts across navigation. Where server execution or remote workspaces are used, design for interrupted connections and expired sessions.

For destructive actions, offer confirmation and explain what will be lost.

### 11.2 Loading states

Use meaningful skeletons for the roadmap and workspace. Avoid shifting the entire page when results appear.

When a workspace is preparing an execution environment, explain what is happening. If setup fails, let the learner retry without losing their submission.

### 11.3 Empty states

Every section needs a useful empty state.

| Situation              | Expected response                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------- |
| No projects            | Explain what projects are and direct the learner to the first project milestone.      |
| No skill evidence      | Explain how evidence is earned and recommend an assessment.                           |
| No search results      | Offer related concepts or suggest a broader search.                                   |
| All missions completed | Recommend the next stage, optional challenges, or an independent project.             |
| No network connection  | Preserve locally available work and explain which operations need a connection.       |
| No recommended action  | Recalculate eligible actions or offer a review rather than displaying an empty panel. |

### 11.4 Error handling

Errors should explain what happened, what the learner can do, and whether their work is safe.

Distinguish between a mistake in learner code, an assessment failure, a failed execution environment, a network error, and a platform error. These should never be represented by the same generic red alert.

### 11.5 Search

Search should find more than lesson titles.

Support:

- Concepts and definitions.
- Missions and prerequisites.
- Programming terminology.
- Projects.
- Competencies.
- Previously completed material.

Search results should show the resource type and availability state. A locked result should explain why it's locked. Selecting a result should navigate to the relevant screen, not create a duplicated inline lesson.

### 11.6 Keyboard and command interactions

The interface can eventually support a command palette for navigation, resuming the current mission, opening search, and switching workspace panels.

However, shortcuts must not interfere with code editing. Introduce discoverable commands gradually, and always provide conventional buttons and menus as alternatives.

### 11.7 Session continuity

When a learner returns to the product, it should restore their context:

- Current specialization.
- Last visited stage.
- Current mission and saved draft.
- Last active workspace panel.
- Outstanding assessment state.
- Recommended next step.

Do not force the learner to revisit onboarding or manually find the task they were working on.

## 12. Technical and content architecture behind the UX

The visual experience depends on a consistent underlying model. These rules should be established before implementing the UI.

### 12.1 Curriculum as a graph

Represent the curriculum as a directed graph rather than a fixed array of lessons.

The graph contains stages, missions, concepts, competencies, prerequisites, and optional branches. Each mission can depend on multiple prerequisites, contribute evidence to multiple competencies, and connect to subsequent missions.

The map is a visual representation of that graph, not the source of truth.

### 12.2 Separate content from presentation

A mission should have structured data for:

- Identity, title, and description.
- Objectives and prerequisite IDs.
- Activity type and difficulty.
- Lesson content and examples.
- Starter files and supported execution mode.
- Assessment rules and test fixtures.
- Hint policy.
- Completion and mastery criteria.
- Recommended follow-up missions.
- Content version.

This permits curriculum authors to create new lessons and projects without rebuilding the roadmap interface.

### 12.3 Keep assessments deterministic where possible

Use automated tests for requirements that can be tested objectively. For example, a semantic HTML exercise can check for required elements and document structure.

Use human or structured qualitative review for things such as code readability, design quality, and engineering trade-offs when automated checks cannot adequately assess them.

AI can help explain results and identify possible issues, but it should not be the sole authority for passing technical assessments.

### 12.4 Isolate code execution

Learner code is untrusted input, including code suggested by AI.

Execution must occur outside the main application process, with appropriate filesystem, network, time, memory, CPU, and process limits. Treat preview rendering as a separate security boundary too.

For the MVP, prefer constrained HTML/CSS exercises and limited JavaScript execution over providing unrestricted cloud development environments. Expand the execution model only as the curriculum genuinely requires it.

### 12.5 Version progress and assessment evidence

Store submissions, test outcomes, hint usage, competency evidence, and curriculum versions separately.

If a mission or assessment changes later, the system should still know which version a learner completed. Historical evidence should not silently change because the content author edited a lesson.

## 13. Prioritized component build plan

Do not design or build the entire platform at once. Build the smallest complete learning journey, with the underlying architecture capable of expansion.

## P0

MVP

Core product loop

Top navigation, onboarding, practical diagnostic, personalized roadmap, stage navigator, map/list toggle, node states, mission workspace, basic code editor, preview, deterministic checks, contextual hints, save and restore, completion state, adaptive recommendations, basic skill evidence, responsive behavior, and error handling.

## P1

Expansion

Deeper learning and larger projects

Multi-file workspace, Git scenarios, structured debugging missions, project milestones, independent transfer challenges, spaced reviews, versioned portfolios, richer competency evidence, and more sophisticated adaptive recommendations.

## P2

Longer-term

Professional engineering simulation

Pull-request workflows, peer review, simulated production incidents, deployment exercises, collaboration, public portfolio publishing, additional learning specializations, and optional community experiences.

### Recommended implementation sequence

1. Finalize design tokens and the fundamental interaction model.
2. Build the roadmap shell, graph states, and list alternative.
3. Implement the first mission workspace and its code-execution lifecycle.
4. Author a complete HTML journey with lessons, practice, assessment, and a small project.
5. Connect saving, prerequisites, recommendations, and competency evidence.
6. Implement onboarding and the practical diagnostic against the actual curriculum.
7. Validate the whole experience with learners before adding more screens or gamification.

It is important to build the diagnostic and recommendation model around real curriculum data, even if the initial adaptation rules are simple.

## 14. Acceptance criteria for the design

Before calling the design complete, test the following scenarios from beginning to end.

| Scenario              | What must happen                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| New beginner          | Can choose a goal, complete onboarding, and start an introductory mission.                       |
| Experienced learner   | Can demonstrate prior ability, skip eligible content, and receive an appropriate starting point. |
| Locked node           | Clearly explains the unmet prerequisite and how to satisfy it.                                   |
| Available node        | Opens the dedicated workspace rather than embedding an editor in the map.                        |
| In-progress mission   | Resumes from the saved position with code and progress intact.                                   |
| Incorrect submission  | Gives actionable feedback without erasing the learner's attempt.                                 |
| Repeated difficulty   | Offers focused practice and an alternative explanation.                                          |
| Successful assessment | Records completion and evidence, updates the map, and recommends an appropriate next step.       |
| Completed mission     | Remains accessible for review and practice.                                                      |
| Narrow screen         | Keeps the essential content and actions usable without compressing the entire desktop UI.        |
| Keyboard-only use     | Supports navigation, map alternatives, editing controls, feedback, and dialogs.                  |
| Execution failure     | Distinguishes a platform problem from a learner-code error and protects the saved work.          |

Test not just the happy path, but interrupted sessions, failed saves, expired execution environments, skipped diagnostics, returning to older missions, and learners whose initial skill estimates turn out to be wrong.

## 15. What should be measured

Design success should be tied to whether people learn more effectively and can find their way through the product.

Navigation: Can a learner identify the recommended mission without inspecting the whole curriculum? Do they understand locked prerequisites?

Workspace usability: Can they find the instructions, edit code, run a check, and understand a failure without help from another person?

Learning effectiveness: Do baseline and final practical assessments show improvement? Can learners apply a concept to an unfamiliar task?

Personalization: Does the system avoid repeating material learners have already mastered while providing meaningful help to learners who struggle?

Reliability: Are code drafts preserved? Do mission states and assessment results remain consistent across sessions?

Motivation: Does gamification support continued progress without punishing breaks or rewarding meaningless activity?

For a small initial pilot, observe actual sessions and collect qualitative feedback alongside task completion and learning results. Small samples are useful for identifying design problems, not for making broad claims about educational effectiveness.

## 16. Final design decisions

I would treat the following as non-negotiable design rules.

One primary action

The roadmap always makes the most appropriate next step obvious.

Separate experiences

The map is for orientation; the workspace is for learning and coding.

Progressive complexity

The interface introduces advanced tools only when learners need them.

Adaptive, explainable navigation

Prerequisites, recommendations, and skipped material have understandable reasons.

Competence over activity

XP and completion never substitute for evidence of skill.

A shared visual language

The technical-atlas identity connects the roadmap to a focused professional workspace.

Resilient by design

Saving, recovery, error states, keyboard access, and the list alternative are designed from the start.

Build one excellent path

Complete HTML end to end before expanding to the entire web development curriculum.

The strongest direction for NEXORA is a distinctive, spatial developer roadmap connected to a serious, adaptive coding workspace. Its originality should come from how the roadmap represents knowledge, how the interface responds to the selected task, and how demonstrated skills change the learner's journey—not from piling on illustrations, effects, cards, or game mechanics.

The first design deliverable should therefore be a coordinated set of four detailed screens: onboarding and diagnostic, roadmap, HTML mission workspace, and mission completion with updated progress. Together, those four screens will reveal whether the product's core experience works before the team invests in the larger platform.
