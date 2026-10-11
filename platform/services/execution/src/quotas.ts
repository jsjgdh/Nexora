/* Per-user daily quotas + per-user concurrency caps (abuse control).
   In-memory by design for v1; move to Redis when running >1 instance. */

export class Quotas {
  private days = new Map<string, { day: string; count: number }>();
  private active = new Map<string, number>();

  constructor(
    readonly dailyQuota: number,
    readonly maxConcurrentPerUser: number
  ) {}

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** Returns null when allowed, or a human reason when denied. */
  check(userId: string): string | null {
    const day = this.today();
    const cur = this.days.get(userId);
    const used = cur && cur.day === day ? cur.count : 0;
    if (used >= this.dailyQuota) {
      return `Daily execution quota reached (${this.dailyQuota}). Try again tomorrow.`;
    }
    if ((this.active.get(userId) ?? 0) >= this.maxConcurrentPerUser) {
      return "Too many concurrent executions. Wait for one to finish.";
    }
    return null;
  }

  /** Remaining daily runs for this authenticated account, not counting an in-flight run. */
  remaining(userId: string): number {
    const day = this.today();
    const cur = this.days.get(userId);
    const used = cur && cur.day === day ? cur.count : 0;
    return Math.max(0, this.dailyQuota - used);
  }

  acquire(userId: string): () => void {
    const day = this.today();
    const cur = this.days.get(userId);
    this.days.set(userId, { day, count: (cur && cur.day === day ? cur.count : 0) + 1 });
    this.active.set(userId, (this.active.get(userId) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active.set(userId, Math.max(0, (this.active.get(userId) ?? 1) - 1));
    };
  }
}
