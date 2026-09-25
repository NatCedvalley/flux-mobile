import {
  ApiError,
  endsSession,
  isTransient,
  isUnauthorizedWithoutCode,
} from './api-error';

describe('API error classification', () => {
  it.each([
    [new ApiError(401, { code: 'TOKEN_REVOKED' }), true],
    [new ApiError(401, { code: 'SESSION_EXPIRED' }), true],
    [new ApiError(403, { code: 'ACCOUNT_SUSPENDED' }), true],
    [new ApiError(423, { code: 'ACCOUNT_LOCKED' }), true],
    [new ApiError(401), false],
    [new ApiError(403, { code: 'ACCESS_DENIED' }), false],
    [new ApiError(423, { code: 'ACCOUNT_LOGIN_LOCKED' }), false],
    [new ApiError(503, { code: 'KEYCLOAK_UNAVAILABLE' }), false],
    [new Error('boom'), false],
  ])('endsSession(%o) is %s', (error, expected) => {
    expect(endsSession(error)).toBe(expected);
  });

  it.each([
    [new ApiError(401), true],
    [new ApiError(401, { code: 'TOKEN_REVOKED' }), false],
    [new ApiError(403), false],
    [new Error('boom'), false],
  ])('isUnauthorizedWithoutCode(%o) is %s', (error, expected) => {
    expect(isUnauthorizedWithoutCode(error)).toBe(expected);
  });

  it.each([
    [new ApiError(0), true],
    [new ApiError(502, { code: 'KEYCLOAK_LOGOUT_FAILED' }), true],
    [new ApiError(503, { code: 'KEYCLOAK_UNAVAILABLE' }), true],
    [new ApiError(401), false],
    [new Error('boom'), false],
  ])('isTransient(%o) is %s', (error, expected) => {
    expect(isTransient(error)).toBe(expected);
  });
});
