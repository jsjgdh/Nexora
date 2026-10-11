import type { HarnessAssert, HarnessObs, HarnessOp } from "./types";

/* Sandbox harness for scripted (JavaScript) assessment.
   Trust model, stated plainly:
   - Learner code runs in an opaque-origin iframe (sandbox="allow-scripts",
     WITHOUT allow-same-origin): scripts execute, but the frame cannot read
     the parent, touch storage, or fake a same-origin identity.
   - The in-frame driver returns RAW OBSERVATIONS only (DOM reads, return
     values, errors). Pass/fail is decided parent-side by evaluateAssertions.
   - A hostile page could spoof observations, exactly as with any client-side
     assessment (Codecademy-style). The defense is proportionality: the driver
     accepts one shape, bound to a per-run nonce, and independent transfer
     challenges remain the backstop for mastery. Server-side execution stays
     the answer when stakes demand it (PRD §13).
*/

export const HARNESS_NS = "nexora-harness";
export const HARNESS_TIMEOUT_MS = 6000;
/** Driver-side cap for a single wait op. */
export const HARNESS_MAX_WAIT_MS = 2000;

/**
 * The op executor as plain JavaScript source — the literal bytes embedded in
 * the sandboxed frame. Written as a string on purpose: serializing a compiled
 * function via .toString() leaks compiler helpers (esbuild wraps functions in
 * __name(...); SWC does not), which silently breaks the sandbox copy under
 * some toolchains. Here what ships is exactly what the tests materialize.
 *
 * Contract for edits: self-contained (no imports/closures), no backticks,
 * no ${ sequences (outer literal), no "</script" sequence (injected inline).
 */
export const RUN_OP_SOURCE = `
function (doc, win, op) {
  function fail(error) { return { id: op.id, ok: false, error: error }; }
  try {
    if (op.act === 'click') {
      if (!op.selector) return fail('click needs a selector');
      var el = doc.querySelector(op.selector);
      if (!el) return fail('not found: ' + op.selector);
      // Prefer the platform's own activation (el.click): it performs the
      // same default actions a real click does — including submitting a
      // form, which a bare dispatched event does not reliably trigger.
      try {
        if (typeof el.click === 'function') {
          el.click();
        } else {
          var evt;
          if (typeof win.MouseEvent === 'function') {
            evt = new win.MouseEvent('click', { bubbles: true, cancelable: true });
          } else if (typeof doc.createEvent === 'function') {
            evt = doc.createEvent('MouseEvents');
            evt.initEvent('click', true, true);
          } else {
            return fail('cannot synthesize clicks here');
          }
          el.dispatchEvent(evt);
        }
      } catch (err) {
        return fail(String((err && err.message) || err));
      }
      return { id: op.id, ok: true, value: 'clicked' };
    }
    if (op.act === 'fill') {
      if (!op.selector) return fail('fill needs a selector');
      var field = doc.querySelector(op.selector);
      if (!field) return fail('not found: ' + op.selector);
      if (!('value' in field)) return fail('not fillable: ' + op.selector);
      field.value = op.value === undefined || op.value === null ? '' : op.value;
      field.dispatchEvent(new win.Event('input', { bubbles: true }));
      field.dispatchEvent(new win.Event('change', { bubbles: true }));
      try { field.focus(); } catch (ignored) {}
      return { id: op.id, ok: true, value: field.value };
    }
    if (op.act === 'call') {
      if (!op.fn) return fail('call needs a function name');
      var fn = win[op.fn];
      if (typeof fn !== 'function') return fail('not a function: ' + op.fn);
      var out;
      try { out = fn.apply(null, op.args || []); }
      catch (err) { return fail(String((err && err.message) || err)); }
      // Promise results settle through the driver's chain (may resolve or
      // reject — rejection becomes a failed observation, assertable via
      // expectError). Sync results pass through untouched.
      if (out && typeof out.then === 'function') {
        return out.then(function (v) {
          return { id: op.id, ok: true, value: v === undefined ? null : v };
        }, function (e) {
          return { id: op.id, ok: false, error: String((e && e.message) || e) };
        });
      }
      return { id: op.id, ok: true, value: out === undefined ? null : out };
    }
    if (op.act === 'read') {
      var prop = op.prop || 'text';
      if (prop === 'exists') {
        return { id: op.id, ok: true, value: doc.querySelector(op.selector || '') !== null };
      }
      if (prop === 'count') {
        return { id: op.id, ok: true, value: doc.querySelectorAll(op.selector || '').length };
      }
      var target = doc.querySelector(op.selector || '');
      if (!target) return fail('not found: ' + (op.selector || ''));
      if (prop === 'attr') {
        return { id: op.id, ok: true, value: target.getAttribute(op.attr || '') };
      }
      if (prop === 'value') {
        var v = target.value;
        return { id: op.id, ok: true, value: v === undefined ? null : v };
      }
      var text = target.textContent;
      return { id: op.id, ok: true, value: text === null || text === undefined ? '' : text.trim() };
    }
    return fail('unknown act: ' + op.act);
  } catch (err) {
    return fail(String((err && err.message) || err));
  }
}`;

