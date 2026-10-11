/* Bounded job queue: at most `concurrency` jobs run at once; the rest wait
   FIFO. Backpressure instead of unbounded spawning (fork-bomb resistance).
   Swap for BullMQ+Redis when scaling past one instance. */

export class JobQueue {
  private running = 0;
  private waiting: (() => void)[] = [];
  readonly maxObserved = { n: 0 };

  constructor(readonly concurrency: number) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error("concurrency must be a positive integer");
    }
  }

  get depth(): number {
    return this.waiting.length;
  }

  async run<T>(job: () => Promise<T>): Promise<T> {
    if (this.running >= this.concurrency) {
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
