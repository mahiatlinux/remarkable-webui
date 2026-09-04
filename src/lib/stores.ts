import { writable, type Writable } from '$lib/store';
import type { DeviceState, LibraryItem } from '$shared/types';
import type { Theme, ThemeConfig } from '$lib/utils/appearance';

export type { Theme, ThemeConfig } from '$lib/utils/appearance';

export type LibraryView = 'grid' | 'list';
export type LibrarySort = 'name' | 'modified' | 'opened' | 'size';

function persisted<T>(key: string, initial: T): Writable<T> {
	const raw = localStorage.getItem(key);
	let value = initial;
	if (raw !== null) {
		try {
			value = JSON.parse(raw) as T;
		} catch {
			localStorage.removeItem(key);
		}
	}
	const store = writable<T>(value);
	store.subscribe((next) => {
		if (next === null || next === undefined) localStorage.removeItem(key);
		else localStorage.setItem(key, JSON.stringify(next));
	});
	return store;
}

export const sidebarOpen = persisted<boolean>('rm_sidebar_open', true);
export const sidebarWidth = persisted<number>('rm_sidebar_width', 220);

export const appVersion = writable<string>(__APP_VERSION__);

export const devices = writable<DeviceState[]>([]);
export const devicesLoaded = writable<boolean>(false);
export const activeDeviceId = persisted<string | null>('rm_active_device', null);

export const library = writable<Map<string, LibraryItem>>(new Map());
export const libraryLoading = writable<boolean>(false);
export const libraryError = writable<string | null>(null);

export const libraryView = persisted<LibraryView>('rm_library_view', 'grid');
export const librarySort = persisted<LibrarySort>('rm_library_sort', 'modified');
export const showThumbnails = persisted<boolean>('rm_thumbnails', true);
export const developerNavOpen = persisted<boolean>('rm_developer_nav', false);

export const theme = persisted<Theme>('rm_theme', 'light');
export const themeConfig = persisted<ThemeConfig | null>('rm_theme_config', null);
export const textScale = persisted<number | null>('rm_text_scale', 1.2);
export const borderContrast = persisted<number | null>('rm_border_contrast', 12);

export function activeDevice(): DeviceState | null {
	const id = activeDeviceId.get();
	return devices.get().find((device) => device.id === id) ?? null;
}
