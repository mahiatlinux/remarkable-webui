export const setTextScale = (scale: number) => {
	if (typeof document === 'undefined') return;
	document.documentElement.style.setProperty('--app-text-scale', `${scale}`);
};
