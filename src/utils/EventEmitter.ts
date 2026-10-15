type Listener<T> = (payload: T) => void;

export class EventEmitter<Events extends object> {
  private readonly listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener as Listener<never>);
    return () => this.listeners.get(event)?.delete(listener as Listener<never>);
  }

  protected emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.listeners.get(event)?.forEach((listener) => (listener as Listener<Events[K]>)(payload));
  }
}
