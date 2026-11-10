import { EventEmitter } from "node:events";
export type UserEvent = { type: "notification" | "unread-count" | "role-changed"; data: unknown };
export interface EventBus {
  publish(userId: string, event: UserEvent): void;
  subscribe(userId: string, listener: (event: UserEvent) => void): () => void;
}
class MemoryEventBus implements EventBus {
  private emitter = new EventEmitter();
  constructor() {
    this.emitter.setMaxListeners(0);
  }
  publish(userId: string, event: UserEvent) {
    this.emitter.emit(userId, event);
  }
  subscribe(userId: string, listener: (event: UserEvent) => void) {
    this.emitter.on(userId, listener);
    return () => {
      this.emitter.off(userId, listener);
    };
  }
}
export const eventBus: EventBus = new MemoryEventBus();
const pending = new WeakMap<object, (() => void | Promise<void>)[]>();
export function afterCommit(transaction: object, effect: () => void | Promise<void>) {
  const effects = pending.get(transaction) ?? [];
  effects.push(effect);
  pending.set(transaction, effects);
}
export async function committed(transaction: object) {
  const effects = pending.get(transaction) ?? [];
  pending.delete(transaction);
  await Promise.allSettled(effects.map((effect) => Promise.resolve().then(effect)));
}
