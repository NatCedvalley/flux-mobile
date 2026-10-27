import { answered, expect, signIn, test } from './fixtures';

test('creates a task', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'New task' }).click();
  await page
    .getByRole('textbox', { name: 'Title' })
    .fill('Write the e2e tests');

  const created = answered(page, 'POST', '/projects/ci-p1/tasks');
  await page.getByRole('button', { name: 'Create' }).click();
  expect((await created).request().postDataJSON()).toMatchObject({
    title: 'Write the e2e tests',
  });

  await expect(page.getByText('CI-4 created')).toBeVisible();
  await page.getByRole('button', { name: 'Open' }).click();
  await expect(page).toHaveURL(/\/tasks\/ci-p1\/ci-t4$/);
  await expect(
    page.getByRole('heading', { name: 'Write the e2e tests' })
  ).toBeVisible();
});
