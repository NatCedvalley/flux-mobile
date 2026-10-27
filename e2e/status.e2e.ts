import { answered, expect, signIn, test } from './fixtures';

// CI-2 is To Do, and its next status (In Progress) isn't closed, so the
// docked button moves it without the resolution sheet.
test('changes a task status and undoes it', async ({ page }) => {
  await signIn(page);
  await page.getByText('Fix the overdue report').click();
  await expect(page).toHaveURL(/\/tasks\/ci-p1\/ci-t2$/);
  const status = (name: string) =>
    page.getByRole('button', { name: `Status: ${name}. Change status` });
  await expect(status('To Do')).toBeVisible();

  const moved = answered(page, 'PATCH', '/projects/ci-p1/tasks/ci-t2/status');
  await page.getByRole('button', { name: 'Move to In Progress' }).click();
  expect((await moved).request().postDataJSON()).toEqual({
    status: 'in_progress',
  });
  await expect(status('In Progress')).toBeVisible();

  const undone = answered(page, 'PATCH', '/projects/ci-p1/tasks/ci-t2/status');
  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await undone).request().postDataJSON()).toEqual({ status: 'todo' });
  await expect(status('To Do')).toBeVisible();
});
