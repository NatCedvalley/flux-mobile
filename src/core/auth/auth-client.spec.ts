import { ApiError } from './api-error';
import { AuthClient } from './auth-client';

const BASE_URL = 'http://iam.test/api/v1';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('AuthClient', () => {
  it('logs in with rememberMe always set', async () => {
    const tokens = { accessToken: 'a', refreshToken: 'r', expiresIn: 300 };
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, tokens));
    const client = new AuthClient(BASE_URL, fetchFn);

    await expect(client.login('me@flux.test', 'secret')).resolves.toEqual(
      tokens
    );

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/auth/login`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      email: 'me@flux.test',
      password: 'secret',
      rememberMe: true,
    });
  });

  it('refreshes with the refresh token', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    await new AuthClient(BASE_URL, fetchFn).refresh('r1');

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/auth/refresh`);
    expect(JSON.parse(init.body)).toEqual({ refreshToken: 'r1' });
  });

  it('loads the account with a Bearer token', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { email: 'me@flux.test' }));
    const account = await new AuthClient(BASE_URL, fetchFn).getMe('a1');

    expect(account.email).toBe('me@flux.test');
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/accounts/me`);
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer a1');
    expect(init.body).toBeUndefined();
  });

  it("surfaces the server's code and message", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse(422, {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      })
    );
    const error = await new AuthClient(BASE_URL, fetchFn)
      .login('me@flux.test', 'wrong')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 422,
      message: 'Invalid email or password.',
      body: { code: 'INVALID_CREDENTIALS' },
    });
  });

  it('tolerates an error response with no body', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 401 }));
    const error = await new AuthClient(BASE_URL, fetchFn)
      .getMe('expired')
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 401, body: {} });
  });

  it('reports a network failure as status 0', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await new AuthClient(BASE_URL, fetchFn)
      .login('me@flux.test', 'secret')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, body: {} });
  });

  it('reports a timeout as status 0', async () => {
    const fetchFn = vi.fn().mockReturnValue(new Promise(() => undefined));
    const error = await new AuthClient(BASE_URL, fetchFn, 5)
      .login('me@flux.test', 'secret')
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 0 });
  });
});
