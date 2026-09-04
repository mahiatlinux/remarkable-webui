import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import Startup from '$lib/components/Startup';
import { loadFonts, watchAppearance } from '$lib/appearance';

const unwatch = watchAppearance();
if (import.meta.hot) import.meta.hot.dispose(unwatch);

async function mount() {
	await loadFonts();
	createRoot(document.getElementById('root')!).render(
		<StrictMode>
			<BrowserRouter>
				<Startup>
					<App />
				</Startup>
			</BrowserRouter>
		</StrictMode>
	);
}

void mount().catch(() => {
	const root = document.getElementById('root')!;
	root.style.cssText = 'display:block;padding:40px;font:14px system-ui';
	root.textContent = 'Could not load the app fonts. Please reload the app.';
});
