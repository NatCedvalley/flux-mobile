import type { Mock } from 'vitest';
import type { FluxApi } from '../api';
import { ApiError } from '../auth/api-error';
import { PushRegistration } from './push-registration';

describe('PushRegistration', () => {
  let api: {
    registerDevice: Mock<FluxApi['registerDevice']>;
    unregisterDevice: Mock<FluxApi['unregisterDevice']>;
  };
  let push: PushRegistration;

  beforeEach(() => {
    api = {
      registerDevice: vi.fn<FluxApi['registerDevice']>().mockResolvedValue(),
      unregisterDevice: vi
        .fn<FluxApi['unregisterDevice']>()
        .mockResolvedValue(),
    };
    push = new PushRegistration(api, 'ANDROID', '0.0.1');
  });

  it('registers once a token and an account are both known', async () => {
    await push.setToken('t1');
    expect(api.registerDevice).not.toHaveBeenCalled();

    await push.setAccount('u1');
    expect(api.registerDevice).toHaveBeenCalledExactlyOnceWith({
      token: 't1',
      platform: 'ANDROID',
      appVersion: '0.0.1',
    });
  });

  it('does nothing without a token', async () => {
    await push.setAccount('u1');
    expect(api.registerDevice).not.toHaveBeenCalled();
  });

  it('doesn’t register the same token and account twice', async () => {
    await push.setAccount('u1');
    await push.setToken('t1');
    await push.setToken('t1');
    await push.setAccount('u1');

    expect(api.registerDevice).toHaveBeenCalledTimes(1);
  });

  it('registers again when the token refreshes or another account signs in', async () => {
    await push.setAccount('u1');
    await push.setToken('t1');
    await push.setToken('t2');
    await push.setAccount(null);
    await push.setAccount('u2');

    expect(api.registerDevice.mock.calls.map(([d]) => d.token)).toEqual([
      't1',
      't2',
      't2',
    ]);
  });

  it('retries a failed registration on the next change', async () => {
    api.registerDevice.mockRejectedValueOnce(new ApiError(0));
    await push.setAccount('u1');
    await push.setToken('t1');
    await push.setAccount('u1');

    expect(api.registerDevice).toHaveBeenCalledTimes(2);
  });

  it('cuts the app version to the server’s 32 characters', async () => {
    push = new PushRegistration(api, 'IOS', 'x'.repeat(40));
    await push.setAccount('u1');
    await push.setToken('t1');

    expect(api.registerDevice.mock.calls[0][0].appVersion).toBe('x'.repeat(32));
  });

  describe('unregister', () => {
    it('sends the token, and registers again on the next sign-in', async () => {
      await push.setAccount('u1');
      await push.setToken('t1');

      await push.unregister();
      await push.setAccount(null);
      await push.setAccount('u1');

      expect(api.unregisterDevice).toHaveBeenCalledExactlyOnceWith('t1');
      expect(api.registerDevice).toHaveBeenCalledTimes(2);
    });

    it('does nothing without a token', async () => {
      await push.setAccount('u1');
      await push.unregister();

      expect(api.unregisterDevice).not.toHaveBeenCalled();
    });

    it.each([
      [
        'the token isn’t known',
        new ApiError(404, { code: 'DEVICE_TOKEN_NOT_FOUND' }),
      ],
      ['offline', new ApiError(0)],
    ])('never rejects when %s', async (_, error) => {
      api.unregisterDevice.mockRejectedValue(error);
      await push.setToken('t1');

      await expect(push.unregister()).resolves.toBeUndefined();
    });

    it('waits for a registration in flight', async () => {
      const order: string[] = [];
      let finish!: () => void;
      api.registerDevice.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            finish = () => {
              order.push('register');
              resolve();
            };
          })
      );
      api.unregisterDevice.mockImplementation(async () => {
        order.push('unregister');
      });
      await push.setAccount('u1');
      const registering = push.setToken('t1');
      const unregistering = push.unregister();
      await vi.waitFor(() => expect(api.registerDevice).toHaveBeenCalled());
      expect(order).toEqual([]);
      finish();

      await Promise.all([registering, unregistering]);
      expect(order).toEqual(['register', 'unregister']);
    });
  });
});
