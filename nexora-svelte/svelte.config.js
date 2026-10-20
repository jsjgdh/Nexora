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

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter,
  },
};

export default config;
