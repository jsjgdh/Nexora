/* Bounded job queue: at most `concurrency` jobs run at once and at most
   `maxDepth` wait for a slot; beyond that a caller is refused outright.
   Backpressure instead of unbounded spawning (fork-bomb resistance) — and
   instead of unbounded *waiting*, which looks like backpressure from the
   inside while still holding a socket, a promise and the caller's request
   open for as long as the runner stays busy.
   Swap for BullMQ+Redis when scaling past one instance. */

/**
 * The runner is at capacity: `maxDepth` jobs are already waiting for a slot.
 *
 * A distinct type rather than a bare Error so the route can answer with a 503
 * and a Retry-After, instead of the generic 500 an unrecognised throw would
 * produce. Refusing is the honest answer: the caller can retry, whereas an
 * accepted-then-timed-out request tells the learner nothing about what happened.
 */
export class QueueSaturated extends Error {
  constructor(readonly maxDepth: number) {
    super(`Runner is at capacity: ${maxDepth} jobs are already queued.`);
    this.name = "QueueSaturated";
  }
}

export class JobQueue {
  private running = 0;
  private waiting: (() => void)[] = [];
  readonly maxObserved = { n: 0 };

  constructor(
    readonly concurrency: number,
    readonly maxDepth: number = 256
  ) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error("concurrency must be a positive integer");
    }
    if (!Number.isInteger(maxDepth) || maxDepth < 1) {
      throw new Error("maxDepth must be a positive integer");
    }
  }

  get depth(): number {
    return this.waiting.length;
  }

  async run<T>(job: () => Promise<T>): Promise<T> {
    if (this.running >= this.concurrency) {
      // Checked before the push, so the waiting set can never exceed maxDepth.
      if (this.waiting.length >= this.maxDepth) throw new QueueSaturated(this.maxDepth);
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.running += 1;
    this.maxObserved.n = Math.max(this.maxObserved.n, this.running);
    try {
      return await job();
    } finally {
      this.running -= 1;
      const next = this.waiting.shift();
      if (next) next();
    }
  }
}
