import { expect, signIn, test } from './fixtures';

test('signs in to My Work', async ({ page }) => {
  await signIn(page);

  await expect(page.getByText('Check the swipe-back gesture')).toBeVisible();
  await expect(page.getByText('Fix the overdue report')).toBeVisible();
  await expect(page.getByText('Plan the next release')).toBeVisible();
});
