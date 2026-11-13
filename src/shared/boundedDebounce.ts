/** Trailing debounce that still runs during a continuously changing page. */
export function boundedDebounce(
  callback: () => void,
  delayMs: number,
  maxWaitMs = 1000,
): (() => void) & { cancel: () => void } {
  let trailing: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    clearTimeout(trailing);
    clearTimeout(deadline);
    trailing = undefined;
    deadline = undefined;
  };
  const run = () => {
    cancel();
    callback();
  };
  const schedule = () => {
    clearTimeout(trailing);
    trailing = setTimeout(run, delayMs);
    deadline ??= setTimeout(run, maxWaitMs);
  };
  return Object.assign(schedule, { cancel });
}