/** Materialize the shipped executor (used by tests — same bytes as the frame). */
export function materializeRunOp(): (
  doc: Document,
  win: any,
  op: HarnessOp
) => HarnessObs {
  const factory = new Function('return (' + RUN_OP_SOURCE + ');') as () => (
    doc: Document,
    win: any,
    op: HarnessOp
  ) => HarnessObs;
  return factory();
}

/** Parent-side verdict over observations. Pure and fully unit-testable. */
export function evaluateAssertions(
  obsById: Map<string, HarnessObs>,
  assertions: HarnessAssert[]
): boolean {
  if (assertions.length === 0) return false;
  return assertions.every((a) => {
    var r = obsById.get(a.op);
    if (!r) return false;
    if (a.expectError !== undefined) {
      if (r.ok) return false;
      try {
        return new RegExp(a.expectError).test(String(r.error === undefined || r.error === null ? "" : r.error));
      } catch {
        return false;
      }
    }
    if (!r.ok) return false;
    if (a.truthy !== undefined) {
      if (!!r.value !== a.truthy) return false;
    }
    if (a.equals !== undefined) {
      if (JSON.stringify(r.value) !== JSON.stringify(a.equals)) return false;
    }
    if (a.matches !== undefined) {
      try {
        if (!new RegExp(a.matches).test(String(r.value))) return false;
      } catch {
        return false;
      }
    }
    return true;
  });
}

/** The driver program injected into the sandboxed frame (as text). */
export function buildDriverSource(): string {
  // NOTE: string concatenation throughout — the executor source is embedded
  // verbatim, so this builder must never interpret it as a template.
  return (
    "(function () {\n" +
    "var RUN_OP = (" + RUN_OP_SOURCE + ");\n" +
    "function sanitize(value) {\n" +
    "  try { return JSON.parse(JSON.stringify(value === undefined ? null : value)); }\n" +
    "  catch (e) { try { return String(value); } catch (e2) { return null; } }\n" +
    "}\n" +
    "function sleep(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }\n" +
    "window.addEventListener('message', function (event) {\n" +
    "  var data = event.data;\n" +
    "  if (!data || data.ns !== '" + HARNESS_NS + "' || data.kind !== 'run') return;\n" +
    "  var ops = Array.isArray(data.ops) ? data.ops : [];\n" +
    "  var results = [];\n" +
    "  var chain = Promise.resolve();\n" +
    "  ops.forEach(function (op, i) {\n" +
    "    chain = chain.then(function () {\n" +
    "      if (op && op.act === 'wait') {\n" +
    "        var ms = Math.max(0, Math.min(op.ms || 0, " + HARNESS_MAX_WAIT_MS + "));\n" +
    "        return sleep(ms).then(function () { results.push({ id: op.id, ok: true, value: 'waited' }); });\n" +
    "      }\n" +
    "      return Promise.resolve().then(function () { return RUN_OP(document, window, op); }).then(function (obs) {\n" +
    "        obs.value = sanitize(obs.value);\n" +
    "        results.push(obs);\n" +
    "      }, function (err) {\n" +
    '        results.push({ id: (op && op.id) || ("op" + i), ok: false, error: String((err && err.message) || err) });\n' +
    "      });\n" +
    "    });\n" +
    "  });\n" +
    "  chain.then(function () {\n" +
    "    var reply = { ns: '" + HARNESS_NS + "', kind: 'obs', nonce: data.nonce, results: results };\n" +
    "    if (event.source && event.source.postMessage) event.source.postMessage(reply, '*');\n" +
    "  });\n" +
    "});\n" +
    "})();"
  );
}

/** Learner HTML + driver appended last so learner scripts load first. */
export function injectDriver(code: string): string {
  var tag = '<script>' + buildDriverSource() + '</script>';
  if (/<\/body\s*>/i.test(code)) return code.replace(/<\/body\s*>/i, tag + '</body>');
  return code + '\n' + tag + '\n';
}

/** Validate an inbound harness reply (shape + nonce binding). */
export function isHarnessReply(data: any, nonce: string): data is { results: HarnessObs[] } {
  return (
    !!data &&
    data.ns === HARNESS_NS &&
    data.kind === 'obs' &&
    data.nonce === nonce &&
    Array.isArray(data.results)
  );
}
