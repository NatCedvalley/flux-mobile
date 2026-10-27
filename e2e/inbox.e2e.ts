import { answered, expect, signIn, test } from './fixtures';

test('opens a notification, which marks it read', async ({ page }) => {
  await signIn(page);
  const inboxTab = (unread: number) =>
    page.getByRole('tab', { name: `Inbox ${unread} unread` });
  await inboxTab(2).click();
  await expect(page).toHaveURL(/\/tabs\/inbox$/);

  // Jae's assignment of CI-2, unread.
  const row = page.getByRole('button', { name: /Jae Doyle assigned you to/ });
  await expect(row).toHaveAccessibleName(/^Unread, Jae Doyle/);

  const read = answered(page, 'PATCH', '/notifications/ci-n2/read');
  await row.click();
  expect((await read).status()).toBe(200);
  await expect(page).toHaveURL(/\/tabs\/inbox\/tasks\/ci-p1\/ci-t2$/);
  await expect(
    page.getByRole('heading', { name: 'Fix the overdue report' })
  ).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/tabs\/inbox$/);
  await expect(row).toHaveAccessibleName(/^Jae Doyle/);
  await expect(inboxTab(1)).toBeVisible();
});
