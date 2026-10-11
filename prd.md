# Product Requirements Document (PRD)
## Personalized, Gamified Programming Education Platform

**Status:** Initial product specification  
**Version:** 1.0  
**Product name:** Undecided  
**Initial specialization:** Web Development  
**Initial release:** Interactive, personalized learning roadmap with one complete learning path  
**Primary audience:** Students who want to progress from programming fundamentals to industry-ready software engineering

---

# 1. Executive Summary

## 1.1 Product vision

Build a programming education platform that takes learners from their current skill level to practical engineering competence through a personalized, interactive learning journey.

Instead of presenting a catalogue of courses, the platform presents a visual roadmap of skills, concepts, missions, projects, and milestones. Learners choose a specialization, complete a diagnostic, and receive a learning path tailored to their experience and goals.

For example, a learner who chooses Web Development might see:

**HTML → CSS → JavaScript → Git → Responsive Websites → APIs → Backend Development → Databases → Testing → Deployment → Real Engineering Projects**

Each roadmap node opens an interactive learning experience containing explanations, examples, coding exercises, challenges, and practical projects. Later nodes introduce unfamiliar codebases, bug reports, pull requests, code reviews, production incidents, and deployment workflows.

The platform combines the accessibility and gamification of coding education with the practical demands of real software engineering.

## 1.2 The problem

Traditional programming education often has a gap between understanding concepts and applying them independently.

Learners may finish a course but still struggle to:

- Decide what to learn next.
- Understand unfamiliar code.
- Translate vague requirements into working software.
- Debug errors without being shown the answer.
- Use Git, testing, APIs, and development tools.
- Build complete applications independently.
- Collaborate through pull requests and code reviews.
- Deploy, monitor, and maintain software.

Existing learning resources can be useful, but learners often have to assemble their own progression across tutorials, documentation, projects, and tools.

The platform should make that progression coherent.

## 1.3 The proposed solution

The product has five connected components:

1. **Personalized roadmap:** A visual, interactive map of the learner's journey.
2. **Learning missions:** Short lessons and hands-on challenges attached to roadmap nodes.
3. **Adaptive learning engine:** Determines what to learn, practice, revisit, or skip based on demonstrated ability.
4. **Engineering simulation:** Introduces realistic software development workflows as learners progress.
5. **Evidence-based portfolio:** Records projects, code changes, tests, reviews, and other demonstrations of competence.

The roadmap is the primary navigation surface. The code workspace is where learning happens. The portfolio is where progress becomes demonstrable.

---

# 2. Product Goals and Non-Goals

## 2.1 Goals

### G1. Make the next learning step obvious

A learner should never have to ask, "What should I learn next?"

The platform recommends the next appropriate mission based on prerequisites, demonstrated mastery, interests, and learning goals.

### G2. Make learning interactive

Concepts should be learned through a combination of explanations, visualizations, prediction, coding, debugging, and projects—not long-form reading alone.

### G3. Personalize without sacrificing structure

Every learner follows a coherent progression, but learners can test out of mastered material and receive additional practice where necessary.

### G4. Progress from fundamentals to engineering

The platform must bridge the gap between introductory coding and real software development.

### G5. Make progress meaningful

Progress should reflect both completion and demonstrated skill. Finishing a lesson is not equivalent to mastering a competency.

### G6. Make the experience engaging

Use missions, unlocks, milestones, narratives, skill trees, and optional challenges to encourage consistent learning without turning the experience into a reward-collection exercise.

### G7. Build a foundation for expansion

The initial product should support additional learning paths and specializations without requiring a complete redesign of the curriculum engine.

## 2.2 Non-goals for the initial release

The initial release will not attempt to:

- Support every programming language.
- Offer a complete university-level computer science curriculum.
- Build a fully multiplayer game world.
- Provide a production-scale cloud development environment.
- Offer a recruiter marketplace or hiring platform.
- Implement elaborate virtual currencies, item economies, or cosmetic stores.
- Automatically accept AI-generated code as proof of mastery.
- Replace professional IDEs for advanced development.
- Guarantee employment or job placement.

---

# 3. Target Users

## 3.1 Primary persona: The aspiring web developer

**Profile:** A student who wants to learn web development but does not know the correct sequence of topics.

**Needs:**
- A clear starting point.
- A structured roadmap.
- Practical coding exercises.
- Explanations when confused.
- Projects that grow in complexity.
- Visible progress and achievable milestones.

