/* The narrow slice of jsdom this service uses.
 *
 * `@types/jsdom` is deliberately not installed. It depends on `@types/node@*`,
 * and that re-resolves Node's types for the whole service mesh — installing it
 * broke the gateway's build (its `Buffer` request bodies stopped matching the
 * fetch types) for the sake of one constructor in this service.
 *
 * The surface below is the whole of what we touch, and `document` stays
 * `unknown` on purpose: the interpreter casts it to its own `DocLike`, which is
 * the real contract between the rules and whatever parsed the draft. A wrong
 * declaration here cannot drift quietly either — the parse path is exercised
 * for real by the document-check tests, against the installed jsdom.
 */
declare module "jsdom" {
  export class JSDOM {
    constructor(html: string);
    readonly window: { readonly document: unknown };
  }
}
