import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { chmod, copyFile, cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeLicenses } from './licenses.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = execFileSync('rustc', ['--print', 'host-tuple'], { encoding: 'utf8' }).trim();
if (process.env.TAURI_ENV_TARGET_TRIPLE && process.env.TAURI_ENV_TARGET_TRIPLE !== target) {
	throw new Error('Build the desktop app on a runner matching its target architecture.');
}
const binaries = path.join(root, 'src-tauri', 'binaries');
const resources = path.join(root, 'src-tauri', 'resources', 'server');
await mkdir(binaries, { recursive: true });
await mkdir(resources, { recursive: true });
const executable = path.join(
	binaries,
	`remarkable-node-${target}${process.platform === 'win32' ? '.exe' : ''}`
);
await copyFile(process.execPath, executable);
await chmod(executable, 0o755);
await build({
	entryPoints: [path.join(root, 'server', 'index.ts')],
	outfile: path.join(resources, 'index.mjs'),
	bundle: true,
	platform: 'node',
	target: 'node22',
	format: 'esm',
	external: ['cpu-features', '*.node'],
	banner: {
		js: "import { createRequire } from 'node:module'; import { fileURLToPath as bundleFileURLToPath } from 'node:url'; import { dirname as bundleDirname } from 'node:path'; const require = createRequire(import.meta.url); const __dirname = bundleDirname(bundleFileURLToPath(import.meta.url));"
	}
});
await cp(path.join(root, 'server', 'bin'), path.join(resources, 'bin'), { recursive: true });
await writeLicenses(path.join(root, 'src-tauri', 'resources', 'third-party.txt'), target);
console.log(`Desktop backend prepared for ${target}`);
