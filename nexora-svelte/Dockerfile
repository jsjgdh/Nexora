# Production image for the NEXORA SvelteKit frontend (adapter-node).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . ./
# The public values the build bakes. `/sitemap.xml` and `/robots.txt` are
# prerendered, so they read PUBLIC_SITE_URL at build time, and the built
# artefact carries that origin forever after. `.env` is excluded from the build
# context (it can hold the site's server-side keys), so without these the only
# origin a production image can bake is the local-mode fallback and the sitemap
# advertises localhost. They are PUBLIC_ by definition, so a build argument is
# the right carrier; compose passes them from the platform's .env.
ARG PUBLIC_SITE_URL=
ARG PUBLIC_API_URL=
ARG PUBLIC_IDE_DOWNLOAD_URL=
ARG PUBLIC_CLERK_PUBLISHABLE_KEY=
ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL \
    PUBLIC_API_URL=$PUBLIC_API_URL \
    PUBLIC_IDE_DOWNLOAD_URL=$PUBLIC_IDE_DOWNLOAD_URL \
    PUBLIC_CLERK_PUBLISHABLE_KEY=$PUBLIC_CLERK_PUBLISHABLE_KEY
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/build ./build
USER app
EXPOSE 3000
CMD ["node", "build"]
