/* The copy checker for the front door.
 *
 * It walks the strings a reader sees, applies the rules in copy-rules.ts, and
 * prints what it found: the file, the line, the string, and the rule it
 * breaks. It changes nothing. Whether a string is fixed is a decision for the
 * people who own the copy, not for a script.
 *
 *   npx tsx scripts/verify-copy.ts            the report, exit 1 when a rule is broken
 *   npx tsx scripts/verify-copy.ts --quiet    the counts only
 *
 * The exit code is 0 when every rule holds and 1 when any rule is broken, so
 * the script can be wired into the verify command and fail the run.
 *
 * What it reads:
 *
 *   src/routes/**        the pages, one surface each
 *   src/lib/components   the shared chrome the pages render
 *   src/lib/content      the copy module the pages read
 *   src/lib/*.ts         the legal copy, the mail bodies and the page titles
 *
 * What it does not read, and why:
 *
 *   scripts/**           this checker and its own rules
 *   src/lib/server/**    the server side, whose messages never reach a reader
 *   src/lib/three/**     the drawing, which has no words               */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CTA_LABEL,
  RULES,
  checkText,
  ctaVariant,
  labelKey,
  sameIntent,
} from "./copy-rules";
import {
  COPY_MODULES,
  type Action,
  type StringEntry,
  extractModule,
  extractSvelte,
  localImports,
} from "./copy-extract";

const siteRoot = join(fileURLToPath(import.meta.url), "..", "..");

/** A user-visible string, with the place it sits. */
type SiteString = {
  file: string;
  text: string;
  offset: number;
  kind: string;
  segments: StringEntry["segments"];
};

/** A control, with the place it sits. */
type SiteAction = Action & { file: string };

/** One page and everything it renders. */
type Surface = {
  id: string;
  files: Set<string>;
};

/** Every file under a folder, in a stable order. */
function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, out);
    else out.push(full);
  }
  return out;
}

/** The line of a character offset in a file. */
function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset && index < text.length; index++) {
    if (text.charCodeAt(index) === 10) line++;
  }
  return line;
}

/** The place in the file that a character of a string sits at. */
function mapOffset(entry: SiteString, index: number): number {
  if (!entry.segments) return entry.offset + index;
  for (const segment of entry.segments) {
    if (index >= segment.start && index < segment.start + segment.text.length) {
      return segment.offset + (index - segment.start);
    }
  }
  return entry.offset;
}

/**
 * Every user-visible string on the site.
 *
 * The result is one list of `{ file, text, offset, kind }`.
 */
export function collectStrings(root: string = siteRoot): { strings: SiteString[]; actions: SiteAction[] } {
  const strings: SiteString[] = [];
  const actions: SiteAction[] = [];

  const srcDir = join(root, "src");
  for (const file of collectFiles(srcDir)) {
    const relPath = relative(root, file).split(sep).join("/");
    if (!relPath.endsWith(".svelte") && !relPath.endsWith(".ts")) continue;
    if (relPath.startsWith("src/lib/server/")) continue;
    if (relPath.startsWith("src/lib/three/")) continue;
    const text = readFileSync(file, "utf8");

    if (relPath.endsWith(".svelte")) {
      const found = extractSvelte(relPath, text);
      for (const entry of found.strings) {
        strings.push({
          file: relPath,
          text: entry.text,
          offset: entry.offset,
          kind: entry.kind,
          segments: entry.segments ?? null,
        });
      }
      for (const action of found.actions) {
        actions.push({ ...action, file: relPath });
      }
      continue;
    }

    const copyModule = COPY_MODULES.has(relPath);
    for (const entry of extractModule(relPath, text, { copyModule })) {
      strings.push({
        file: relPath,
        text: entry.text,
        offset: entry.offset,
        kind: entry.kind,
        segments: entry.segments ?? null,
      });
    }
  }

  return { strings, actions };
}

/**
 * The pages of the site, and what each of them renders.
 *
 * A surface is a route and the files it draws on: the page, the components it
 * imports, the layout every page sits in, and the copy module they read.
 */
