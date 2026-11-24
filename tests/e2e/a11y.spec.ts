import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

type Theme = 'light' | 'dark';

async function seedSamples(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample deck' }).click();
  await expect(page).toHaveURL(/#\/folder\//);
}

async function setTheme(page: Page, theme: Theme) {
  await page.goto('/#/settings');
  await page.getByLabel('Theme').selectOption(theme);
  await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/);
}

async function expectNoSeriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const report = (list: typeof violations) => list.map((v) => `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
  // Moderate and minor findings are surfaced in the test output without failing the run.
  test.info().annotations.push(...report(violations.filter((v) => !blocking.includes(v))).map((description) => ({ type: 'axe-nonblocking', description })));
  expect(report(blocking)).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await seedSamples(page);
      await setTheme(page, theme);
    });

    test('library has no serious or critical axe violations', async ({ page }) => {
      await page.goto('/#/');
      await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
      await expect(page.getByRole('tree').or(page.getByRole('list', { name: 'Folders and decks' })).first()).toBeVisible();
      await expectNoSeriousViolations(page);
    });

    test('learn study screen has no serious or critical axe violations', async ({ page }) => {
      await page.goto('/#/');
      await page.getByRole('link', { name: /Sample/ }).first().click();
      await page.getByRole('link', { name: /JavaScript/ }).click();
      await page.getByRole('main').getByRole('link', { name: 'Study', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Show answer' })).toBeVisible();
      await expectNoSeriousViolations(page);
      await page.getByRole('button', { name: 'Show answer' }).click();
      await expect(page.getByRole('group', { name: 'Rate your answer' })).toBeVisible();
      await expectNoSeriousViolations(page);
    });

    test('settings has no serious or critical axe violations', async ({ page }) => {
      await page.goto('/#/settings');
      await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
      await expectNoSeriousViolations(page);
    });
  });
}
