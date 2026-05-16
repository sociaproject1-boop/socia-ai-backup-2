/**
 * Simple in-memory semaphore to cap concurrent AI requests.
 * Prevents server overload when multiple users generate at once.
 */
export class Semaphore {
  private available: number;
  private readonly queue: Array<() => void> = [];

  constructor(max: number) {
    this.available = max;
  }

  acquire(): Promise<void> {
    if (this.available > 0) {
      this.available--;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next(); // pass the slot to the next waiter
    } else {
      this.available++;
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// Shared instances — image gen is lighter than video gen
export const imageSemaphore = new Semaphore(4);
export const videoSemaphore = new Semaphore(2);
