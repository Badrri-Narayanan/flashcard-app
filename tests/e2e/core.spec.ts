import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const LIST = 'hola - hello\nadios - goodbye\ngracias - thank you';

async function createDeckWithCards(page: Page, folder = 'Spanish', deck = 'Basics') {
  await page.goto('/');
  await page.getByRole('button', { name: 'New folder' }).click();
  await page.getByLabel('Name').fill(folder);
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('link', { name: new RegExp(folder) }).click();
  await page.getByRole('button', { name: 'New deck' }).click();
  await page.getByLabel('Name').fill(deck);
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('link', { name: new RegExp(deck) }).click();
  await page.getByRole('link', { name: 'Paste a list' }).click();
  await page.getByLabel('Your list').fill(LIST);
  await page.getByRole('button', { name: 'Create 3 cards' }).click();
  await expect(page.getByText('Created 3 cards')).toBeVisible();
}

test('folder, deck, bulk paste, learn session summary', async ({ page }) => {
  await createDeckWithCards(page);
  await page.getByRole('link', { name: 'View deck' }).click();
  await page.getByRole('main').getByRole('link', { name: 'Study', exact: true }).click();
  // Good on a new card enters a learning step, so each card comes back once before it graduates.
  const summary = page.getByRole('heading', { name: 'Session complete' });
  const show = page.getByRole('button', { name: 'Show answer' });
  for (;;) {
    await expect(summary.or(show)).toBeVisible();
    if (await summary.isVisible()) break;
    await show.click();
    await page.getByRole('button', { name: /^Good/ }).click();
  }
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await expect(page.getByText('Cards studied').locator('xpath=following-sibling::dd')).toHaveText('3');
});

test('export JSON, reset, import JSON restores deck and cards', async ({ page }, testInfo) => {
  await createDeckWithCards(page);
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Export…' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON backup' }).click();
  const file = testInfo.outputPath('backup.json');
  await (await download).saveAs(file);
  expect(JSON.parse(await readFile(file, 'utf8'))).toBeTruthy();

  await page.goto('/#/settings');
  await page.getByRole('button', { name: 'Reset app…' }).click();
  await page.getByLabel('Type RESET to confirm').fill('RESET');
  await page.getByRole('button', { name: 'Reset everything' }).click();
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();

  await page.goto('/#/import');
  await page.getByRole('button', { name: 'Backup file' }).click();
  await page.getByLabel('Backup JSON file').setInputFiles(file);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByText(/Added \d+/)).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  await page.goto('/#/');
  await page.getByRole('link', { name: /Spanish/ }).click();
  await page.getByRole('link', { name: /Basics/ }).click();
  await expect(page.getByText('3 cards')).toBeVisible();
  await expect(page.getByText('hola')).toBeVisible();
});

test('share link opens in a new context and adds to library', async ({ page, browser, baseURL }) => {
  await createDeckWithCards(page);
  await page.goto('/#/');
  await page.getByRole('link', { name: /Spanish/ }).click();
  await page.getByRole('button', { name: 'More actions for Basics' }).click();
  await page.getByRole('button', { name: 'Share…' }).click();
  const url = await page.getByRole('textbox', { name: 'Share link' }).inputValue();
  expect(url).toContain('#/share/');

  const context = await browser.newContext(
    baseURL ? { baseURL, viewport: page.viewportSize() ?? undefined } : undefined,
  );
  const other = await context.newPage();
  await other.goto(url);
  await expect(other.getByRole('heading', { name: /Basics/ })).toBeVisible();
  await other.getByRole('button', { name: 'Add to my library' }).click();
  await other.getByRole('button', { name: 'Top level' }).click();
  await expect(other.getByText(/Added/)).toBeVisible();
  await other.getByRole('link', { name: 'Open deck' }).click();
  await expect(other.getByText('3 cards')).toBeVisible();
  await context.close();
});

test('settings: dark theme and Hyperlegible persist after reload', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByLabel('Theme').selectOption('dark');
  await page.getByRole('combobox', { name: /^Font/ }).selectOption('hyperlegible');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByLabel('Theme')).toHaveValue('dark');
  await expect(page.getByRole('combobox', { name: /^Font/ })).toHaveValue('hyperlegible');
  await expect(page.getByTestId('font-sample')).toHaveCSS('font-family', /Atkinson Hyperlegible/);
});

test('offline: library renders after reload with the network off', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  // The worker does not claim clients on first install, so reload once to be controlled.
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
});