**Pain points:**
- Too many courses and resources.
- Uncertainty about prerequisites.
- Tutorial hopping.
- Difficulty moving from tutorials to independent projects.
- Losing motivation during abstract topics.

**Success outcome:** Can independently build and deploy a functional web application and explain its implementation.

## 3.2 Secondary persona: The learner who already knows the basics

**Profile:** Understands programming fundamentals but lacks practical experience.

**Needs:**
- A diagnostic that identifies existing knowledge.
- The ability to skip material already mastered.
- Practice with existing codebases.
- Git, testing, APIs, debugging, and deployment.
- Realistic engineering assignments.

**Success outcome:** Can contribute meaningful changes to an unfamiliar codebase and demonstrate the reasoning behind them.

## 3.3 Future persona: The aspiring professional engineer

**Profile:** Has completed several projects and wants to improve engineering quality and independence.

**Needs:**
- Code review and collaboration.
- Performance and security challenges.
- System design.
- Production incident simulations.
- More open-ended projects.

**Success outcome:** Can reason about trade-offs and deliver maintainable, tested, reliable software.

---

# 4. Core Product Principles

## 4.1 The roadmap is the product's home

The home screen should answer three questions:

1. Where am I?
2. What have I learned?
3. What should I do next?

The roadmap must be a usable navigation interface, not merely an illustration.

## 4.2 Learn concepts when they become useful

The platform should provide structured foundations while introducing contextual explanations during practical work.

For example, HTML semantics should be taught before accessibility challenges depend on semantic markup. Advanced accessibility concepts can then appear when learners build forms and navigation.

## 4.3 Every important concept leads to application

A typical learning sequence is:

**Understand → Predict → Practice → Build → Verify → Reflect**

A learner might read about HTML links, predict how a link behaves, write one, complete a challenge, use links in a multi-page project, and explain the difference between a relative and absolute URL.

## 4.4 Reduce scaffolding gradually

Early missions provide explicit instructions and examples. Later missions provide only requirements and evidence.

The goal is independent problem-solving, not permanent dependence on guided instructions.

## 4.5 Assessment must be trustworthy

Use deterministic tests and explicit criteria wherever possible.

AI can explain mistakes, recommend practice, and provide supplementary feedback. It must not be the sole authority for technical correctness.

## 4.6 Gamification must support learning

Reward meaningful progress, successful experimentation, recovery from mistakes, and demonstrated competence.

Do not punish learners for taking breaks or using hints.

---

# 5. Primary User Journey

## 5.1 End-to-end flow

1. User creates an account or enters a supported guest experience.
2. User selects a learning goal, such as Web Development.
3. User answers onboarding questions.
4. User completes a short practical diagnostic.
5. The platform creates a personalized roadmap.
6. User opens the first recommended node.
7. User completes lessons, exercises, and challenges.
8. The platform verifies performance and records evidence.
9. The roadmap updates progress and unlocks eligible nodes.
10. The platform recommends the next mission.
11. User completes larger projects and practical assessments.
12. User builds an evidence-based portfolio.

## 5.2 Onboarding questions

The platform should ask:

- What do you want to achieve?
- How much programming experience do you have?
- Which languages have you used?
- What can you already build?
- Have you used Git, APIs, databases, or testing tools?
- How much time can you study each week?
- Which types of projects interest you?

Questions should be conversational and brief. Avoid a long registration questionnaire that delays the first coding experience.

## 5.3 Diagnostic assessment

Self-reported knowledge should guide the diagnostic, not determine the final placement.

The diagnostic should use short practical tasks to evaluate relevant competencies.

Examples:

- Predict the output of a small JavaScript program.
- Identify a semantic HTML element.
- Fix a simple broken CSS rule.
- Find an error in an existing function.
- Interpret a basic Git diff.

The diagnostic should not require knowledge of concepts the learner has not claimed to encounter without first checking whether they are comfortable attempting the task.

Each result should include:
- Estimated competency level.
- Confidence in that estimate.
- Evidence supporting the result.
- Recommended starting point.

Learners must be able to adjust their starting point and revisit material at any time.

---

# 6. Interactive Roadmap Experience

## 6.1 Roadmap design

The roadmap is a vertically or spatially arranged path containing connected nodes.

Each node represents a meaningful learning unit, competency milestone, project, or assessment.

Nodes should communicate:

- Topic and mission title.
- Completion status.
- Prerequisites.
- Estimated effort.
- Skill category.
- Available actions.
- Whether the node is recommended, optional, locked, or mastered.

The path should be visually engaging and feel like progression through a world, while remaining readable and easy to navigate.

