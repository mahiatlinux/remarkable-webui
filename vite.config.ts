import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
			$shared: fileURLToPath(new URL('./shared', import.meta.url))
		}
	},
	server: {
		proxy: {
			'/api': 'http://127.0.0.1:8787',
			'/ws': { target: 'ws://127.0.0.1:8787', ws: true }
		}
	}
});
