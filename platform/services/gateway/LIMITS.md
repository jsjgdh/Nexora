# The limits: one gateway, and what that means

The platform's rate caps, its anonymous cap, its whole-platform budget and its
dependency breaker are all counters in one process: the gateway. The identity
service keeps three budgets of its own (address, account, registration) and the
execution service keeps the daily per-account run quota, and those are counters
in their own processes.

This file is the decision that makes those numbers mean something.

## The decision

**The deployment runs one gateway process, and that process is the only
limiter.** `docker-compose.yml` publishes one port, 8080, and it belongs to
the gateway. Every request a client can make reaches that one process before
it reaches anything else, so the caps below are the product's caps, not one
gateway's share of them.

The reason is the deployment, not a preference: the product is one VPS with
one compose stack (TODO 2, "Target live"). At that size a shared counter store
(Redis) would be infrastructure to keep alive for a problem the topology does
not have. A shared store is the right answer when there is more than one
edge, and the switch below says when that is.

The running product states the decision as well: `GET /health/deep` answers
with `limits.scope: "single-process"` and the reason in words, next to the
caps themselves and the state of every breaker.

## What the caps are

| Cap | Knob | Default | What it counts |
| --- | --- | --- | --- |
| Per-address | `GATEWAY_GLOBAL_LIMIT` | 600 per window | every request under `/api/`, from one address |
| Anonymous | `GATEWAY_ANON_LIMIT` | 60 per window | the requests under `/api/` with no verified identity |
| Per-route | per route in `config.ts` | 60 to 600 per window | the requests for one route, from one address |
| Whole platform | `GATEWAY_EDGE_LIMIT` | 20 000 per window | every request under `/api/`, from every address |
| Breaker | `GATEWAY_BREAKER_FAILURES` / `GATEWAY_BREAKER_COOLDOWN_MS` | 3 failures / 15 s | one dependency that has stopped answering |

The window is the same for all of them: `GATEWAY_LIMIT_WINDOW_MS`, 60 s by
default.

Two things are deliberately not counted:

- **The health probes.** A limit that can refuse a health check would let a
  flood mark the platform unhealthy and get it restarted. The probes are
  answered whatever the caps say.
- **The requests the gateway answers without forwarding**, which is none: the
  caps are applied before the routing, so a path that matches no route is
  counted too. A flood of paths that match no route is what an attacker
  sends.

### The anonymous cap

Counted after the credential has been read and before anything is refused for
it, so it is exactly the traffic with no verified identity. A signed-in
learner is never charged for it, and a caller with a bad token is: an
unusable credential is anonymous traffic.

### The whole-platform budget

A per-address cap cannot see a flood that arrives from many addresses at once,
which is the shape a distributed flood has. This budget is the cap for that.
When it is spent the edge sheds load: 429 with a `Retry-After`, never a
request queued until something upstream gives up.

### The dependency breaker

One breaker per upstream service. After `GATEWAY_BREAKER_FAILURES` failures
in a row the service is treated as down: requests for it are refused with 503
`dependency_unavailable` and a `Retry-After`, and are not forwarded at all.
After the cooldown one probe is let through; if it answers, the breaker
closes.

The breaker fails closed. While it is open the answer is a refusal, never a
guess that the dependency might be fine, and never a request held open for the
timeout.

Only the proxied request counts. The revocation check and the entitlement
lookup have their own degradation rules, and their outages are not this
breaker's business.

## The limit of the decision

**Per-process caps mean N instances multiply the caps.** One gateway means
600 requests a minute from one address is 600 for the whole product. Two
gateways mean it is 1 200, and the daily per-account run quota held by the
execution service is per account *per execution instance*, so two execution
instances mean twice the allowance.

So the residual is named: this decision holds for the deployment as it is
written. Before a second gateway, a second execution service or a second
identity service is ever run, the counters have to move to a shared store.
Redis is the obvious one, but the requirement is the shared store, not the
product: the counters have to be shared, and the store has to be as durable
as the limit it holds.

What changes with a shared store, and what does not:

- The rate caps, the anonymous cap and the whole-platform budget become
  counters in Redis with the same keys. Nothing else moves.
- The identity service's budgets and the execution service's daily quota move
  the same way, for the same reason.
- The breaker does not need a shared store: a breaker is about one edge's
  view of one dependency, and each edge keeping its own is correct.

## Where this is proved

`scripts/verify-bounds.mjs` drives the real gateway process over HTTP:

- requests over the anonymous cap are refused with 429 and a `Retry-After`;
- the per-address cap counts the API paths, the public paths and the paths
  that match no route alike;
- the whole-platform budget sheds load with 429 and a retry hint;
- the dependency breaker opens when its dependency stops answering, refuses
  traffic without calling the dependency at all, and closes when the
  dependency comes back;
- the daily per-account run quota is refused on the public path, through the
  gateway, for a learner that exists in the real database.
