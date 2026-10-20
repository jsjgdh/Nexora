# The bounds on a run: what a submission may cost

Two things bound a run: what a submission may be, refused before any runner
sees it, and what a run may cost while it is going, refused by killing it.

## Before any runner sees it

`validate.ts` refuses a submission on shape alone, before a process is
started:

- at most 32 files, each at most 256 000 bytes, at most 512 000 bytes in all;
- at most 64 000 bytes of stdin;
- for Go, at most 40 imported packages.

The Go import bound is the one that matters for a compile. `go run`
type-checks and compiles every package in the import graph, so a small
submission with a deep dependency chain is a compile workload wearing a
learner's submission as a disguise. The count is over the import graph, not
over the file count: a single file importing forty packages is refused the
same way a file importing forty packages across forty files is.

The per-file ceiling cannot be reached through the public route on its own:
the wire schema caps a file at the same number, so the contract answers
first. The total ceiling is reachable, and that is the one that matters.

## While it is going

`runners/bounds.ts` owns both bounds, and the rule it keeps is that a bound
which trips must leave nothing running.

| Bound | What it is | Where it is enforced |
| --- | --- | --- |
| Wall clock | the deadline the validation layer capped (20 s for Go, 8 s for the interpreters) | ours, a timer |
| CPU | three times the wall budget, for the whole process tree | the operating system's own counters |

The CPU budget is a multiple of the wall budget because a program that stays
inside its wall clock on one core can never exceed it: one core for one
wall-second is one CPU-second. So a single-threaded learner program is never
killed for CPU, and the bound that bites is the one meant to, work that
spreads across cores. A runaway build is exactly that. The Go toolchain is
pinned to two cores (`GOMAXPROCS=2`, as in the docker tier) so that the
number of cores a build may use is bounded too.

The answer says which bound was hit, in the `bound` field: `wall`, `cpu`, or
`null` when the program finished on its own. `timedOut` stays true only for
the wall clock, so a caller that reads it as "it hung" is not misled by a
build that was stopped for CPU.

### Nothing outlives the answer

When a bound trips, the whole process tree is killed and the answer waits for
the kill to land:

- POSIX: the child is started as its own process group, and the group is
  killed.
- Windows: `taskkill /T /F`, which walks the tree.

Killing only the direct child is not enough and was the defect this closes.
A `go run` starts a compiler; a learner program starts whatever it likes.
Under the old runner the promise resolved on the timeout while the compiler
kept burning the host's CPU, and the request had already been answered.

The docker tier has the same shape of defect and the same fix: the container
writes down its own id (`--cidfile`), and a timeout kills the container
before it kills the client. Killing the client leaves the container running
with the learner's program inside it.

## The tier that runs in production

`docker-compose.yml` runs the docker tier, and the subprocess tier is refused
in production unless an operator names the risk explicitly. The docker tier's
bounds are the kernel's, not ours:

- `--cpus 0.5`: a hard cap on the CPU rate, so the total CPU work of a job
  is at most half a core times the wall clock;
- `--memory` and `--memory-swap`: the memory ceiling;
- `--pids-limit`: the number of processes;
- `--network none`: no network at all;
- the wall clock, enforced by the runner as above.

The subprocess tier cannot do the rate cap: without privileges there is no
cgroup to put the child in. It bounds the total CPU of the tree instead,
which is the same quantity seen from the other side.

## Where this is proved

`scripts/verify-bounds.mjs` drives the real execution service over HTTP with
a real Go toolchain:

- a submission over the size ceiling is refused with 400, and a marker file
  the program would have written proves the program never ran;
- a run past the wall clock answers `bound: "wall"`, and the marker file a
  grandchild would have written three seconds later does not exist, which is
  what "the whole tree died" looks like from outside;
- a build that spreads over the cores answers `bound: "cpu"` before the wall
  clock runs out;
- the command the docker runner builds carries the CPU cap, the memory cap,
  the process cap, no network and the container id.
