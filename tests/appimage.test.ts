import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSquashfsPermissions, parseSquashfsListing } from '../tools/check-appimage.mjs';

const entry = (mode: string, name: string) =>
	`${mode} 1000/1000 123 2026-09-26 07:56 squashfs-root${name ? `/${name}` : ''}`;
const valid = [
	entry('drwxr-xr-x', ''),
	entry('-rwxr-xr-x', 'AppRun'),
	entry('-rwxr-xr-x', 'AppRun.wrapped'),
	entry('drwxr-xr-x', 'usr'),
	entry('drwxr-xr-x', 'usr/bin'),
	entry('-rwxr-xr-x', 'usr/bin/remarkable-webui'),
	entry('-rwxr-xr-x', 'usr/bin/remarkable-node'),
	entry('-rw-r--r--', 'resource with spaces.txt')
].join('\n');

test('AppImage accepts public permissions and preserves paths with spaces', () => {
	assert.equal(checkSquashfsPermissions(valid), 8);
	assert.equal(parseSquashfsListing(valid).get('resource with spaces.txt')?.mode, '-rw-r--r--');
});

test('AppImage rejects the released AppRun.wrapped 0770 regression', () => {
	const listing = valid.replace(
		entry('-rwxr-xr-x', 'AppRun.wrapped'),
		entry('-rwxrwx---', 'AppRun.wrapped')
	);
	assert.throws(() => checkSquashfsPermissions(listing), /AppRun\.wrapped:.*not readable/);
});

test('AppImage rejects restricted resources, executables and directories', () => {
	for (const [name, before, after, error] of [
		['resource with spaces.txt', '-rw-r--r--', '-rw-r-----', /not readable/],
		['usr/bin/remarkable-node', '-rwxr-xr-x', '-rwxr-xr--', /not executable/],
		['usr', 'drwxr-xr-x', 'drwxr-x--x', /not readable/],
		['usr/bin', 'drwxr-xr-x', 'drwxr-xr--', /not executable/]
	] as const) {
		assert.throws(
			() => checkSquashfsPermissions(valid.replace(entry(before, name), entry(after, name))),
			error
		);
	}
});

test('AppImage resolves executable symlinks with spaces and checks their stored targets', () => {
	const listing = valid.replace(
		entry('-rwxr-xr-x', 'AppRun'),
		entry('lrwxrwxrwx', 'AppRun -> usr/bin/launcher with spaces')
	);
	assert.equal(
		checkSquashfsPermissions(`${listing}\n${entry('-rwxr-xr-x', 'usr/bin/launcher with spaces')}`),
		9
	);
	assert.throws(() => checkSquashfsPermissions(listing), /Missing or non-executable.*AppRun/);
	assert.throws(
		() =>
			checkSquashfsPermissions(
				`${listing}\n${entry('-rwxrwx---', 'usr/bin/launcher with spaces')}`
			),
		/launcher with spaces:.*not readable/
	);
});

test('AppImage rejects missing or non-executable required launchers', () => {
	for (const name of [
		'AppRun',
		'AppRun.wrapped',
		'usr/bin/remarkable-webui',
		'usr/bin/remarkable-node'
	]) {
		assert.throws(
			() => checkSquashfsPermissions(valid.replace(entry('-rwxr-xr-x', name), '')),
			/Missing or non-executable/
		);
		assert.throws(
			() =>
				checkSquashfsPermissions(
					valid.replace(entry('-rwxr-xr-x', name), entry('-rw-r--r--', name))
				),
			/Missing or non-executable/
		);
	}
});

test('AppImage rejects malformed, empty and duplicate listings', () => {
	for (const listing of ['', 'unsquashfs failed', 'drwxr-xr-x broken', `${valid}\ninvalid`]) {
		assert.throws(() => checkSquashfsPermissions(listing), /Invalid SquashFS|Missing SquashFS/);
	}
	assert.throws(
		() => checkSquashfsPermissions(`${valid}\n${entry('-rwxr-xr-x', 'AppRun')}`),
		/duplicate/
	);
});

test('AppImage rejects cyclic or escaping executable symlinks', () => {
	for (const target of ['AppRun', '../outside', '/usr/bin/false']) {
		const listing = valid.replace(
			entry('-rwxr-xr-x', 'AppRun'),
			entry('lrwxrwxrwx', `AppRun -> ${target}`)
		);
		assert.throws(
			() => checkSquashfsPermissions(listing),
			/Symlink cycle|Symlink escapes|Invalid symlink/
		);
	}
});

test(
	'AppImage smoke reports spawn failures and early exits without leaking profiles',
	{ skip: process.platform !== 'linux' },
	async () => {
		const directory = await mkdtemp(path.join(tmpdir(), 'appimage-smoke-test-'));
		try {
			await writeFile(path.join(directory, 'xwininfo'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
			const exits = path.join(directory, 'exits.AppImage');
			const token = randomUUID();
			await writeFile(exits, `#!/bin/sh\nprintf 'startup diagnostic ${token}\\n' >&2\nexit 9\n`, {
				mode: 0o755
			});
			for (const [filename, message] of [
				[path.join(directory, 'missing.AppImage'), /failed to launch:.*ENOENT/],
				[exits, /exited during startup \(9\)/]
			] as const) {
				const result = spawnSync(
					process.execPath,
					[fileURLToPath(new URL('../tools/smoke-appimage.mjs', import.meta.url)), filename],
					{
						env: {
							...process.env,
							PATH: `${directory}:${process.env.PATH}`,
							TMPDIR: directory,
							DISPLAY: ':1234',
							DBUS_SESSION_BUS_ADDRESS: 'unix:path=/unused'
						},
						encoding: 'utf8',
						timeout: 10000
					}
				);
				assert.equal(result.error, undefined);
				assert.equal(result.status, 1);
				assert.match(result.stderr, message);
				assert.ok(!result.stderr.includes(token));
				if (filename === exits) assert.match(result.stderr, /startup diagnostic \[redacted\]/);
				assert.equal(
					(await readdir(directory)).some((name) => name.startsWith('remarkable-appimage-smoke-')),
					false
				);
			}
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	}
);
