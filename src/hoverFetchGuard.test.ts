import { isInternalFetch, withInternalFetchGuard } from './hoverFetchGuard';

describe('hoverFetchGuard', () => {
  it('reports false when no fetch is in progress', () => {
    expect(isInternalFetch()).toBe(false);
  });

  it('reports true while the guarded function runs', async () => {
    let observedDuringRun = false;

    await withInternalFetchGuard(async () => {
      observedDuringRun = isInternalFetch();
      return 'result';
    });

    expect(observedDuringRun).toBe(true);
  });

  it('resets to false after the guarded function resolves', async () => {
    await withInternalFetchGuard(async () => 'result');
    expect(isInternalFetch()).toBe(false);
  });

  it('resets to false after the guarded function throws', async () => {
    await expect(
      withInternalFetchGuard(async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    expect(isInternalFetch()).toBe(false);
  });

  it('returns the value produced by the guarded function', async () => {
    const result = await withInternalFetchGuard(async () => 42);
    expect(result).toBe(42);
  });
});
