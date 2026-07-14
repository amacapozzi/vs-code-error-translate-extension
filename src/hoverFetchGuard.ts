let internalFetchInProgress = false;

export function isInternalFetch(): boolean {
  return internalFetchInProgress;
}

export async function withInternalFetchGuard<T>(fn: () => Promise<T>): Promise<T> {
  internalFetchInProgress = true;
  try {
    return await fn();
  } finally {
    internalFetchInProgress = false;
  }
}
