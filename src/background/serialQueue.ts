/** Serialize read-modify-write operations without allowing a failed write to poison the queue. */
export function createSerialQueue(): <T>(operation: () => Promise<T>) => Promise<T> {
  let pending = Promise.resolve();
  return <T>(operation: () => Promise<T>): Promise<T> => {
    const result = pending.then(operation);
    pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}
