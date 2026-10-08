import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const requiredExecutables = [
	'AppRun',
	'AppRun.wrapped',
	'usr/bin/remarkable-webui',
	'usr/bin/remarkable-node'
];

export function parseSquashfsListing(listing) {
	const entries = new Map();
	for (const line of listing.split('\n').filter((line) => line.trim())) {
		const match = line.match(
			/^([-dl][r-][w-][xsS-][r-][w-][xsS-][r-][w-][xtT-])\s+\d+\/\d+\s+\d+\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?\s+(squashfs-root(?:\/.*)?)$/
		);
		if (!match) throw new Error(`Invalid SquashFS listing: ${line}`);
		const [, mode, description] = match;
		const separator = mode[0] === 'l' ? description.indexOf(' -> ') : -1;
		if (mode[0] === 'l' && (separator < 0 || separator + 4 === description.length))
			throw new Error(`Missing symlink target: ${description}`);
		const filename = separator < 0 ? description : description.slice(0, separator);
		const name = filename === 'squashfs-root' ? '.' : filename.slice('squashfs-root/'.length);
		if (
			path.posix.normalize(name) !== name ||
			path.posix.isAbsolute(name) ||
			name === '..' ||
			name.startsWith('../') ||
			entries.has(name)
		) {
			throw new Error(`Invalid or duplicate SquashFS path: ${name}`);
		}
		entries.set(name, {
			mode,
			target: separator < 0 ? undefined : description.slice(separator + 4)
		});
	}
	if (entries.get('.')?.mode[0] !== 'd') throw new Error('Missing SquashFS root directory');
	return entries;
}

export function checkSquashfsPermissions(listing) {
	const entries = parseSquashfsListing(listing);
	for (const [name, { mode }] of entries) {
		if (mode[0] === 'l') continue;
		if (mode[7] !== 'r') throw new Error(`${name}: ${mode} is not readable by other users`);
		if (
			(mode[0] === 'd' || /[xs]/.test(mode[3]) || /[xs]/.test(mode[6])) &&
			!/[xt]/.test(mode[9])
		) {
			throw new Error(`${name}: ${mode} is not executable by other users`);
		}
	}
	for (const executable of requiredExecutables) {
		let name = executable;
		const visited = new Set();
		while (entries.get(name)?.mode[0] === 'l') {
			if (visited.has(name)) throw new Error(`Symlink cycle for ${executable}`);
			visited.add(name);
			const { target } = entries.get(name);
			if (!target || path.posix.isAbsolute(target)) {
				throw new Error(`Invalid symlink target for ${executable}`);
			}
			name = path.posix.join(path.posix.dirname(name), target);
			if (name === '..' || name.startsWith('../')) {
				throw new Error(`Symlink escapes AppImage: ${executable}`);
			}
		}
		const mode = entries.get(name)?.mode;
		if (!mode || mode[0] !== '-' || !/[xt]/.test(mode[9])) {
			throw new Error(`Missing or non-executable AppImage entry: ${executable}`);
		}
	}
	return entries.size;
}

export function checkAppImage(filename) {
	const executable = path.resolve(filename);
	const options = {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		timeout: 60000,
		maxBuffer: 16 * 1024 * 1024,
		env: { ...process.env, LC_ALL: 'C' }
	};
	const offset = execFileSync(executable, ['--appimage-offset'], options).trim();
	if (!/^\d+$/.test(offset) || !Number.isSafeInteger(Number(offset)) || Number(offset) <= 0) {
		throw new Error('AppImage runtime returned an invalid SquashFS offset');
	}
	const listing = execFileSync('unsquashfs', ['-lln', '-o', offset, executable], options);
	return checkSquashfsPermissions(listing);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	try {
		if (process.argv.length !== 3)
			throw new Error('Usage: node tools/check-appimage.mjs <AppImage>');
		const count = checkAppImage(process.argv[2]);
		console.log(`AppImage: stored SquashFS permissions passed for ${count} entries.`);
	} catch (error) {
		console.error(`AppImage check failed: ${error.message}`);
		process.exitCode = 1;
	}
}
