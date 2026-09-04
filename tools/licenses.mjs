import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function packageNotices(directory, label, licenseFile) {
	let entries;
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch (error) {
		if (error.code === 'ENOENT') return '';
		throw error;
	}
	const files = entries
		.filter(
			(entry) => entry.isFile() && /^(licen[cs]e|copying|notice|ofl)([._-]|$)/i.test(entry.name)
		)
		.map((entry) => path.join(directory, entry.name));
	if (licenseFile) files.push(path.resolve(directory, licenseFile));
	if (!files.length) {
		const readme = entries.find((entry) => entry.isFile() && /^readme([._-]|$)/i.test(entry.name));
		if (readme) files.push(path.join(directory, readme.name));
	}
	const texts = await Promise.all([...new Set(files)].sort().map((file) => readFile(file, 'utf8')));
	return `${label}\n\n${texts.join('\n\n')}\n`;
}

async function nodeLicense() {
	for (const directory of [
		path.dirname(process.execPath),
		path.resolve(process.execPath, '../..')
	]) {
		try {
			return await readFile(path.join(directory, 'LICENSE'), 'utf8');
		} catch (error) {
			if (error.code !== 'ENOENT') throw error;
		}
	}
	const response = await fetch(
		`https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`
	);
	if (!response.ok) throw new Error(`Could not fetch the Node.js license: HTTP ${response.status}`);
	return response.text();
}

export async function writeLicenses(output, target) {
	const { packages } = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
	const notices = await Promise.all(
		Object.entries(packages)
			.filter(([name, entry]) => name && !entry.dev)
			.map(([name, entry]) =>
				packageNotices(
					path.join(root, name),
					`${name.replace(/^node_modules\//, '')} ${entry.version} (${entry.license ?? 'See notice'})`
				)
			)
	);
	if (target) {
		notices.unshift(`Node.js ${process.version}\n\n${await nodeLicense()}`);
		const metadata = JSON.parse(
			execFileSync(
				'cargo',
				['metadata', '--format-version', '1', '--locked', '--filter-platform', target],
				{
					cwd: path.join(root, 'src-tauri'),
					encoding: 'utf8',
					maxBuffer: 16 * 1024 * 1024
				}
			)
		);
		notices.push(
			...(await Promise.all(
				metadata.packages
					.filter((entry) => entry.source)
					.map((entry) =>
						packageNotices(
							path.dirname(entry.manifest_path),
							`${entry.name} ${entry.version} (${entry.license ?? 'See notice'})`,
							entry.license_file
						)
					)
			))
		);
	}
	await writeFile(output, notices.filter(Boolean).join('\n\n'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	if (!process.argv[2]) throw new Error('Pass the output file for third-party notices.');
	await writeLicenses(path.resolve(process.argv[2]));
}
