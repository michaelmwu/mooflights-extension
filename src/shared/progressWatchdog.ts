/** An idle limit resets on progress, not on total run duration. */
export function createProgressWatchdog(idleMs: number, onIdle: (requestId: string) => void, now = Date.now) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let requestId = "";
  let touchedAt = 0;
  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    requestId = "";
    touchedAt = 0;
  };
  const expire = () => {
    const id = requestId;
    clear();
    if (id) onIdle(id);
  };
  return {
    touch(id: string) {
      clear();
      if (!id) return;
      requestId = id;
      touchedAt = now();
      timer = setTimeout(expire, idleMs);
    },
    clear,
    // A focus/navigation tick can recover even if the browser throttled the timer.
    check() {
      if (requestId && now() - touchedAt >= idleMs) expire();
    },
  };
}
