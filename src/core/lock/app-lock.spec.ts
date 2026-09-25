import { AppLock, LOCK_TIMEOUT_MS } from './app-lock';

describe('AppLock', () => {
  let clock: number;
  let lock: AppLock;

  beforeEach(() => {
    clock = 1_800_000_000_000;
    lock = new AppLock(() => clock);
  });

  function awayFor(ms: number): void {
    lock.background();
    clock += ms;
    lock.foreground();
  }

  it('starts disabled and unlocked', () => {
    expect(lock.state).toEqual({ enabled: false, locked: false });
  });

  it('never locks while disabled', () => {
    lock.lock();
    awayFor(LOCK_TIMEOUT_MS * 2);

    expect(lock.state.locked).toBe(false);
  });

  it('locks on a cold start when enabled', () => {
    lock.setEnabled(true);
    lock.lock();

    expect(lock.state.locked).toBe(true);
  });

  it('stays unlocked after a short trip to the background', () => {
    lock.setEnabled(true);
    awayFor(LOCK_TIMEOUT_MS - 1);

    expect(lock.state.locked).toBe(false);
  });

  it('locks once the app has been away for the timeout', () => {
    lock.setEnabled(true);
    awayFor(LOCK_TIMEOUT_MS);

    expect(lock.state.locked).toBe(true);
  });

  it('ignores a resume with no matching background', () => {
    lock.setEnabled(true);
    clock += LOCK_TIMEOUT_MS;
    lock.foreground();

    expect(lock.state.locked).toBe(false);
  });

  it('does not count a background from before the lock was enabled', () => {
    lock.background();
    lock.setEnabled(true);
    clock += LOCK_TIMEOUT_MS;
    lock.foreground();

    expect(lock.state.locked).toBe(false);
  });

  it('unlocks', () => {
    lock.setEnabled(true);
    lock.lock();
    lock.unlock();

    expect(lock.state.locked).toBe(false);
  });

  it('unlocks when disabled', () => {
    lock.setEnabled(true);
    lock.lock();
    lock.setEnabled(false);

    expect(lock.state).toEqual({ enabled: false, locked: false });
  });

  it('notifies listeners of changes until unsubscribed', () => {
    const listener = vi.fn();
    const unsubscribe = lock.onChange(listener);

    lock.setEnabled(true);
    lock.lock();
    unsubscribe();
    lock.unlock();

    expect(listener.mock.calls).toEqual([
      [{ enabled: true, locked: false }],
      [{ enabled: true, locked: true }],
    ]);
  });
});
