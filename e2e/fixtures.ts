import { expect, type Page, test as base } from '@playwright/test';

/** Puts the mock's fixtures back before each test (scripts/ci/mock-operations.mjs). */
export const test = base.extend<{ resetMock: void }>({
  resetMock: [
    async ({ request }, use) => {
      const reset = await request.post('http://localhost:9003/__mock/reset');
      expect(reset.status()).toBe(204);
      await use();
    },
    { auto: true },
  ],
});

export { expect };

/**
 * Signs in as the mock's test account (any credentials work) and waits for
 * My Work. The web session is in memory, so every test signs in.
 */
export async function signIn(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Email').fill('ci@flux.test');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/tabs\/my-work$/);
}

/** Waits for a request to the mock flux-operations API to be answered. */
export function answered(
  page: Page,
  method: string,
  path: string
): ReturnType<Page['waitForResponse']> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === method &&
      new URL(response.url()).pathname === `/api/v1${path}`
  );
}
