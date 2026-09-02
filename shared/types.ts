export type SessionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface DeviceInput {
	name: string;
	host: string;
	port: number;
	username: string;
	password?: string;
	keyPath?: string;
	autoRestart: boolean;
}

export interface Device extends Omit<DeviceInput, 'password'> {
	id: string;
	hasPassword: boolean;
}

export interface DeviceState extends Device {
	status: SessionStatus;
	error?: string;
	model?: string;
	machine?: string;
	pendingRestart: boolean;
}

export interface UsbProbe {
	reachable: boolean;
	host: string;
}

export type LibraryItemType = 'folder' | 'notebook' | 'pdf' | 'epub';

export interface LibraryItem {
	id: string;
	name: string;
	type: LibraryItemType;
	parent: string;
	pinned: boolean;
	lastModified: number;
	lastOpened: number;
	pageCount: number;
	currentPage: number;
	coverPageId: string | null;
	tags: string[];
	sizeKb: number;
}

export interface DocumentPage {
	id: string;
	template: string | null;
	hasLines: boolean;
	pdfPage: number | null;
}

export interface DocumentDetail {
	item: LibraryItem;
	pages: DocumentPage[];
	orientation: 'portrait' | 'landscape';
	currentPage: number;
	paperSize: [number, number];
}

export type FsEntryType = 'file' | 'dir' | 'symlink' | 'other';

export interface FsEntry {
	name: string;
	type: FsEntryType;
	size: number;
	mtime: number;
	mode: number;
	target?: string;
}

export interface FsListing {
	path: string;
	entries: FsEntry[];
}

export interface BatteryInfo {
	capacity: number | null;
	status: string | null;
	temperature: number | null;
}

export interface StorageInfo {
	totalKb: number;
	usedKb: number;
	availableKb: number;
}

export interface MemoryInfo {
	totalKb: number;
	availableKb: number;
}

export interface SystemInfo {
	machine: string;
	model: string;
	serial: string | null;
	firmware: string | null;
	osName: string | null;
	hostname: string;
	uptimeSeconds: number;
	battery: BatteryInfo;
	storage: StorageInfo | null;
	memory: MemoryInfo | null;
	addresses: { iface: string; address: string }[];
	wifiSsid: string | null;
	xochitlActive: boolean;
	webInterfaceEnabled: boolean | null;
	usbConnected: boolean;
	deviceTime: number;
}

export type SystemAction = 'restart-xochitl' | 'reboot' | 'poweroff';

export type TemplateFile = 'template' | 'svg' | 'png';

export interface TemplateInfo {
	name: string;
	filename: string;
	iconCode: string;
	categories: string[];
	landscape: boolean;
	file: TemplateFile | null;
}

export interface ScreenMeta {
	type: 'meta';
	width: number;
	height: number;
	visibleWidth: number;
	channels: number;
	model: string;
}

export interface ScreenError {
	type: 'error';
	message: string;
}

export interface UploadResult {
	created: { id: string; name: string }[];
}

export type ServerEvent =
	| { type: 'device'; device: DeviceState }
	| { type: 'library'; deviceId: string }
	| { type: 'restart'; deviceId: string; pending: boolean };