## 6.2 Node states

Every node must support these states:

- **Locked:** Required prerequisites have not been met.
- **Available:** The learner can begin.
- **Recommended:** The next best step for the learner.
- **In progress:** Work has started.
- **Completed:** Required completion conditions are satisfied.
- **Mastered:** The learner has demonstrated the skill beyond the minimum completion threshold.
- **Needs practice:** Evidence suggests the skill needs reinforcement.
- **Optional:** Useful enrichment that does not block the main path.

A completed node should remain accessible. A learner must be able to revisit explanations and practice.

## 6.3 Node interactions

Clicking a node opens a detail panel containing:

- Mission overview.
- Why the topic matters.
- Learning objectives.
- Prerequisites.
- Estimated time.
- Mission type.
- Completion criteria.
- Relevant skills.
- Start or resume action.

Locked nodes should explain what prerequisite is missing.

The interface must not require learners to inspect every node manually to find their next step. A persistent "Continue learning" action should open the recommended mission.

## 6.4 Roadmap personalization

Personalization must change the actual sequence or content of learning, not just rearrange the visual path.

The engine should support:

- Skipping mastered concepts.
- Inserting prerequisite practice.
- Recommending optional enrichment.
- Offering different project themes.
- Adjusting difficulty.
- Recommending review based on past mistakes.
- Changing the next mission based on recent performance.

The overall learning objectives must remain intact even when the sequence changes.

---

# 7. Initial Curriculum: Web Development

The first curriculum should provide a coherent path from HTML fundamentals to professional web engineering.

The following is the canonical roadmap. Individual learners may skip, revisit, or receive additional missions within stages.

## Stage 1: HTML Foundations

**Goal:** Understand how web documents are structured.

Topics:
- What the web and browsers do.
- HTML documents and basic structure.
- Elements, tags, attributes, and nesting.
- Headings, paragraphs, and text.
- Links and navigation.
- Images and alternative text.
- Lists.
- Semantic HTML.
- Forms and common input types.
- Tables where appropriate.
- Basic accessibility principles.

Example missions:
- Build your first web page.
- Create a personal profile.
- Build a multi-page website with navigation.
- Create a semantic article.
- Build a contact form.

Boss challenge: Build a multi-page personal website from a specification without copying a complete tutorial.

**Mastery evidence:** Correct structure, semantic markup, functioning links, meaningful image alternatives, and valid form markup.

## Stage 2: CSS Foundations

**Goal:** Control layout, visual presentation, and responsive behavior.

Topics:
- Selectors and the cascade.
- Specificity and inheritance.
- Colors, typography, and spacing.
- The box model.
- Display and positioning.
- Flexbox.
- CSS Grid.
- Responsive design and media queries.
- CSS variables.
- Transitions and basic animation.
- Layout debugging.

Example missions:
- Style the personal profile.
- Recreate a supplied interface.
- Build a responsive navigation bar.
- Create a dashboard layout.
- Debug a layout that breaks on mobile.

Boss challenge: Build a responsive landing page from a design brief.

**Mastery evidence:** Consistent styling, responsive behavior, correct layout techniques, and maintainable CSS.

## Stage 3: JavaScript Foundations

**Goal:** Add behavior and logic to web pages.

Topics:
- Variables and data types.
- Operators and expressions.
- Conditions and loops.
- Functions and scope.
- Arrays and objects.
- Array methods.
- DOM selection and manipulation.
- Events.
- Forms and validation.
- Modules.
- Promises and asynchronous JavaScript.
- Fetch and error handling.
- Debugging with browser developer tools.

Example missions:
- Build an interactive counter.
- Create a task list.
- Validate a form.
- Build a search and filter interface.
- Fetch data from an API.
- Fix a broken interactive component.

Boss challenge: Build a functional application using DOM manipulation, asynchronous requests, and robust error handling.

**Mastery evidence:** Correct logic, meaningful functions, reliable event handling, and appropriate handling of asynchronous failures.

## Stage 4: Developer Tools and Git

**Goal:** Learn to work like a developer rather than only write code.

Topics:
- Command-line fundamentals.
- Files, directories, and processes.
- Git repositories and commits.
- Branches and merges.
- Merge conflicts.
- Reading diffs.
- Writing useful commit messages.
- GitHub workflows.
- README files.
- Basic collaboration practices.

Example missions:
- Recover a file using Git.
- Find the commit that introduced a bug.
- Resolve a merge conflict.
- Review a teammate's change.
- Write a clear project README.