export function collectSurfaces(root: string = siteRoot): Surface[] {
  const routesDir = join(root, "src", "routes");
  const layout = join(routesDir, "+layout.svelte");
  const surfaces: Surface[] = [];

  const pages = collectFiles(routesDir).filter((file) => file.endsWith("+page.svelte"));
  for (const page of pages) {
    const relPage = relative(root, page).split(sep).join("/");
    const files = new Set<string>();
    const queue: string[] = [relPage];
    if (statSync(layout, { throwIfNoEntry: false })) {
      queue.push(relative(root, layout).split(sep).join("/"));
    }
    while (queue.length > 0) {
      const current = queue.pop()!;
      if (files.has(current)) continue;
      files.add(current);
      const full = join(root, current);
      if (!statSync(full, { throwIfNoEntry: false })) continue;
      const text = readFileSync(full, "utf8");
      for (const imported of localImports(full, text, root)) {
        const rel = relative(root, imported).split(sep).join("/");
        if (!files.has(rel)) queue.push(rel);
      }
    }
    surfaces.push({ id: routeOf(relPage), files });
  }

  return surfaces;
}

/** The route a page file serves. */
function routeOf(relPath: string): string {
  const route = relPath
    .replace(/^src\/routes/, "")
    .replace(/\/\+page\.svelte$/, "")
    .replace(/\/\+page\.server\.ts$/, "");
  return route === "" ? "/" : route;
}

/**
 * The rules that need more than one string.
 *
 * Two of the product's rules are about the relationship between labels: one
 * intent has one label, and one surface has one primary call to action.
 */
export function crossChecks(
  strings: SiteString[],
  actions: SiteAction[],
  surfaces: Surface[],
  lineOf: (entry: { file: string; offset: number }) => number,
): { rule: string; detail: string; file: string; line: number; text: string; surface: string }[] {
  const violations: {
    rule: string;
    detail: string;
    file: string;
    line: number;
    text: string;
    surface: string;
  }[] = [];

  // One primary call to action per surface. The shared chrome is excluded:
  // the header and the footer each carry the one action on purpose, and the
  // release module is the source of the label rather than a rendering of it.
  const CHROME = new Set([
    "src/lib/components/Header.svelte",
    "src/lib/components/Footer.svelte",
    "src/lib/release.ts",
  ]);
  for (const surface of surfaces) {
    const carried = strings.filter(
      (entry) =>
        surface.files.has(entry.file) &&
        !CHROME.has(entry.file) &&
        entry.text.trim() === CTA_LABEL
    );
    if (carried.length > 1) {
      for (const entry of carried.slice(1)) {
        violations.push({
          rule: "cta-once",
          detail: `the surface "${surface.id}" carries "${CTA_LABEL}" ${carried.length} times`,
          file: entry.file,
          line: lineOf(entry),
          text: entry.text,
          surface: surface.id,
        });
      }
    }
  }
  for (const entry of strings) {
    const variant = ctaVariant(entry.text);
    if (variant === null) continue;
    violations.push({
      rule: "cta-once",
      detail: `a variant of the call to action: "${variant}"`,
      file: entry.file,
      line: lineOf(entry),
      text: entry.text,
      surface: surfaceOfFile(entry.file, surfaces),
    });
  }

  // One label per intent: the same action is not called two different things.
  // The rule is about controls, so it compares the files a page actually
  // renders, and it leaves inline prose links alone: a legal sentence may
  // call a document "the privacy notice" without that becoming a second
  // label on the control that opens it.
  const surfaceFiles = new Set(surfaces.flatMap((surface) => [...surface.files]));
  const controls = actions.filter((action) => surfaceFiles.has(action.file) && !action.prose);
  const byTarget = new Map<string, SiteAction[]>();
  for (const action of controls) {
    if (!action.target || !action.label) continue;
    const list = byTarget.get(action.target) ?? [];
    list.push(action);
    byTarget.set(action.target, list);
  }
  for (const [target, list] of byTarget) {
    const keys = [...new Set(list.map((action) => labelKey(action.label)))];
    if (keys.length < 2) continue;
    for (const action of list) {
      const others = keys.filter((other) => other !== labelKey(action.label));
      const sameMeaning = others.some((other) => sameIntent(labelKey(action.label), other));
      violations.push({
        rule: "one-label-per-intent",
        detail: `the action "${target}" is called "${action.label}" here and ${others
          .map((other) => `"${other}"`)
          .join(" and ")} elsewhere${sameMeaning ? " (the same words, worded differently)" : ""}`,
        file: action.file,
        line: lineOf(action),
        text: action.label,
        surface: surfaceOfFile(action.file, surfaces),
      });
    }
  }

  // One label per intent: the same label does not name two actions on one page.
  for (const surface of surfaces) {
    const onSurface = controls.filter((action) => surface.files.has(action.file));
    const byLabel = new Map<string, SiteAction[]>();
    for (const action of onSurface) {
      if (!action.target || !action.label) continue;
      const key = labelKey(action.label);
      const list = byLabel.get(key) ?? [];
      list.push(action);
      byLabel.set(key, list);
    }
    for (const [key, list] of byLabel) {
      const targets = [...new Set(list.map((action) => action.target as string))];
      if (targets.length < 2) continue;
      for (const action of list) {
        violations.push({
          rule: "one-label-per-intent",
          detail: `the label "${action.label}" names ${targets.length} different actions on "${surface.id}"`,
          file: action.file,
          line: lineOf(action),
          text: action.label,
          surface: surface.id,
        });
      }
    }
  }

  return violations;
}

