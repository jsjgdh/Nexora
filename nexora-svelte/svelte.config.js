import adapterNode from "@sveltejs/adapter-node";
import adapterVercel from "@sveltejs/adapter-vercel";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/*
 * The adapter is chosen by the build environment, not by a branch.
 *
 * The front door is deployed to Vercel, and it is also run from the compose
 * stack on a developer's machine. Those two want different adapters: Vercel
 * builds the `.vercel/output` its own runtime serves, and adapter-node builds
 * a standalone `build/` directory a container runs with `node build`.
 *
 * A single checked-in adapter would break one of the two. `VERCEL` is set by
 * Vercel's build environment and by nothing else, so the build picks the
 * adapter that matches where it is running — and the Dockerfile path, which is
 * what the compose stack and any self-hosted deployment use, keeps working
 * without a second branch or a second config file.
 */
const adapter = process.env.VERCEL ? adapterVercel() : adapterNode();

/*
 * The content security policy, enforced.
 *
 * It used to be a report-only header set by hand in the hooks file, which
 * meant the browser collected violations nobody read, and the browser's
 * access token was reachable by any script that could run on the origin. The
 * operator's console made that worth fixing: its actions are driven by that
 * token, so a script that could reach it could grant itself the console.
 *
 * SvelteKit builds the header, and it hashes the scripts it renders (a
 * prerendered page) or gives them a nonce (a page rendered at request
 * time), so the policy is exact rather than a hand-written guess. The one
 * inline script in the shell carries the nonce placeholder, which is what
 * makes it allowed.
 *
 * The development server is the exception, and it has to be: Vite's client
 * injects an inline module preamble, so a strict policy would break hot
 * reload on every machine that develops the site. Development therefore
 * allows inline script, and production does not. The distinction is decided
 * here, at build time, and the built server carries the strict policy.
 *
 * `style-src` keeps 'unsafe-inline' in production, because the site sets
 * custom properties on elements with style attributes, and a style attribute
 * cannot be hashed. That is a real limit, and it is a limit on style, not on
 * script: the token is in script.
 */
const development = process.env.NODE_ENV !== "production";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter,
    csp: {
      // 'auto' means hashes on a prerendered page and a nonce on a page
      // rendered at request time, which is what SvelteKit supports without
      // the page having to know which it is.
      mode: "auto",
      directives: {
        "default-src": ["self"],
        "script-src": development ? ["self", "unsafe-inline"] : ["self"],
        // The site sets custom properties on elements, and a style attribute
        // cannot be hashed, so inline style stays allowed.
        "style-src": ["self", "unsafe-inline"],
        "img-src": ["self", "data:", "blob:"],
        // The typefaces are served from this site, so the font source is this
        // site too and the front door makes no third-party request to render
        // a page.
        "font-src": ["self", "data:"],
        // The platform's gateway, and (in development) Vite's hot reload
        // socket.
        "connect-src": development ? ["self", "https:", "ws:"] : ["self", "https:"],
        "frame-src": ["self", "https:"],
        "worker-src": ["self", "blob:"],
        "object-src": ["none"],
        "base-uri": ["self"],
        "form-action": ["self"],
        "frame-ancestors": ["none"],
      },
    },
  },
};

export default config;
