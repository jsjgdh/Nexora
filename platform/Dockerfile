# Shared production image for all services. SERVICE selects the entrypoint.
# Build one image per service: docker build --build-arg SERVICE=auth .
ARG SERVICE=gateway
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/service-kit/package.json ./packages/service-kit/package.json
COPY services/gateway/package.json ./services/gateway/package.json
COPY services/auth/package.json ./services/auth/package.json
COPY services/curriculum/package.json ./services/curriculum/package.json
COPY services/execution/package.json ./services/execution/package.json
COPY services/billing/package.json ./services/billing/package.json
RUN npm ci

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/contracts ./packages/contracts
COPY packages/service-kit ./packages/service-kit
COPY services ./services
COPY scripts/sync-curriculum.mjs ./scripts/sync-curriculum.mjs
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/service-kit/package.json ./packages/service-kit/package.json
COPY services/gateway/package.json ./services/gateway/package.json
COPY services/auth/package.json ./services/auth/package.json
COPY services/curriculum/package.json ./services/curriculum/package.json
COPY services/execution/package.json ./services/execution/package.json
COPY services/billing/package.json ./services/billing/package.json
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /app/packages/service-kit/dist ./packages/service-kit/dist
COPY --from=build /app/services/gateway/dist ./services/gateway/dist
COPY --from=build /app/services/auth/dist ./services/auth/dist
COPY --from=build /app/services/curriculum/dist ./services/curriculum/dist
COPY --from=build /app/services/execution/dist ./services/execution/dist
COPY --from=build /app/services/billing/dist ./services/billing/dist
COPY --from=build /app/services/auth/migrations ./services/auth/migrations
COPY --from=build /app/services/billing/migrations ./services/billing/migrations
# The backup and the restore drill travel IN the image, so the operator can run
# them from the same artifact that is running — `docker compose run --rm backup`
# — without a second copy of the platform on the host, and without the host
# needing a Postgres client it would otherwise have to keep in step with the
# server's version.
COPY scripts/backup.mjs ./scripts/backup.mjs
COPY scripts/backup-drill.mjs ./scripts/backup-drill.mjs

# The execution service is the one image that must run learner code, and Go is
# the product's teaching language, so only that image pays for the toolchain.
# The standard library is compiled into a shared cache at build time: modern Go
# ships no precompiled std, and without this every learner's first program would
# pay several seconds of cold compilation.
ARG SERVICE
RUN if [ "$SERVICE" = "execution" ]; then \
      apk add --no-cache go && \
      mkdir -p /opt/gocache /opt/warm && \
      cd /opt/warm && go mod init warm > /dev/null 2>&1 && \
      CGO_ENABLED=0 GOCACHE=/opt/gocache GOFLAGS=-mod=mod GOTOOLCHAIN=local go build std && \
      rm -rf /opt/warm && \
      chown -R app:app /opt/gocache ; \
    fi

ENV SERVICE=${SERVICE}
USER app
EXPOSE 8080 8101 8102 8104 8106
CMD ["sh", "-c", "node services/${SERVICE}/dist/index.js"]