Boss challenge: Implement a feature on a branch, resolve a conflict, and submit a clean change for review.

**Mastery evidence:** Correct version-control operations, understandable commits, and the ability to inspect and explain changes.

## Stage 5: Modern Frontend Development

**Goal:** Build larger interactive applications with reusable components.

Topics:
- Component-based architecture.
- React fundamentals.
- Props and state.
- Events and controlled forms.
- Component composition.
- Effects and data fetching.
- Routing.
- Loading and error states.
- Reusable UI components.
- Frontend testing.
- Accessibility in interactive applications.

Example missions:
- Convert a static page into reusable components.
- Build a searchable product catalogue.
- Implement a multi-step form.
- Add routing and error states.
- Test a component with different inputs.

Boss challenge: Build a multi-page frontend application with reliable state management and accessible interactions.

**Mastery evidence:** Appropriate component boundaries, predictable state, reliable user interactions, and testable code.

## Stage 6: HTTP, APIs, and Backend Development

**Goal:** Understand how applications communicate and implement server-side functionality.

Topics:
- Client-server architecture.
- HTTP methods and status codes.
- JSON and request/response structure.
- REST API conventions.
- Node.js fundamentals.
- TypeScript fundamentals.
- Routing and middleware.
- Input validation.
- Error handling.
- Authentication and authorization concepts.
- API testing.
- Environment configuration.

Example missions:
- Build a basic HTTP endpoint.
- Implement a CRUD API.
- Add validation and meaningful error responses.
- Debug a failing request.
- Fix an authorization bug.
- Write API documentation.

Boss challenge: Build an API for a complete application with validation, authentication, authorization, and tests.

**Mastery evidence:** Correct API behavior, clear contracts, reliable error handling, and appropriate access controls.

## Stage 7: Databases and Data Modeling

**Goal:** Store, query, and protect application data.

Topics:
- Relational database fundamentals.
- Tables, keys, and relationships.
- SQL queries.
- Joins and aggregation.
- Schema design.
- Constraints.
- Transactions.
- Indexes and query plans.
- Migrations.
- Data validation.
- Database testing.

Example missions:
- Design a database for a task management application.
- Fix an incorrect join.
- Add a database migration.
- Investigate a slow query.
- Prevent duplicate or invalid records.

Boss challenge: Design and implement the data layer of a functioning application.

**Mastery evidence:** Correct queries, sensible schema design, data integrity, and justified performance improvements.

## Stage 8: Testing and Software Quality

**Goal:** Make software reliable and maintainable.

Topics:
- Unit testing.
- Integration testing.
- End-to-end testing.
- Regression tests.
- Test doubles and mocks.
- Edge cases.
- Code coverage and its limitations.
- Refactoring.
- Static analysis and linting.
- Security basics.
- Dependency management.

Example missions:
- Reproduce a bug and write a regression test.
- Find missing edge cases.
- Refactor a long function safely.
- Diagnose a failing CI check.
- Review a change for security problems.

Boss challenge: Improve an existing codebase without changing its intended behavior.

**Mastery evidence:** Useful tests, reliable behavior, readable code, and demonstrated preservation of existing functionality.

## Stage 9: Deployment and Operations

**Goal:** Ship and maintain software.

Topics:
- Build processes.
- Environment variables and secrets.
- Hosting and deployment.
- Continuous integration.
- Continuous deployment concepts.
- Application logs.
- Metrics and basic monitoring.
- Performance investigation.
- Common production failures.
- Rollbacks.
- Incident response.
- Postmortems.

Example missions:
- Deploy an application.
- Fix a broken deployment pipeline.
- Diagnose a server error using logs.
- Investigate a slow endpoint.
- Roll back a faulty release.
- Write an incident postmortem.

Boss challenge: Diagnose a production-like incident, mitigate the problem, verify the recovery, and explain the root cause.

**Mastery evidence:** Reproducible deployment, meaningful verification, effective troubleshooting, and a clear incident report.

## Stage 10: Independent Engineering

**Goal:** Demonstrate the ability to deliver a project with minimal guidance.

Learners receive a project brief rather than a tutorial.

They must:
- Clarify requirements.
- Plan the implementation.
- Design the data model and interfaces.
- Work in an existing repository.
- Implement and test the application.
- Use version control.
- Review changes.
- Deploy the result.
- Document limitations and trade-offs.
- Present their decisions.

Example capstones:
- A collaborative task manager.
- A developer productivity tool.
- An analytics dashboard.
- An API-backed application.
- An AI-powered application with appropriate safeguards.

