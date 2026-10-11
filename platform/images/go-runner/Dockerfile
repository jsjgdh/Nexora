# Go runner image for the docker execution tier.
#
# Why this exists instead of pulling `golang:alpine` directly:
#   1. Modern Go does NOT ship precompiled standard-library packages. The first
#      `go run main.go` therefore compiles `fmt` and everything it depends on,
#      which costs a learner several cold seconds — every time a fresh container
#      starts, because the build cache lives in the container's /tmp.
#   2. Prewarming at image build moves that cost to deploy time, once.
#
# Build (the tag is what EXEC_IMAGES.go references):
#   docker build -t nexora-go-runner:1 platform/images/go-runner
#
# The execution service's docker runner then runs each submission in this image
# with no network, a read-only root, and a writable+executable /tmp.
FROM golang:1.23-alpine

# Pure-Go static builds: no C toolchain in the sandbox, smaller binaries.
ENV CGO_ENABLED=0 \
    GOFLAGS=-mod=mod \
    GOTOOLCHAIN=local \
    GOCACHE=/opt/gocache \
    GOPATH=/opt/gopath

# Prewarm the standard library into a shared, world-readable cache. The runner
# overrides GOCACHE to a per-container /tmp path, so this directory is the
# seed for `go build std` and nothing else executes from it.
RUN mkdir -p /opt/gocache /opt/gopath /warm && \
    cd /warm && go mod init warm > /dev/null 2>&1 && \
    go build std && \
    rm -rf /warm && \
    chmod -R a+rX /opt/gocache

# The runner supplies the command (`go run <file>`); this is the fallback for a
# bare `docker run` so the image is self-explanatory when inspected.
CMD ["go", "version"]
