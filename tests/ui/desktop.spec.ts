import { readFile } from 'node:fs/promises';
import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';

interface DesktopState {
	dialogs: { defaultPath: string; title: string }[];
	writes: { path: string; data: number[] }[];
	cancel: boolean;
	writeError: string | null;
	violations: string[];
}

declare global {
	interface Window {
		__desktopTest: DesktopState;
	}
}

const backend = 'http://127.0.0.1:48787';
const token = 'desktop-test-session';
const cors = {
	'Access-Control-Allow-Origin': 'http://127.0.0.1:4173',
	'Access-Control-Expose-Headers': 'Content-Disposition',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type'
};
const device = {
	id: 'tablet',
	name: 'Paper Pro',
	host: '10.11.99.1',
	port: 22,
	username: 'root',
	autoRestart: true,
	hasPassword: true,
	status: 'connected',
	pendingRestart: false
};
const notebook = {
	id: 'notebook',
	name: 'Meeting notes',
	type: 'notebook',
	parent: '',
	pinned: false,
	pageCount: 1,
	lastModified: 0,
	lastOpened: 0,
	sizeKb: 1,
	coverPageId: null,
	tags: []
};

async function desktopApp(page: Page, native = true) {
	const config = JSON.parse(await readFile('src-tauri/tauri.conf.json', 'utf8'));
	await page.route('http://127.0.0.1:4173/**', async (route) => {
		if (route.request().resourceType() !== 'document') return route.fallback();
		const response = await route.fetch();
		await route.fulfill({
			response,
			headers: { ...response.headers(), 'Content-Security-Policy': config.app.security.csp }
		});
	});
	await page.addInitScript(
		({ backend, token, native }) => {
			localStorage.setItem('rm_active_device', '"tablet"');
			localStorage.setItem('rm_theme', '"light"');
			const state: DesktopState = {
				dialogs: [],
				writes: [],
				cancel: false,
				writeError: null,
				violations: []
			};
			window.__desktopTest = state;
			document.addEventListener('securitypolicyviolation', (event) =>
				state.violations.push(`${event.violatedDirective}: ${event.blockedURI}`)
			);
			Object.defineProperty(window, 'isTauri', { value: native });
			Object.defineProperty(window, '__TAURI_INTERNALS__', {
				value: {
					metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
					transformCallback: () => 1,
					unregisterCallback: () => {},
					invoke: async (command: string, args: any, options: any) => {
						if (command === 'backend_connection') return { url: backend, token };
						if (command === 'plugin:dialog|save') {
							state.dialogs.push(args.options);
							return state.cancel ? null : `C:\\Downloads\\${args.options.defaultPath}`;
						}
						if (command === 'plugin:fs|write_file') {
							if (state.writeError) throw state.writeError;
							state.writes.push({
								path: decodeURIComponent(options.headers.path),
								data: Array.from(args)
							});
							return;
						}
						if (command === 'plugin:event|listen') return 1;
						if (command === 'plugin:event|unlisten') return;
						if (command === 'plugin:window|is_maximized') return false;
						throw new Error(`Unexpected desktop command: ${command}`);
					}
				}
			});
			Object.defineProperty(window, '__TAURI_EVENT_PLUGIN_INTERNALS__', {
				value: { unregisterListener: () => {} }
			});
		},
		{ backend, token, native }
	);
	await page.route('**/api/**', async (route) => {
		const url = new URL(route.request().url());
		if (native) {
			expect(url.origin).toBe(backend);
			expect(url.searchParams.getAll('token')).toEqual([token]);
		}
		const headers = cors;
		if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
		if (url.pathname === '/api/events')
			return route.fulfill({ headers, contentType: 'text/event-stream', body: ': connected\n\n' });
		let data: unknown;
		if (url.pathname === '/api/devices') data = [device];
		else if (url.pathname.endsWith('/library')) data = [notebook];
		else if (url.pathname === '/api/usb') data = { reachable: true, host: '10.11.99.1' };
		else if (url.pathname.endsWith('/documents/notebook'))
			data = {
				item: notebook,
				pages: [{ id: 'page', template: 'Blank', hasLines: false, pdfPage: null }],
				orientation: 'portrait',
				currentPage: 0,
				paperSize: [1404, 1872]
			};
		else
			return route.fulfill({ status: 404, headers, json: { error: 'Unexpected tablet request' } });
		await route.fulfill({ headers, json: data });
	});
}