**Graduation evidence:** A functioning deployed project, source code, tests, documentation, and an independently assessed demonstration of engineering competence.

---

# 8. Learning Mission Specification

Every mission must follow a consistent content contract.

## 8.1 Required fields

- Unique mission ID.
- Title and description.
- Learning objectives.
- Prerequisite competency IDs.
- Difficulty level.
- Estimated completion time.
- Concept explanations.
- Examples.
- Exercises.
- Starter code where applicable.
- Automated checks.
- Optional hints.
- Common misconceptions.
- Completion criteria.
- Mastery criteria.
- Portfolio relevance.
- Next-step recommendations.

## 8.2 Mission interaction model

A standard mission follows this flow:

1. Introduce a problem or learning objective.
2. Explain the concept through a concise lesson or interactive example.
3. Ask the learner to predict or reason about behavior.
4. Provide a small hands-on exercise.
5. Evaluate the attempt.
6. Explain failures and offer graduated hints.
7. Give a slightly less guided challenge.
8. Record the evidence of learning.
9. Recommend the next step.

Not every mission needs every interaction. Short factual topics should not be artificially expanded into long experiences.

## 8.3 Hint ladder

The AI tutor should use progressively more specific assistance.

**Level 1 — Nudge:** Ask a question that directs attention to the relevant behavior.

**Level 2 — Concept:** Explain the underlying concept with a small example.

**Level 3 — Investigation:** Point to the relevant file, line, error, or documentation.

**Level 4 — Worked example:** Demonstrate a similar problem without directly completing the assessed task.

**Level 5 — Solution review:** When appropriate, explain a solution and ask the learner to reproduce the reasoning in a different challenge.

Hints should be available without shame or punitive scoring. Independent assessments should separately establish what a learner can do without assistance.

---

# 9. Assessment and Adaptive Learning

## 9.1 Completion versus mastery

The platform must distinguish between:

**Completion:** The learner has met the minimum requirements to finish a mission.

**Mastery:** The learner has demonstrated the relevant skill reliably, including in a different context where appropriate.

A learner may complete a lesson while still needing additional practice.

## 9.2 Assessment types

- Knowledge checks.
- Code execution and automated tests.
- Visual output checks where appropriate.
- Debugging challenges.
- Repository-based tasks.
- Code review.
- Project assessment.
- Independent transfer challenges.
- Written explanations of decisions.

Assessment should use the least subjective method that can adequately evaluate the skill.

## 9.3 Adaptive recommendation rules

The initial recommendation engine should use explicit rules rather than relying entirely on an LLM.

Examples:

- If a learner fails a prerequisite repeatedly, recommend a targeted refresher.
- If they pass the prerequisite consistently, allow the next node to unlock.
- If they complete a task with substantial assistance, schedule a similar independent challenge.
- If they make recurring mistakes, recommend a focused exercise addressing the misconception.
- If they demonstrate mastery in multiple contexts, reduce repetition.
- If they have not practiced a skill for a while, recommend a brief review when appropriate.

AI may explain recommendations and personalize instruction, but progression rules and assessment outcomes must remain inspectable.

## 9.4 Competency model

Track competencies independently of roadmap nodes.

For web development, initial competencies include:

- HTML structure and semantics.
- CSS layout and responsive design.
- JavaScript logic.
- DOM manipulation.
- Asynchronous programming.
- Git and version control.
- Frontend architecture.
- API design and integration.
- Database operations.
- Testing and debugging.
- Deployment and operations.
- Engineering communication.

Each competency should include its prerequisites, assessment methods, evidence requirements, and proficiency levels.

---

# 10. Gamification and Motivation

## 10.1 Progression

Use experience points and milestones to communicate progress, but do not treat XP as proof of competence.

Possible mechanics:
- Mission completion rewards.
- Skill tree unlocks.
- Campaign milestones.
- Boss challenges.
- Optional side quests.
- Streaks that never punish missed days.
- Collectible project artifacts.
- Seasonal coding events in later releases.

## 10.2 Skill tree

The skill tree should reflect real competencies. A learner unlocks advanced debugging challenges after demonstrating foundational debugging ability, not after accumulating arbitrary points.

## 10.3 Narrative

Narrative should be optional in intensity.

Early fundamentals can use lightweight stories and puzzles. Advanced learners should spend more time in realistic engineering scenarios.

The narrative layer must not obstruct the roadmap or force learners to read unnecessary dialogue.