/** The surfaces a file is drawn on. */
function surfaceOfFile(file: string, surfaces: Surface[]): string {
  const names = surfaces.filter((surface) => surface.files.has(file)).map((surface) => surface.id);
  return names.length === 0 ? "site" : names.join(", ");
}

/**
 * Every violation on the site.
 */
export function checkSite(root: string = siteRoot): {
  violations: {
    rule: string;
    detail: string;
    file: string;
    line: number;
    text: string;
    surface: string;
  }[];
  strings: SiteString[];
  actions: SiteAction[];
  surfaces: Surface[];
} {
  const { strings, actions } = collectStrings(root);
  const surfaces = collectSurfaces(root);
  const files = new Map<string, string>();
  const textOf = (file: string): string => {
    const known = files.get(file);
    if (known !== undefined) return known;
    const text = readFileSync(join(root, file), "utf8");
    files.set(file, text);
    return text;
  };

  const violations: {
    rule: string;
    detail: string;
    file: string;
    line: number;
    text: string;
    surface: string;
  }[] = [];

  for (const entry of strings) {
    for (const violation of checkText(entry.text)) {
      violations.push({
        rule: violation.rule,
        detail: violation.detail,
        file: entry.file,
        line: lineAt(textOf(entry.file), mapOffset(entry, violation.index)),
        text: entry.text,
        surface: surfaceOfFile(entry.file, surfaces),
      });
    }
  }

  violations.push(
    ...crossChecks(strings, actions, surfaces, (entry) =>
      lineAt(textOf(entry.file), entry.offset)
    )
  );

  return { violations, strings, actions, surfaces };
}

/** The report, grouped by rule. */
export function report(result: ReturnType<typeof checkSite>): string {
  const lines: string[] = [];
  lines.push(
    `scanned ${result.strings.length} user-visible strings across ${result.surfaces.length} surfaces`
  );
  for (const rule of RULES) {
    const list = result.violations.filter((violation) => violation.rule === rule.id);
    const distinct = new Set(list.map((violation) => violation.text));
    lines.push(`  ${rule.id}: ${list.length} finding(s), ${distinct.size} distinct string(s)`);
    const shown = new Set<string>();
    for (const violation of list) {
      const key = `${violation.file}::${violation.line}::${violation.detail}`;
      if (shown.has(key)) continue;
      shown.add(key);
      lines.push(
        `    ${violation.file}:${violation.line}  ${violation.detail}  ${JSON.stringify(violation.text)}`
      );
    }
  }
  return lines.join("\n");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const result = checkSite(siteRoot);
  if (process.argv.includes("--quiet")) {
    const counts = new Map<string, number>();
    for (const violation of result.violations) {
      counts.set(violation.rule, (counts.get(violation.rule) ?? 0) + 1);
    }
    console.log(
      `scanned ${result.strings.length} user-visible strings across ${result.surfaces.length} surfaces`
    );
    for (const rule of RULES) console.log(`  ${rule.id}: ${counts.get(rule.id) ?? 0}`);
  } else {
    console.log(report(result));
  }
  process.exit(result.violations.length > 0 ? 1 : 0);
}
