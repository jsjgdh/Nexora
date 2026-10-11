import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Cross-origin isolation for the WebContainer POC (/lab/containers):
  // SharedArrayBuffer requires COOP + COEP. `credentialless` (rather than
  // require-corp) keeps hotlinked no-cors resources — e.g. the picsum.photos
  // images used across missions — loading normally. Boot the container with
  // { coep: 'credentialless' } to match. See webcontainers.io “Configuring
  // Headers”. If this ever breaks third-party embeds, scope these headers to
  // /lab/* instead of applying them globally.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
    ];
  },
};

export default nextConfig;