async function screen(page: Page) {
	let socket!: WebSocketRoute;
	await page.routeWebSocket(`${backend.replace('http:', 'ws:')}/ws/screen*`, (ws) => {
		socket = ws;
		ws.send(
			JSON.stringify({
				type: 'meta',
				width: 8,
				height: 8,
				visibleWidth: 8,
				channels: 1,
				model: 'reMarkable 2'
			})
		);
	});
	await page.goto('/screen');
	await expect(page.getByRole('button', { name: 'Save screenshot', exact: true })).toBeEnabled();
	const packet = Buffer.alloc(10);
	packet.writeUInt16LE(8, 2);
	packet.writeUInt32LE(2, 4);
	packet[8] = 64;
	packet[9] = 220;
	socket.send(packet);
	await expect(page.locator('canvas').first()).toHaveAttribute('width', '8');
}

test('desktop screenshots save PNG bytes under the packaged security policy', async ({ page }) => {
	await desktopApp(page);
	await screen(page);
	await page.getByRole('button', { name: 'Save screenshot', exact: true }).click();
	await expect.poll(() => page.evaluate(() => window.__desktopTest.writes.length)).toBe(1);
	const state = await page.evaluate(() => window.__desktopTest);
	expect(state.writes[0].data.slice(0, 8)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
	expect(state.dialogs[0].defaultPath).toMatch(/^remarkable-.+\.png$/);
	expect(state.violations).toEqual([]);
});

test('desktop page SVG export keeps its data until the native write completes', async ({
	page
}) => {
	await desktopApp(page);
	await page.goto('/doc/notebook');
	await page.getByRole('button', { name: 'Download', exact: true }).click();
	await page.getByText('This page as SVG', { exact: true }).click();
	await expect.poll(() => page.evaluate(() => window.__desktopTest.writes.length)).toBe(1);
	const state = await page.evaluate(() => window.__desktopTest);
	expect(state.dialogs[0].defaultPath).toBe('Meeting notes - page 1.svg');
	expect(Buffer.from(state.writes[0].data).toString()).toContain('<svg');
	expect(state.violations).toEqual([]);
});

async function templates(page: Page) {
	await page.route(`${backend}/api/d/tablet/templates*`, (route) =>
		route.fulfill({
			headers: cors,
			json: [
				{
					id: 'template',
					name: 'Notes / Māori: draft?',
					filename: 'template',
					categories: [],
					landscape: false,
					file: 'template'
				}
			]
		})
	);
	await page.route(`${backend}/api/d/tablet/templates/custom/template*`, (route) =>
		route.fulfill({ headers: cors, json: { name: 'Notes', items: [] } })
	);
	await page.goto('/templates');
	await page.getByText('Notes / Māori: draft?', { exact: true }).click();
	await page.getByRole('button', { name: 'Download', exact: true }).click();
}

test('desktop template exports save SVG and source with portable Unicode filenames', async ({
	page
}) => {
	await desktopApp(page);
	await templates(page);
	await page.getByText('SVG', { exact: true }).click();
	await expect.poll(() => page.evaluate(() => window.__desktopTest.writes.length)).toBe(1);
	await page.getByRole('button', { name: 'Download', exact: true }).click();
	await page.getByText('Template file', { exact: true }).click();
	await expect.poll(() => page.evaluate(() => window.__desktopTest.writes.length)).toBe(2);
	const state = await page.evaluate(() => window.__desktopTest);
	expect(state.dialogs.map((dialog) => dialog.defaultPath)).toEqual([
		'Notes _ Māori_ draft_.svg',
		'Notes _ Māori_ draft_.template'
	]);
	expect(Buffer.from(state.writes[0].data).toString()).toContain('<svg');
	expect(JSON.parse(Buffer.from(state.writes[1].data).toString()).items).toEqual([]);
	expect(state.violations).toEqual([]);
});

test('desktop recording saves WebM data and stops the captured tracks', async ({ page }) => {
	await desktopApp(page);
	await page.addInitScript(() => {
		const capture = HTMLCanvasElement.prototype.captureStream;
		const streams: MediaStream[] = [];
		Object.defineProperty(window, '__capturedStreams', { value: streams });
		HTMLCanvasElement.prototype.captureStream = function (...args) {
			const stream = capture.apply(this, args);
			streams.push(stream);
			return stream;
		};
	});
	await screen(page);
	await page.getByRole('button', { name: 'Record video', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
	await expect.poll(() => page.evaluate(() => window.__desktopTest.writes.length)).toBe(1);
	const state = await page.evaluate(() => window.__desktopTest);
	expect(state.dialogs[0].defaultPath).toMatch(/\.webm$/);
	expect(state.writes[0].data.slice(0, 4)).toEqual([26, 69, 223, 163]);
	expect(state.violations).toEqual([]);
	expect(
		await page.evaluate(() =>
			(window as any).__capturedStreams.every((stream: MediaStream) =>
				stream.getTracks().every((track) => track.readyState === 'ended')
			)
		)
	).toBe(true);
});

test('cancelling a native save performs no write and reports no success', async ({ page }) => {
	await desktopApp(page);
	await screen(page);
	await page.evaluate(() => {
		window.__desktopTest.cancel = true;
	});
	await page.getByRole('button', { name: 'Save screenshot', exact: true }).click();
	await expect.poll(() => page.evaluate(() => window.__desktopTest.dialogs.length)).toBe(1);
	expect(await page.evaluate(() => window.__desktopTest.writes)).toEqual([]);
	await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
});

test('native file errors display their message and a later save can recover', async ({ page }) => {
	await desktopApp(page);
	await screen(page);
	await page.evaluate(() => {
		window.__desktopTest.writeError = 'Access is denied';
	});
	await page.getByRole('button', { name: 'Save screenshot', exact: true }).click();
	await expect(page.getByText('Access is denied', { exact: true })).toBeVisible();
	expect(await page.evaluate(() => window.__desktopTest.writes)).toEqual([]);
	await page.evaluate(() => {
		window.__desktopTest.writeError = null;
	});
	await page.getByRole('button', { name: 'Save screenshot', exact: true }).click();
	await expect.poll(() => page.evaluate(() => window.__desktopTest.writes.length)).toBe(1);
});

for (const download of [
	{
		label: 'PDF (rendered by tablet)',
		kind: 'pdf',
		disposition: "attachment; filename*=UTF-8''M%C4%81ori%20notes.pdf",
		name: 'Māori notes.pdf',
		bytes: Buffer.from('%PDF-1.4\nexample')
	},
	{
		label: 'rmdoc archive',
		kind: 'rmdoc',
		disposition: 'attachment; filename="CON.rmdoc"',
		name: '_CON.rmdoc',
		bytes: Buffer.from([80, 75, 3, 4, 0, 1, 255])
	},
	{
		label: 'rmdoc archive',
		kind: 'rmdoc',
		disposition: 'attachment; filename="notes.rmdoc"; filename*=UTF-8\'\'bad%XX',
		name: 'notes.rmdoc',
		bytes: Buffer.from([80, 75, 3, 4])
	}
]) {
	test(`desktop remote export preserves bytes and handles ${download.name}`, async ({ page }) => {
		await desktopApp(page);
		await page.route(
			`${backend}/api/d/tablet/documents/notebook/export/${download.kind}*`,
			async (route) => {
				expect(new URL(route.request().url()).searchParams.get('token')).toBe(token);
				await route.fulfill({
					headers: { ...cors, 'Content-Disposition': download.disposition },
					body: download.bytes
				});
			}
		);
		await page.goto('/doc/notebook');
		await page.getByRole('button', { name: 'Download', exact: true }).click();
		await page.getByText(download.label, { exact: true }).click();
		await expect.poll(() => page.evaluate(() => window.__desktopTest.writes.length)).toBe(1);
		const state = await page.evaluate(() => window.__desktopTest);
		expect(state.dialogs[0].defaultPath).toBe(download.name);
		expect(state.writes[0].data).toEqual(Array.from(download.bytes));
		expect(state.violations).toEqual([]);
	});
}

for (const failure of ['network', 'tablet']) {
	test(`desktop ${failure} download failures keep the save dialog closed and show a useful error`, async ({
		page
	}) => {
		await desktopApp(page);
		await page.route(`${backend}/api/d/tablet/documents/notebook/export/pdf*`, async (route) => {
			if (failure === 'network') return route.abort('connectionrefused');
			await route.fulfill({
				status: 502,
				headers: cors,
				json: { error: 'Enable the tablet web interface before exporting PDF.' }
			});
		});
		await page.goto('/doc/notebook');
		await page.getByRole('button', { name: 'Download', exact: true }).click();
		await page.getByText('PDF (rendered by tablet)', { exact: true }).click();
		await expect(
			page.getByText(
				failure === 'network'
					? 'Could not download the file. Check the tablet connection and try again.'
					: 'Enable the tablet web interface before exporting PDF.',
				{ exact: true }
			)
		).toBeVisible();
		const state = await page.evaluate(() => window.__desktopTest);
		expect(state.dialogs).toEqual([]);
		expect(state.writes).toEqual([]);
	});
}

test('desktop file editor saves empty text and downloads the file through the authenticated backend', async ({
	page
}) => {
	await desktopApp(page);
	let contents = 'Original text';
	await page.route(`${backend}/api/d/tablet/fs?*`, (route) =>
		route.fulfill({
			headers: cors,
			json: {
				path: '/home/root',
				entries: [{ name: 'notes.txt', type: 'file', size: 13, mtime: 0, mode: 33188 }]
			}
		})
	);
	await page.route(`${backend}/api/d/tablet/fs/text?*`, async (route) => {
		const url = new URL(route.request().url());
		expect(url.searchParams.getAll('token')).toEqual([token]);
		expect(url.searchParams.get('path')).toBe('/home/root/notes.txt');
		if (route.request().method() === 'OPTIONS')
			return route.fulfill({ status: 204, headers: cors });
		if (route.request().method() === 'PUT') {
			contents = route.request().postData() ?? '';
			return route.fulfill({ status: 204, headers: cors });
		}
		await route.fulfill({ headers: cors, json: { text: contents } });
	});
	await page.route(`${backend}/api/d/tablet/fs/download?*`, async (route) => {
		expect(new URL(route.request().url()).searchParams.get('token')).toBe(token);
		await route.fulfill({
			headers: { ...cors, 'Content-Disposition': 'attachment; filename="notes.txt"' },
			contentType: 'application/octet-stream',
			body: contents
		});
	});
	await page.goto('/files/home/root');
	await page.getByText('notes.txt', { exact: true }).dblclick();
	await expect(page.locator('textarea')).toHaveValue('Original text');
	await page.locator('textarea').fill('');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	expect(contents).toBe('');
	await page.getByRole('button', { name: 'Close', exact: true }).click();
	await page.getByText('notes.txt', { exact: true }).click({ button: 'right' });
	await page.getByText('Download', { exact: true }).click();
	await expect.poll(() => page.evaluate(() => window.__desktopTest.writes.length)).toBe(1);
	const state = await page.evaluate(() => window.__desktopTest);
	expect(state.writes[0].data).toEqual([]);
	expect(state.dialogs[0].defaultPath).toBe('notes.txt');
	expect(state.violations).toEqual([]);
});

test('browser SVG downloads still produce a file', async ({ page }) => {
	await desktopApp(page, false);
	await page.goto('/doc/notebook');
	await page.getByRole('button', { name: 'Download', exact: true }).click();
	const downloaded = page.waitForEvent('download');
	await page.getByText('This page as SVG', { exact: true }).click();
	const file = await downloaded;
	expect(file.suggestedFilename()).toBe('Meeting notes - page 1.svg');
	expect(await readFile((await file.path())!, 'utf8')).toContain('<svg');
});

function blankPdf() {
	const objects = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
		'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> /Contents 4 0 R >>',
		'<< /Length 0 >>\nstream\n\nendstream'
	];
	let pdf = '%PDF-1.4\n';
	const offsets = [0];
	objects.forEach((object, index) => {
		offsets.push(Buffer.byteLength(pdf));
		pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
	});
	const xref = Buffer.byteLength(pdf);
	pdf += `xref\n0 5\n0000000000 65535 f \n${offsets
		.slice(1)
		.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
		.join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
	return Buffer.from(pdf);
}

test('desktop PDF backgrounds load through the worker and the original PDF saves intact', async ({
	page
}) => {
	await desktopApp(page);
	const pdf = blankPdf();
	await page.route(`${backend}/api/d/tablet/documents/notebook?*`, (route) =>
		route.fulfill({
			headers: cors,
			json: {
				item: { ...notebook, type: 'pdf' },
				pages: [{ id: 'page', template: null, hasLines: false, pdfPage: 0 }],
				orientation: 'portrait',
				currentPage: 0,
				paperSize: [100, 100]
			}
		})
	);
	await page.route(`${backend}/api/d/tablet/documents/notebook/file?*`, async (route) => {
		expect(new URL(route.request().url()).searchParams.get('token')).toBe(token);
		await route.fulfill({ headers: cors, contentType: 'application/pdf', body: pdf });
	});
	await page.goto('/doc/notebook');
	await expect(page.locator('svg image[href^="data:image/png"]')).toBeVisible();
	await page.getByRole('button', { name: 'Download', exact: true }).click();
	await page.getByText('Original PDF', { exact: true }).click();
	await expect.poll(() => page.evaluate(() => window.__desktopTest.writes.length)).toBe(1);
	const state = await page.evaluate(() => window.__desktopTest);
	expect(state.writes[0].data).toEqual(Array.from(pdf));
	expect(state.violations).toEqual([]);
});

test('desktop file uploads send the selected file and authenticated path', async ({ page }) => {
	await desktopApp(page);
	await page.route(`${backend}/api/d/tablet/fs?*`, (route) =>
		route.fulfill({ headers: cors, json: { path: '/home/root', entries: [] } })
	);
	let uploaded = '';
	await page.route(`${backend}/api/d/tablet/fs/upload?*`, async (route) => {
		if (route.request().method() === 'OPTIONS')
			return route.fulfill({ status: 204, headers: cors });
		const url = new URL(route.request().url());
		expect(url.searchParams.getAll('token')).toEqual([token]);
		expect(url.searchParams.get('path')).toBe('/home/root');
		uploaded = route.request().postDataBuffer()!.toString();
		await route.fulfill({ headers: cors, status: 201, json: { uploaded: ['Māori notes.txt'] } });
	});
	await page.goto('/files/home/root');
	await page.locator('input[type="file"]').setInputFiles({
		name: 'Māori notes.txt',
		mimeType: 'text/plain',
		buffer: Buffer.from('Saved on the tablet')
	});
	await expect(page.getByText('Upload complete', { exact: true })).toBeVisible();
	expect(uploaded).toContain('Māori notes.txt');
	expect(uploaded).toContain('Saved on the tablet');
	expect(await page.evaluate(() => window.__desktopTest.violations)).toEqual([]);
});
