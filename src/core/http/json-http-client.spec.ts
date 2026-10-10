import { ApiError } from '../auth/api-error';
import { JsonHttpClient } from './json-http-client';

const BASE_URL = 'http://api.test/api/v1';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('JsonHttpClient', () => {
  it('GETs a path under the base URL and parses the JSON', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: 't1' }));
    const client = new JsonHttpClient(BASE_URL, fetchFn);

    await expect(client.request('GET', '/tasks/t1')).resolves.toEqual({
      id: 't1',
    });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/tasks/t1`);
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual({ Accept: 'application/json' });
    expect(init.body).toBeUndefined();
  });

  it('sends a JSON body and a Bearer token', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    await new JsonHttpClient(BASE_URL, fetchFn).request('POST', '/things', {
      accessToken: 'a1',
      body: { name: 'x' },
    });

    const [, init] = fetchFn.mock.calls[0];
    expect(init.headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer a1',
    });
    expect(JSON.parse(init.body)).toEqual({ name: 'x' });
  });

  it('sends FormData as it is, leaving its Content-Type to fetch', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(201, {}));
    const form = new FormData();
    form.append('file', new Blob(['x']), 'a.txt');
    await new JsonHttpClient(BASE_URL, fetchFn).request('POST', '/files', {
      accessToken: 'a1',
      body: form,
    });

    const [, init] = fetchFn.mock.calls[0];
    expect(init.headers).toEqual({
      Accept: 'application/json',
      Authorization: 'Bearer a1',
    });
    expect(init.body).toBe(form);
  });

  it('encodes the query string and leaves out undefined values', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    await new JsonHttpClient(BASE_URL, fetchFn).request('GET', '/tasks', {
      query: {
        scope: 'assigned',
        openOnly: true,
        size: 100,
        search: 'a&b c',
        dueDateTo: undefined,
      },
    });

    expect(fetchFn.mock.calls[0][0]).toBe(
      `${BASE_URL}/tasks?scope=assigned&openOnly=true&size=100&search=a%26b+c`
    );
  });

  it('adds no "?" when every query value is undefined', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    await new JsonHttpClient(BASE_URL, fetchFn).request('GET', '/tasks', {
      query: { page: undefined },
    });

    expect(fetchFn.mock.calls[0][0]).toBe(`${BASE_URL}/tasks`);
  });

  it('resolves to null for an empty or non-JSON success body', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const client = new JsonHttpClient(BASE_URL, fetchFn);

    await expect(client.request('POST', '/a')).resolves.toBeNull();
    await expect(client.request('GET', '/b')).resolves.toBeNull();
  });

  it("surfaces the server's status, code and message", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(400, { code: 'INVALID_SORT_FIELD', message: 'Bad sort.' })
      );
    const error = await new JsonHttpClient(BASE_URL, fetchFn)
      .request('GET', '/tasks')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      message: 'Bad sort.',
      body: { code: 'INVALID_SORT_FIELD' },
    });
  });

  it('tolerates an error response with no body', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 503 }));
    const error = await new JsonHttpClient(BASE_URL, fetchFn)
      .request('GET', '/tasks')
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 503, body: {} });
  });

  it('reports a network failure as status 0', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await new JsonHttpClient(BASE_URL, fetchFn)
      .request('GET', '/tasks')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, body: {} });
  });

  it('reports a timeout as status 0', async () => {
    const fetchFn = vi.fn().mockReturnValue(new Promise(() => undefined));
    const error = await new JsonHttpClient(BASE_URL, fetchFn, 5)
      .request('GET', '/tasks')
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 0 });
  });

  it("lets a request's timeout replace the client's", async () => {
    const fetchFn = vi.fn().mockReturnValue(new Promise(() => undefined));
    const error = await new JsonHttpClient(BASE_URL, fetchFn, 60_000)
      .request('GET', '/tasks', { timeoutMs: 5 })
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 0 });
  });
});