## 10.4 Leaderboards

Leaderboards are deferred from the MVP.

Future leaderboards should recognize meaningful contributions, such as useful code reviews, effective incident investigations, or well-documented projects. Avoid rankings based solely on time spent, task volume, or speed.

---

# 11. Functional Requirements

## P0 — Required for the initial release

### FR-001: Onboarding
The system must collect the learner's goals, experience, interests, and availability.

### FR-002: Diagnostic
The system must provide a practical initial assessment and store competency estimates with supporting evidence.

### FR-003: Roadmap rendering
The system must display a navigable roadmap with node states, dependencies, progress, and recommended actions.

### FR-004: Mission content
The system must load structured, versioned mission content.

### FR-005: Interactive learning
The system must support explanations, examples, exercises, and appropriate feedback.

### FR-006: Code execution
For supported coding missions, the system must execute learner code in a suitably isolated environment with resource limits.

### FR-007: Assessment
The system must evaluate mission completion using defined checks and persist the results.

### FR-008: Progress persistence
The system must restore a learner's roadmap, mission state, attempts, and completed work after they leave and return.

### FR-009: Adaptive recommendations
The system must recommend the next mission based on prerequisites and demonstrated performance.

### FR-010: AI assistance
The system must provide contextual explanations and graduated hints while respecting assessment boundaries.

### FR-011: Mastery tracking
The system must record competency evidence separately from ordinary completion.

### FR-012: Learning summary
The system must show completed milestones, demonstrated skills, areas needing practice, and the next recommended action.

### FR-013: Responsive interface
The roadmap and learning content must work on desktop, tablet, and mobile screens. Complex coding tasks may require a desktop-class interface, but progress and lesson review should remain accessible on mobile.

### FR-014: Accessibility
The interface must support keyboard navigation, visible focus states, semantic structure, readable contrast, and alternatives to color-only status indicators.

## P1 — After the core learning loop is validated

- Full in-browser multi-file development environment.
- More advanced Git workflows.
- AI-generated code review scenarios.
- Peer review and collaboration.
- Simulated production incidents.
- Project deployment and live previews.
- Portfolio publishing.
- Spaced repetition.
- Multiple learning paths.
- Additional programming languages.

## P2 — Longer-term possibilities

- Persistent team cohorts.
- Multiplayer engineering challenges.
- Collaborative projects.
- Recruiter-facing evidence reports.
- Institutional curriculum management.
- Additional specializations, such as AI engineering, systems programming, and data engineering.

---

# 12. UX and Interface Requirements

## 12.1 Main application structure

The primary navigation should contain:

- **Roadmap:** Main learning path and next recommended mission.
- **Workspace:** Current lesson or coding task.
- **Projects:** Larger projects and portfolio artifacts.
- **Skills:** Competency map and assessment evidence.
- **Profile:** Preferences, history, and account settings.

The MVP should prioritize Roadmap and Workspace. Other navigation items should be included only when their functionality is real.

## 12.2 Roadmap screen

The roadmap screen must include:

- Current specialization.
- A clear visual progression path.
- Grouped stages.
- Completed, available, and locked nodes.
- Current learning streak or other optional progress signal.
- Skill progress.
- Recommended next mission.
- A Continue button that resumes the correct task.

The map must remain understandable when it contains many nodes. Provide stage grouping, zoom or compact navigation where appropriate, and a list-based alternative for accessibility.

## 12.3 Learning workspace

The workspace should include:

- Mission instructions.
- Concept explanation.
- Code editor or interactive exercise.
- Output or preview.
- Test results.
- Hint interface.
- Progress and completion feedback.

The interface should avoid unnecessary panel duplication. Learners should always know where to read requirements, edit code, run checks, and request help.

## 12.4 Visual direction

The product should feel like a modern interactive learning environment rather than a conventional online course dashboard.

Design characteristics:
- Clear visual hierarchy.
- A distinctive roadmap with connected nodes.
- Subtle motion for unlocks and transitions.
- Restrained use of color to communicate state.
- Readable typography.
- A professional coding workspace.
- Playful details that become more understated in advanced engineering stages.

The roadmap should be memorable without sacrificing usability.

---

# 13. Technical Architecture

## 13.1 Recommended initial stack

**Frontend**
- React.
- TypeScript.
- Next.js or an equivalent established React application framework.
- A reusable design system and accessible component primitives.

**Backend**
- TypeScript and Node.js.
- A modular application API.
- PostgreSQL for persistent product data.

