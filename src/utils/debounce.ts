/**
 * A debouncer with one timer per key (e.g. per set id), so a burst of edits
 * to one key collapses to its last call while edits to other keys are never
 * dropped. `flush` runs pending calls now (before finishing a workout, on
 * pagehide / tab hidden / unmount); it resolves when they have all settled.
 */
export interface KeyedDebouncer<K, A extends unknown[]> {
  schedule(key: K, ...args: A): void;
  /** Run the pending call for `key`, or every pending call if omitted. */
  flush(key?: K): Promise<void>;
  /** Drop the pending call for `key` (all if omitted) without running it. */
  cancel(key?: K): void;
}

export function keyedDebounce<K, A extends unknown[]>(
  fn: (key: K, ...args: A) => void | Promise<void>,
  delay: number,
): KeyedDebouncer<K, A> {
  const pending = new Map<
    K,
    { timer: ReturnType<typeof setTimeout>; args: A }
  >();

  const run = (key: K): Promise<void> => {
    const entry = pending.get(key);
    if (!entry) return Promise.resolve();
    clearTimeout(entry.timer);
    pending.delete(key);
    return Promise.resolve()
      .then(() => fn(key, ...entry.args))
      .catch((err) => console.error('Debounced call failed:', err));
  };

  return {
    schedule(key, ...args) {
      const existing = pending.get(key);
      if (existing) clearTimeout(existing.timer);
      pending.set(key, { timer: setTimeout(() => run(key), delay), args });
    },
    async flush(key) {
      const keys = key === undefined ? [...pending.keys()] : [key];
      await Promise.all(keys.map(run));
    },
    cancel(key) {
      const keys = key === undefined ? [...pending.keys()] : [key];
      for (const k of keys) {
        const entry = pending.get(k);
        if (entry) clearTimeout(entry.timer);
        pending.delete(k);
      }
    },
  };
}
