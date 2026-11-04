/** The subset of `navigator.locks` used here, so tests can supply their own. */
export type LockManagerLike = {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
};

export type Exclusive = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * Runs tasks one at a time. With a lock manager (`navigator.locks`) the lock is
 * shared by every tab on the origin; without one, tasks queue within this tab.
 */
export function createExclusive(locks: LockManagerLike | null | undefined, lockName: string): Exclusive {
  if (locks) return task => locks.request(lockName, task);
  let tail: Promise<unknown> = Promise.resolve();
  return task => {
    const result = tail.then(task, task);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}

/**
 * Concurrent callers share one in-flight call of `run`, which itself runs under
 * `exclusive`, so other tabs wait for it instead of running theirs at the same time.
 *
 * Refresh tokens rotate on every use and reusing an old one revokes the session,
 * so two refreshes must never overlap: not within a tab, and not across tabs.
 */
export function singleFlight<T>(run: () => Promise<T>, exclusive: Exclusive): () => Promise<T> {
  let inflight: Promise<T> | null = null;
  return () => {
    if (inflight) return inflight;
    inflight = exclusive(run).finally(() => { inflight = null; });
    return inflight;
  };
}

/** `navigator.locks` when the browser supports it (all current browsers on secure contexts and localhost). */
export function browserLocks(): LockManagerLike | null {
  if (typeof navigator === 'undefined' || !('locks' in navigator) || !navigator.locks) return null;
  const locks = navigator.locks;
  return { request: (name, callback) => locks.request(name, () => callback()) };
}
