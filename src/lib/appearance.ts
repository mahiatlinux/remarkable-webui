import { borderContrast, textScale, theme, themeConfig } from '$lib/stores';
import { applyAppearance } from '$lib/utils/appearance';

export function watchAppearance() {
	const sync = () =>
		applyAppearance(theme.get(), themeConfig.get(), textScale.get(), borderContrast.get());
	sync();
	const unsubscribers = [
		theme.subscribe(sync),
		themeConfig.subscribe(sync),
		textScale.subscribe(sync),
		borderContrast.subscribe(sync)
	];
	const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
	systemTheme.addEventListener('change', sync);
	return () => {
		unsubscribers.forEach((unsubscribe) => unsubscribe());
		systemTheme.removeEventListener('change', sync);
	};
}

export async function loadFonts() {
	const fonts = [...document.fonts].filter((face) =>
		/Manrope Variable|JetBrains Mono Variable/.test(face.family)
	);
	await Promise.all(fonts.map((face) => face.load()));
}
