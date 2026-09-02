import { useEffect, useState } from 'react';
import Icon from '../Icon';
import { useStore } from '$lib/store';
import { borderContrast, textScale, theme, themeConfig } from '$lib/stores';
import type { Theme, ThemeConfig } from '$lib/stores';
import {
	DEFAULT_BORDER_CONTRAST,
	MAX_BORDER_CONTRAST,
	defaultThemeConfig,
	normalizeBorderContrast,
	normalizeHexColor,
	resolveThemeMode,
	resolveThemeConfig,
	sanitizeThemeConfig
} from '$lib/utils/appearance';

const minTextScale = 1;
const maxTextScale = 1.5;
const borderContrastStep = 0.5;

export default function Appearance() {
	const themeValue = useStore(theme);
	const themeConfigValue = useStore(themeConfig);
	const textScaleValue = useStore(textScale);
	const borderContrastValue = useStore(borderContrast);

	const [scaleEnabled, setScaleEnabled] = useState(false);
	const [scaleDraft, setScaleDraft] = useState(1);
	const [borderContrastEnabled, setBorderContrastEnabled] = useState(false);
	const [borderContrastDraft, setBorderContrastDraft] = useState(DEFAULT_BORDER_CONTRAST);
	const [colorDrafts, setColorDrafts] = useState({ background: '', foreground: '' });

	const resolvedTheme = resolveThemeMode(themeValue);
	const resolvedConfig = resolveThemeConfig(themeValue, themeConfigValue);
	const defaultColors = defaultThemeConfig(themeValue);
	const hasCustomAppearance = Boolean(
		themeConfigValue || textScaleValue !== null || borderContrastValue !== null
	);

	useEffect(() => {
		setColorDrafts({
			background: resolvedConfig.background,
			foreground: resolvedConfig.foreground
		});
		if (textScaleValue !== null) {
			setScaleEnabled(true);
			setScaleDraft(textScaleValue);
		} else if (!scaleEnabled) {
			setScaleDraft(1);
		}
		if (borderContrastValue !== null) {
			setBorderContrastEnabled(true);
			setBorderContrastDraft(borderContrastValue);
		} else if (!borderContrastEnabled) {
			setBorderContrastDraft(DEFAULT_BORDER_CONTRAST);
		}
	}, [
		resolvedConfig.background,
		resolvedConfig.foreground,
		textScaleValue,
		borderContrastValue,
		scaleEnabled,
		borderContrastEnabled
	]);

	function updateThemeColors(next: { background?: string; foreground?: string }) {
		const current = themeConfig.get() ?? {};
		themeConfig.set(
			sanitizeThemeConfig({
				...current,
				[resolvedTheme]: { ...(current[resolvedTheme] ?? {}), ...next }
			})
		);
	}

	function updateThemeConfig(next: ThemeConfig) {
		themeConfig.set(sanitizeThemeConfig({ ...(themeConfig.get() ?? {}), ...next }));
	}

	function updateColor(key: 'background' | 'foreground', value: string) {
		setColorDrafts((drafts) => ({ ...drafts, [key]: value }));
		const color = normalizeHexColor(value);
		if (color) updateThemeColors({ [key]: color });
	}

	function resetThemeColor(key: 'background' | 'foreground') {
		const current = themeConfig.get() ?? {};
		const activeColors = { ...(current[resolvedTheme] ?? {}) };
		delete activeColors[key];

		const nextConfig = { ...current };
		if (Object.keys(activeColors).length > 0) nextConfig[resolvedTheme] = activeColors;
		else delete nextConfig[resolvedTheme];

		themeConfig.set(sanitizeThemeConfig(nextConfig));
	}

	function toggleTextScale() {
		if (scaleEnabled) {
			setScaleEnabled(false);
			setScaleDraft(1);
			textScale.set(null);
		} else {
			setScaleEnabled(true);
			setScaleDraft(textScale.get() ?? 1);
		}
	}

	function toggleBorderContrast() {
		if (borderContrastEnabled) {
			setBorderContrastEnabled(false);
			setBorderContrastDraft(DEFAULT_BORDER_CONTRAST);
			borderContrast.set(null);
		} else {
			setBorderContrastEnabled(true);
			setBorderContrastDraft(borderContrast.get() ?? DEFAULT_BORDER_CONTRAST);
		}
	}

	function normalizeTextScale(scale: number | string) {
		const value = Number(scale);
		if (!Number.isFinite(value)) return minTextScale;
		return Math.max(minTextScale, Math.min(maxTextScale, Number(value.toFixed(2))));
	}

	function scaleLabel(scale: number) {
		return `${scale.toFixed(scale % 1 === 0 ? 0 : 2)}x`;
	}

	function borderContrastLabel(contrast: number) {
		return `${contrast.toFixed(contrast % 1 === 0 ? 0 : 1)}%`;
	}

	function setTextScalePreference(scale: number | string) {
		const next = normalizeTextScale(scale);
		setScaleDraft(next);
		if (next === minTextScale) {
			setScaleEnabled(false);
			textScale.set(null);
		} else {
			setScaleEnabled(true);
			textScale.set(next);
		}
	}

	function setBorderContrastPreference(contrast: number | string) {
		const next = normalizeBorderContrast(contrast) ?? DEFAULT_BORDER_CONTRAST;
		setBorderContrastDraft(next);
		if (next === DEFAULT_BORDER_CONTRAST) {
			setBorderContrastEnabled(false);
			borderContrast.set(null);
		} else {
			setBorderContrastEnabled(true);
			borderContrast.set(next);
		}
	}

	function resetAppearance() {
		themeConfig.set(null);
		setScaleEnabled(false);
		setScaleDraft(1);
		textScale.set(null);
		setBorderContrastEnabled(false);
		setBorderContrastDraft(DEFAULT_BORDER_CONTRAST);
		borderContrast.set(null);
	}

	const stepButton =
		'flex items-center justify-center w-6 h-6 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/6 transition-colors';

	return (
		<>
			<div className="flex flex-col h-full">
				<div className="flex-1 min-h-0 overflow-y-auto scrollbar-none pr-1.5 -mr-1.5">
					<div className="flex items-center justify-between mb-4">
						<h2 className="text-sm font-medium text-gray-900 dark:text-white">Appearance</h2>
						<button
							type="button"
							className="text-[0.625rem] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors duration-100 disabled:opacity-30 disabled:pointer-events-none"
							disabled={!hasCustomAppearance}
							onClick={resetAppearance}
						>
							Reset
						</button>
					</div>

					<h3 className="text-xs text-gray-400 dark:text-gray-600 mb-2">Theme</h3>
					<div className="flex gap-1">
						{[
							{ value: 'light' as Theme, label: 'Light', icon: 'sun-light' },
							{ value: 'dark' as Theme, label: 'Dark', icon: 'half-moon' },
							{ value: 'system' as Theme, label: 'System', icon: 'monitor' }
						].map((opt) => (
							<button
								key={opt.value}
								className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs transition-colors duration-100
								${
									themeValue === opt.value
										? 'bg-gray-200/50 dark:bg-white/8 text-gray-900 dark:text-white font-medium'
										: 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
								}`}
								onClick={() => theme.set(opt.value)}
							>
								<Icon name={opt.icon} size={13} />
								{opt.label}
							</button>
						))}
					</div>

					<h3 className="text-xs text-gray-400 dark:text-gray-600 mb-2 mt-5">Colors</h3>
					<div className="flex flex-col gap-2.5">
						{[
							{ key: 'background' as const, label: 'Background', value: resolvedConfig.background },
							{ key: 'foreground' as const, label: 'Foreground', value: resolvedConfig.foreground }
						].map((opt) => (
							<label key={opt.key} className="flex items-center justify-between gap-3">
								<span className="text-xs text-gray-600 dark:text-gray-400">{opt.label}</span>
								<div className="flex items-center gap-1.5 min-w-0">
									<input
										type="color"
										value={opt.value}
										className="appearance-swatch"
										aria-label={opt.label}
										onChange={(e) => updateColor(opt.key, e.currentTarget.value)}
									/>
									<button
										type="button"
										className="inline-flex h-6 items-center gap-1 rounded-lg px-1.5 text-[0.625rem] text-gray-400 transition-colors duration-100 hover:bg-gray-100 hover:text-gray-700 disabled:pointer-events-none disabled:opacity-35 dark:hover:bg-white/6 dark:hover:text-gray-300"
										disabled={resolvedConfig[opt.key] === defaultColors[opt.key]}
										onClick={() => resetThemeColor(opt.key)}
									>
										<span
											className="size-2.5 rounded-full"
											style={{ background: defaultColors[opt.key] }}
										></span>
										Default
									</button>
									<input
										value={colorDrafts[opt.key]}
										className="w-24 bg-transparent text-right text-[0.8125rem] text-gray-700 dark:text-gray-300 outline-none"
										aria-label={opt.label}
										onChange={(e) => updateColor(opt.key, e.currentTarget.value)}
									/>
								</div>
							</label>
						))}
					</div>

					<h3 className="text-xs text-gray-400 dark:text-gray-600 mb-2 mt-5">Interface</h3>
					<label className="flex items-center justify-between gap-3">
						<span className="text-xs text-gray-600 dark:text-gray-400">UI font</span>
						<input
							key={themeConfigValue?.uiFont ?? ''}
							defaultValue={themeConfigValue?.uiFont ?? ''}
							placeholder={resolvedConfig.uiFont}
							className="w-full max-w-[15rem] bg-transparent text-right text-[0.8125rem] text-gray-700 dark:text-gray-300 outline-none"
							aria-label="UI font"
							onBlur={(e) => updateThemeConfig({ uiFont: e.currentTarget.value })}
						/>
					</label>

					<div className="w-full mt-3">
						<div className="flex items-center gap-2">
							<span className="text-xs text-gray-600 dark:text-gray-400">Border contrast</span>
							<button
								type="button"
								className="ml-auto h-6 px-2 rounded-lg text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/6 transition-colors"
								onClick={toggleBorderContrast}
							>
								{borderContrastEnabled ? borderContrastLabel(borderContrastDraft) : 'Default'}
							</button>
						</div>
						{borderContrastEnabled && (
							<div className="flex items-center gap-1.5 pt-1.5">
								<button
									type="button"
									className={stepButton}
									aria-label="Decrease border contrast"
									onClick={() =>
										setBorderContrastPreference(borderContrastDraft - borderContrastStep)
									}
								>
									<Icon name="minus" size={12} />
								</button>
								<input
									className="appearance-range flex-1 min-w-0"
									type="range"
									min={DEFAULT_BORDER_CONTRAST}
									max={MAX_BORDER_CONTRAST}
									step={borderContrastStep}
									value={borderContrastDraft}
									aria-label="Border contrast"
									onChange={(e) => setBorderContrastPreference(e.currentTarget.value)}
								/>
								<button
									type="button"
									className={stepButton}
									aria-label="Increase border contrast"
									onClick={() =>
										setBorderContrastPreference(borderContrastDraft + borderContrastStep)
									}
								>
									<Icon name="plus" size={12} />
								</button>
							</div>
						)}
					</div>

					<div className="w-full mt-5">
						<div className="flex items-center gap-2">
							<span className="text-xs text-gray-600 dark:text-gray-400">UI scale</span>
							<button
								type="button"
								className="ml-auto h-6 px-2 rounded-lg text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/6 transition-colors"
								onClick={toggleTextScale}
							>
								{scaleEnabled ? scaleLabel(scaleDraft) : 'Default'}
							</button>
						</div>

						{scaleEnabled && (
							<div className="flex items-center gap-1.5 pt-1.5">
								<button
									type="button"
									className={stepButton}
									aria-label="Decrease UI scale"
									onClick={() => setTextScalePreference(scaleDraft - 0.1)}
								>
									<Icon name="minus" size={12} />
								</button>
								<input
									className="appearance-range flex-1 min-w-0"
									type="range"
									min={minTextScale}
									max={maxTextScale}
									step="0.01"
									value={scaleDraft}
									aria-label="UI scale"
									onChange={(e) => setTextScalePreference(e.currentTarget.value)}
								/>
								<button
									type="button"
									className={stepButton}
									aria-label="Increase UI scale"
									onClick={() => setTextScalePreference(scaleDraft + 0.1)}
								>
									<Icon name="plus" size={12} />
								</button>
							</div>
						)}
					</div>
				</div>
			</div>
			<style>{`
				.appearance-swatch {
					width: 1.5rem;
					height: 1.5rem;
					border: 1px solid var(--app-border);
					border-radius: 624.9375rem;
					background: transparent;
					padding: 0.125rem;
				}

				.appearance-range {
					appearance: none;
					height: 1rem;
					background: transparent;
					cursor: pointer;
				}

				.appearance-range::-webkit-slider-runnable-track {
					height: 0.1875rem;
					border-radius: 624.9375rem;
					background: color-mix(in oklab, var(--app-fg) 24%, transparent);
				}

				.appearance-range::-webkit-slider-thumb {
					appearance: none;
					width: 0.75rem;
					height: 0.75rem;
					margin-top: -0.3125rem;
					border-radius: 624.9375rem;
					border: 1px solid color-mix(in oklab, var(--app-bg) 70%, transparent);
					background: color-mix(in oklab, var(--app-fg) 82%, var(--app-bg));
				}

				.appearance-range::-moz-range-track {
					height: 0.1875rem;
					border-radius: 624.9375rem;
					background: color-mix(in oklab, var(--app-fg) 24%, transparent);
				}

				.appearance-range::-moz-range-thumb {
					width: 0.75rem;
					height: 0.75rem;
					border-radius: 624.9375rem;
					border: 1px solid color-mix(in oklab, var(--app-bg) 70%, transparent);
					background: color-mix(in oklab, var(--app-fg) 82%, var(--app-bg));
				}
			`}</style>
		</>
	);
}
