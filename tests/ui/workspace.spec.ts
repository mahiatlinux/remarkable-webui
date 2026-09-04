import { expect, test, type Page } from '@playwright/test';

async function mockTablet(page: Page, connected = true, theme: 'light' | 'dark' = 'light') {
	const device = {
		id: 'tablet',
		name: 'Paper Pro',
		host: '10.11.99.1',
		port: 22,
		username: 'root',
		autoRestart: true,
		hasPassword: true,
		status: 'connected',
		model: 'reMarkable Paper Pro'
	};
	const names = [
		'Reading',
		'Work',
		'Weekly notes',
		'Design sketches',
		'Field journal',
		'Project brief',
		'Ideas',
		'Reading notes'
	];
	const items = names.map((name, index) => ({
		id: `item-${index}`,
		name,
		type: index < 2 ? 'folder' : index === 5 ? 'pdf' : 'notebook',
		parent: '',
		pinned: index === 2,
		pageCount: 12 + index,
		lastModified: Date.now() - index * 86400000,
		lastOpened: Date.now(),
		sizeKb: 120,
		coverPageId: null,
		tags: []
	}));
	await page.addInitScript(
		({ connected, theme }) => {
			localStorage.setItem('rm_theme', JSON.stringify(theme));
			if (connected) localStorage.setItem('rm_active_device', '"tablet"');
		},
		{ connected, theme }
	);
	await page.route('**/api/**', async (route) => {
		const url = new URL(route.request().url());
		if (url.pathname === '/api/events')
			return route.fulfill({
				status: 200,
				contentType: 'text/event-stream',
				body: ': connected\n\n'
			});
		const data =
			url.pathname === '/api/devices'
				? connected
					? [device]
					: []
				: url.pathname.endsWith('/library')
					? items
					: url.pathname === '/api/usb'
						? { reachable: false, host: '10.11.99.1' }
						: {};
		await route.fulfill({ json: data });
	});
}

test('toolbar sidebar toggle persists and returns keyboard focus safely', async ({ page }) => {
	await mockTablet(page);
	await page.goto('/library');
	await expect(page.locator('.library-card')).toHaveCount(8);
	await page.getByRole('button', { name: 'Hide sidebar', exact: true }).click();
	await expect(page.locator('#app-sidebar')).toHaveAttribute('inert', '');
	await page.reload();
	await expect(page.getByRole('button', { name: 'Show sidebar', exact: true })).toBeVisible();
	await page.keyboard.press('Control+\\');
	await expect(page.locator('#app-sidebar')).not.toHaveAttribute('inert');
	await expect(page.locator('.library-card')).toHaveCount(8);
	await expect(page.locator('#app-sidebar')).toHaveCSS('width', '220px');
	await page.screenshot({ path: 'test-results/library-light.png' });
});

test('library selection, context menus and list view survive refactoring', async ({ page }) => {
	await mockTablet(page);
	await page.goto('/library');
	await page.locator('[data-item-id="item-2"]').click();
	await page.locator('[data-item-id="item-3"]').click({ modifiers: ['Control'] });
	await expect(page.getByText('2 selected', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'List view', exact: true }).click();
	await expect(page.locator('.library-row')).toHaveCount(8);
	await page.locator('[data-item-id="item-2"]').click({ button: 'right' });
	await expect(page.getByText('Move to…', { exact: true })).toBeVisible();
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Settings', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Appearance', exact: true })).toBeVisible();
});

test('tablet identity stays in the sidebar and its toggle respects reduced motion', async ({
	page
}) => {
	await mockTablet(page);
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/library');
	await expect(
		page.locator('#app-sidebar').getByRole('button', { name: 'Paper Pro', exact: true })
	).toBeVisible();
	await expect(page.locator('.titlebar')).not.toContainText('Paper Pro');
	await expect(page.locator('.titlebar .status-dot')).toHaveCount(0);
	await expect(page.locator('.titlebar')).toHaveCSS('height', '40px');
	const toggle = page.getByRole('button', { name: 'Hide sidebar', exact: true });
	await expect(toggle.locator('.sidebar-toggle-rail')).toHaveCSS('transition-duration', '0s');
	await toggle.click();
	await expect(page.getByRole('button', { name: 'Show sidebar', exact: true })).toHaveAttribute(
		'aria-expanded',
		'false'
	);
});

test('device setup fits the window and uses local fonts', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await mockTablet(page, false);
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Connect your reMarkable' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Add and connect' })).toBeVisible();
	await page.screenshot({ path: 'test-results/devices-light.png' });
	await page.setViewportSize({ width: 680, height: 640 });
	await page.getByRole('button', { name: 'Hide sidebar', exact: true }).click();
	await expect(page.getByLabel('Host', { exact: true })).toBeVisible();
	expect(errors).toEqual([]);
});

test('device selector is compact and its menu closes cleanly', async ({ page }) => {
	await mockTablet(page, true, 'dark');
	await page.goto('/library');
	await expect(page.locator('.library-card')).toHaveCount(8);
	const selector = page.locator('.device-switcher-trigger');
	await expect(selector).toHaveCSS('height', '30px');
	await expect(selector).toHaveCSS('border-top-width', '0px');
	await selector.click();
	const menu = page.locator('#device-switcher-menu');
	await expect(selector).toHaveAttribute('aria-expanded', 'true');
	await expect(menu).toHaveAttribute('data-ready', 'true');
	await expect(menu).toHaveCSS('opacity', '1');
	await expect(menu.locator('.menu-row').first()).toHaveCSS('border-radius', '7px');
	await expect(menu.locator('.app-divider')).toHaveCount(0);
	await expect(menu.getByRole('button', { name: 'Paper Pro', exact: true })).toBeVisible();
	expect((await menu.boundingBox())?.width).toBe((await selector.boundingBox())?.width);
	await page.screenshot({ path: 'test-results/device-selector-dark.png' });
	await page.keyboard.press('Escape');
	await expect(menu).toHaveCount(0);
	await expect(selector).toBeFocused();
	await expect(selector).toHaveAttribute('aria-expanded', 'false');
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await selector.press('Enter');
	await expect(menu).toHaveCSS('transition-duration', '0s');
	await menu.getByRole('button', { name: 'Manage devices' }).click();
	await expect(page).toHaveURL('/devices');
	await expect(menu).toHaveCount(0);
});

test('first screen waits for fonts on a cold load', async ({ page }) => {
	await mockTablet(page, false);
	let releaseFonts!: () => void;
	const pending = new Promise<void>((resolve) => {
		releaseFonts = resolve;
	});
	await page.route('**/*.woff2', async (route) => {
		await pending;
		await route.continue();
	});
	await page.goto('/', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.app-shell')).toHaveCount(0);
	releaseFonts();
	await expect(page.getByRole('heading', { name: 'Connect your reMarkable' })).toBeVisible();
	expect(await page.evaluate(() => document.fonts.check('550 14px "Manrope Variable"'))).toBe(true);
	expect(await page.evaluate(() => document.fonts.status)).toBe('loaded');
});