**Code execution**
- Separate execution workers.
- Ephemeral workspaces.
- Resource and time limits.
- Restricted filesystem and network access.
- Explicit cleanup after execution.

**AI**
- A provider-agnostic service interface.
- Context assembled from the active mission, relevant concepts, and permitted workspace information.
- Structured outputs for hints and recommendations where appropriate.
- Logging and evaluation of AI quality.

**Content**
- Versioned curriculum definitions.
- A graph of concepts, prerequisites, missions, and competencies.
- Versioned assessment specifications and test fixtures.

These are recommended defaults, not hard dependencies. The implementation team should validate the execution environment and deployment requirements before committing to a detailed infrastructure design.

## 13.2 High-level architecture

Learner Interface → Application API → Roadmap and Progress Engine → Curriculum and Competency Data

The Workspace communicates with the execution service through the application backend.

Execution Service → Isolated Worker → Tests and Resource Controls → Assessment Results

AI Tutor Service → Mission Context and Hint Policies → Feedback

All authoritative progress changes and assessment results must be validated on the server.

## 13.3 Core data entities

- User.
- LearningPath.
- RoadmapStage.
- RoadmapNode.
- Concept.
- Competency.
- Prerequisite.
- Mission.
- MissionVersion.
- Exercise.
- Assessment.
- AssessmentAttempt.
- Submission.
- ExecutionResult.
- HintInteraction.
- MasteryEvidence.
- Project.
- LearnerProgress.
- Recommendation.

The data model must support a single competency being demonstrated by multiple missions and a mission contributing evidence to multiple competencies.

## 13.4 Security requirements

Learner code is untrusted input.

The execution service must:
- Run code outside the main application process.
- Apply CPU, memory, execution-time, process-count, and storage limits.
- Prevent access to application secrets and other users' data.
- Restrict network access by default.
- Terminate runaway processes.
- Destroy ephemeral environments after use.
- Validate requests and enforce authorization server-side.
- Record execution failures and security-relevant events.

AI-generated code must also be treated as untrusted code.

---

# 14. Analytics and Success Metrics

The platform should evaluate whether learners are progressing and becoming more capable, not simply whether they spend more time on the site.

## 14.1 Activation

Measure:
- Onboarding completion.
- Diagnostic completion.
- Time to first meaningful exercise.
- First mission completion.
- Return to an in-progress mission.

## 14.2 Learning effectiveness

Measure:
- Mission completion rates.
- Attempts required to complete tasks.
- Hint usage and progression.
- Repeated misconceptions.
- Competency mastery.
- Performance on independent transfer challenges.
- Baseline versus final assessment results.

## 14.3 Retention

Measure:
- Return within 7 and 30 days.
- Weekly learning consistency.
- Continuation from one stage to the next.
- Reasons for abandonment.

## 14.4 Engineering readiness

Measure:
- Ability to modify unfamiliar code.
- Quality of tests.
- Debugging effectiveness.
- Correctness and maintainability.
- Code-review quality.
- Deployment success.
- Incident diagnosis and communication.

## 14.5 Initial pilot targets

For an initial pilot of approximately 10–20 learners, use provisional targets:

- At least 80% complete onboarding and reach the first meaningful exercise.
- At least 70% of learners who start the campaign finish it.
- Learners show improvement between comparable baseline and final practical assessments.
- Learners can apply at least some skills to an unfamiliar task.
- No unresolved critical code-execution security issues.

These are hypotheses to validate, not promises of expected results. Small pilot samples provide directional evidence, not definitive statistical conclusions.

---

# 15. MVP Scope and Release Plan

The first release should prove that the personalized roadmap and learning loop work.

## Phase 1: Product and curriculum definition

- Finalize the Web Development roadmap.
- Define competency prerequisites.
- Author the first HTML missions.
- Define diagnostic tasks and scoring.
- Create the roadmap interaction design.
- Establish accessibility and visual design standards.

**Exit criterion:** The first complete learning journey can be understood and tested as a prototype.

## Phase 2: Interactive roadmap

- Implement onboarding.
- Implement the diagnostic flow.
- Render the roadmap.
- Support node states and prerequisites.
- Add recommended next actions.
- Persist learner progress.

**Exit criterion:** A learner can enter the product and navigate a personalized path.

## Phase 3: Learning engine

- Implement structured lesson content.
- Add interactive HTML exercises.
- Add automatic checks and feedback.
- Add mission completion rules.
- Implement prerequisite remediation.

**Exit criterion:** The HTML learning sequence works end to end.

## Phase 4: Adaptation and motivation

