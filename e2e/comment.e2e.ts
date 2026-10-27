import { answered, expect, signIn, test } from './fixtures';

test('posts a comment', async ({ page }) => {
  await signIn(page);
  await page.getByText('Check the swipe-back gesture').click();
  await expect(page).toHaveURL(/\/tasks\/ci-p1\/ci-t1$/);

  // CI-1 has two threads, one with a reply. The tab reads "Comments , 3".
  const commentsTab = (count: number) =>
    page.getByRole('tab', { name: new RegExp(`^Comments\\W+${count}$`) });
  await commentsTab(3).click();
  const composer = page.getByRole('textbox', { name: 'Comment' });
  await composer.fill('Checked on the Pixel too.');

  const posted = answered(page, 'POST', '/projects/ci-p1/tasks/ci-t1/comments');
  await page.getByRole('button', { name: 'Send' }).click();
  expect((await posted).status()).toBe(201);
  await expect(composer).toHaveValue('');
  // The thread is the content; the composer is in the footer.
  await expect(
    page.getByRole('main').getByText('Checked on the Pixel too.')
  ).toBeVisible();
  await expect(commentsTab(4)).toBeVisible();
});
