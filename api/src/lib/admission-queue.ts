import { ApiError } from "./errors.js";

const busy = () =>
  new ApiError(503, "RATE_LIMITED", "Hay demasiadas operaciones en curso. Inténtalo de nuevo.");
const cancelled = () => new ApiError(409, "CONFLICT", "La solicitud fue cancelada.");
type Waiter = { start: () => void; cancel: () => void };

export class AdmissionQueue {
  private active = false;
  private waiting = new Set<Waiter>();

  constructor(private readonly capacity: number) {}

  get size() {
    return Number(this.active) + this.waiting.size;
  }

  acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(cancelled());
    if (this.size >= this.capacity) return Promise.reject(busy());
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        start: () => {
          signal?.removeEventListener("abort", waiter.cancel);
          this.waiting.delete(waiter);
          this.active = true;
          let released = false;
          resolve(() => {
            if (released) return;
            released = true;
            this.active = false;
            this.waiting.values().next().value?.start();
          });
        },
        cancel: () => {
          this.waiting.delete(waiter);
          signal?.removeEventListener("abort", waiter.cancel);
          reject(cancelled());
        },
      };
      if (!this.active) waiter.start();
      else {
        this.waiting.add(waiter);
        signal?.addEventListener("abort", waiter.cancel, { once: true });
      }
    });
  }
}