- Add mastery tracking.
- Add contextual AI assistance.
- Add mission rewards and milestone unlocks.
- Generate learning summaries.
- Test personalization against different starting skill levels.

**Exit criterion:** Learners with different experience levels receive appropriately different next steps.

## Phase 5: Pilot

- Test with target learners.
- Observe task completion and confusion points.
- Compare initial and final skill performance.
- Fix curriculum and UX issues.
- Decide whether to expand into CSS and JavaScript or improve the existing path.

**Exit criterion:** There is evidence that the experience is understandable, engaging, and educationally effective.

The first release should not attempt to implement every stage of the ten-stage roadmap. It should establish the platform architecture and deliver the HTML learning journey at a high level of quality.

---

# 16. Risks and Mitigations

## Risk 1: The roadmap becomes a static course catalogue

**Mitigation:** Recommendations must respond to demonstrated competency and task performance. The roadmap should change meaningfully as the learner progresses.

## Risk 2: Gamification distracts from learning

**Mitigation:** Rewards should reinforce completed work, skill mastery, and useful practice. Evaluate transfer performance alongside engagement.

## Risk 3: AI gives incorrect explanations

**Mitigation:** Ground assistance in curated content and deterministic results. Evaluate responses and make it clear when advice is uncertain.

## Risk 4: The curriculum becomes too broad

**Mitigation:** Ship one coherent Web Development path. Expand after the HTML experience demonstrates value.

## Risk 5: Learners become dependent on hints

**Mitigation:** Introduce independent challenges and measure performance without assistance separately from guided performance.

## Risk 6: Execution infrastructure becomes expensive or unsafe

**Mitigation:** Start with constrained exercises, use isolated workers, impose quotas, and postpone unrestricted cloud development environments.

## Risk 7: Learners confuse course completion with job readiness

**Mitigation:** Report demonstrated competencies and work products. Make the distinction between completion, mastery, and independent performance explicit.

---

# 17. Acceptance Criteria for the First Release

The MVP is ready for pilot when all of the following are true:

1. A new learner can choose Web Development and complete onboarding.
2. The system can recommend a starting point based on diagnostic evidence.
3. The roadmap displays stages, nodes, prerequisites, and progress states.
4. The learner can open and complete the first HTML lesson.
5. Interactive HTML exercises can be evaluated using defined checks.
6. The system provides useful feedback when an exercise fails.
7. Progress persists across sessions.
8. Completing a mission updates the roadmap correctly.
9. The system recommends an appropriate next mission.
10. A learner who demonstrates prior knowledge can take an alternate diagnostic or skip eligible material.
11. A learner who struggles can receive targeted practice.
12. Competency evidence is stored separately from simple completion.
13. The interface supports keyboard navigation and clear status indicators.
14. Server-side authorization and data validation are implemented.
15. Any executable learner code runs in a suitably isolated environment.
16. Product analytics can measure activation, progression, and assessment outcomes.

---

# 18. Product Decisions to Preserve

These decisions should guide implementation unless pilot evidence justifies a change.

- The product name remains undecided.
- The interactive roadmap is the primary home experience.
- Web Development is the first specialization.
- HTML is the initial learning stage for learners who need it.
- Learners are assessed rather than permanently assigned based on self-reported experience.
- The canonical curriculum progresses from fundamentals to professional engineering.
- The roadmap is adaptive but remains grounded in explicit prerequisites.
- Learning missions combine explanation, practice, and application.
- Gamification supports learning rather than replacing it.
- Practical evidence matters more than certificates or XP.
- The initial release prioritizes a polished learning experience over breadth.
- Advanced workplace simulations are introduced progressively rather than overwhelming beginners.

---

# 19. Final Product Definition

The product is a personalized, gamified programming education platform built around an interactive roadmap.

A learner chooses a goal, establishes their current level, and receives a clear progression through the skills they need. Each roadmap node opens an engaging learning experience. As the learner advances, the work evolves from small coding exercises into complete applications, unfamiliar codebases, collaborative engineering, debugging, deployment, and independent projects.

The defining promise is:

**You always know what to learn next, why it matters, and how to prove you've learned it.**

The roadmap provides direction. The missions build capability. The adaptive engine personalizes progression. The engineering simulations develop professional skills. The portfolio demonstrates what the learner can actually do.

The first milestone is deliberately narrow: deliver an excellent, interactive Web Development roadmap and a complete HTML learning sequence, built on an architecture that can support the entire journey from beginner to independent engineer.
