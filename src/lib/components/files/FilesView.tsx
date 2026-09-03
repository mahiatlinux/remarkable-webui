import {
	useEffect,
	useRef,
	useState,
	type DragEvent,
	type FormEvent,
	type MouseEvent
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { FsEntry, FsListing } from '$shared/types';
import {
	deletePaths,
	downloadPathUrl,
	listDir,
	makeDir,
	readText,
	renamePath,
	uploadToDir,
	writeText
} from '$lib/apis/fs';
import { downloadUrl } from '$lib/apis/client';
import { formatBytes, formatDate, formatMode } from '$lib/utils/format';
import DropdownMenu from '../DropdownMenu';
import Icon from '../Icon';
import PageHeader, { EmptyState, ToolButton } from '../common/PageHeader';
import Spinner from '../common/Spinner';
import { ConfirmDialog, PromptDialog } from '../common/Dialog';
import TextEditor from './TextEditor';

const HOME = '/home/root';
const TEXT_EXTENSIONS = new Set([
	'txt',
	'md',
	'json',
	'conf',
	'cfg',
	'ini',
	'sh',
	'py',
	'js',
	'ts',
	'css',
	'html',
	'xml',
	'svg',
	'yaml',
	'yml',
	'toml',
	'log',
	'service',
	'timer',
	'rules',
	'list',
	'pagedata',
	'metadata',
	'content',
	'csv',
	'env',
	'lock',
	'desktop',
	'mount',
	'network',
	'link',
	'conf.d'
]);

type Dialog =
	{ kind: 'mkdir' } | { kind: 'rename'; entry: FsEntry } | { kind: 'delete'; names: string[] };

function join(dir: string, name: string) {
	return dir === '/' ? `/${name}` : `${dir}/${name}`;
}

function looksText(entry: FsEntry): boolean {
	const dot = entry.name.lastIndexOf('.');
	const ext = dot >= 0 ? entry.name.slice(dot + 1).toLowerCase() : '';
	return (
		entry.size < 2 * 1024 * 1024 &&
		(TEXT_EXTENSIONS.has(ext) || (dot <= 0 && entry.size < 256 * 1024))
	);
}

function entryIcon(entry: FsEntry): string {
	if (entry.type === 'dir') return 'folder';
	if (entry.type === 'symlink') return 'link';
	const ext = entry.name.split('.').pop()?.toLowerCase();
	if (ext === 'pdf') return 'pdf';
	if (ext === 'epub') return 'book';
	if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'svg') return 'image';
	if (ext === 'rm') return 'notebook';
	return looksText(entry) ? 'page-text' : 'file';
}

export default function FilesView() {
	const params = useParams();
	const navigate = useNavigate();
	const path = `/${params['*'] ?? ''}`.replace(/\/+$/, '') || '/';
	const [listing, setListing] = useState<FsListing | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [showHidden, setShowHidden] = useState(false);
	const [menu, setMenu] = useState<{ x: number; y: number; entry?: FsEntry } | null>(null);
	const [dialog, setDialog] = useState<Dialog | null>(null);
	const [editing, setEditing] = useState<string | null>(null);
	const [pathDraft, setPathDraft] = useState<string | null>(null);
	const [dragOver, setDragOver] = useState(false);
	const fileInput = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		if (params['*'] === undefined || params['*'] === '') {
			navigate(`/files${HOME}`, { replace: true });
		}
	}, [params['*']]);

	function load() {
		setLoading(true);
		listDir(path)
			.then((result) => {
				setListing(result);
				setError(null);
			})
			.catch((err: Error) => setError(err.message))
			.finally(() => setLoading(false));
	}

	useEffect(() => {
		setSelected(new Set());
		setEditing(null);
		load();
	}, [path]);

	const entries = (listing?.entries ?? []).filter(
		(entry) => showHidden || !entry.name.startsWith('.')
	);
	const segments = path.split('/').filter(Boolean);

	function go(target: string) {
		navigate(`/files${target}`);
	}

	function openEntry(entry: FsEntry) {
		const full = join(path, entry.name);
		if (entry.type === 'dir') go(full);
		else if (looksText(entry)) setEditing(full);
		else downloadUrl(downloadPathUrl(full));
	}

	function select(entry: FsEntry, event: MouseEvent) {
		event.stopPropagation();
		if (event.metaKey || event.ctrlKey) {
			const next = new Set(selected);
			if (next.has(entry.name)) next.delete(entry.name);
			else next.add(entry.name);
			setSelected(next);
		} else {
			setSelected(new Set([entry.name]));
		}
	}

	function contextMenu(event: MouseEvent, entry?: FsEntry) {
		event.preventDefault();
		event.stopPropagation();
		if (entry && !selected.has(entry.name)) setSelected(new Set([entry.name]));
		if (!entry) setSelected(new Set());
		setMenu({ x: event.clientX, y: event.clientY, entry });
	}

	async function run(action: () => Promise<unknown>, success?: string) {
		try {
			await action();
			if (success) toast.success(success);
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			load();
		}
	}

	function upload(files: File[]) {
		if (files.length === 0) return;
		const id = toast.loading(`Uploading ${files.length} file${files.length === 1 ? '' : 's'}…`);
		uploadToDir(path, files, (fraction) =>
			toast.loading(`Uploading… ${Math.round(fraction * 100)}%`, { id })
		)
			.then(() => toast.success('Upload complete', { id }))
			.catch((err: Error) => toast.error(err.message, { id }))
			.finally(load);
	}

	function submitPath(event: FormEvent) {
		event.preventDefault();
		if (pathDraft) go(pathDraft.trim() || '/');
		setPathDraft(null);
	}

	function menuItems() {
		const names = [...selected];
		const single =
			names.length === 1 ? entries.find((entry) => entry.name === names[0]) : undefined;
		if (names.length === 0) {
			return [
				{ label: 'New folder', icon: 'folder-plus', onclick: () => setDialog({ kind: 'mkdir' }) },
				{ label: 'Upload files', icon: 'upload', onclick: () => fileInput.current?.click() },
				{ divider: true, label: '', onclick: () => {} },
				{ label: 'Refresh', icon: 'refresh', onclick: load }
			];
		}
		return [
			...(single
				? [
						{
							label: single.type === 'dir' ? 'Open' : 'Open or download',
							icon: 'eye',
							onclick: () => openEntry(single)
						}
					]
				: []),
			...(single
				? [
						{
							label: single.type === 'dir' ? 'Download as tar.gz' : 'Download',
							icon: 'download',
							onclick: () => downloadUrl(downloadPathUrl(join(path, single.name)))
						},
						{
							label: 'Rename',
							icon: 'pencil',
							onclick: () => setDialog({ kind: 'rename', entry: single })
						},
						{
							label: 'Copy path',
							icon: 'copy',
							onclick: () => navigator.clipboard.writeText(join(path, single.name))
						}
					]
				: []),
			{ divider: true, label: '', onclick: () => {} },
			{ label: 'Delete', icon: 'trash', onclick: () => setDialog({ kind: 'delete', names }) }
		];
	}

	return (
		<div
			className="h-full flex flex-col relative"
			onDragOver={(event: DragEvent) => {
				if (!event.dataTransfer.types.includes('Files')) return;
				event.preventDefault();
				setDragOver(true);
			}}
			onDragLeave={() => setDragOver(false)}
			onDrop={(event: DragEvent) => {
				setDragOver(false);
				if (!event.dataTransfer.types.includes('Files')) return;
				event.preventDefault();
				upload([...event.dataTransfer.files]);
			}}
		>
			<PageHeader>
				{pathDraft !== null ? (
					<form onSubmit={submitPath} className="flex-1 min-w-0">
						<input
							autoFocus
							className="app-input w-full h-7 px-3 rounded-full text-xs font-mono"
							value={pathDraft}
							onChange={(event) => setPathDraft(event.currentTarget.value)}
							onBlur={() => setPathDraft(null)}
							onKeyDown={(event) => event.key === 'Escape' && setPathDraft(null)}
						/>
					</form>
				) : (
					<nav className="flex items-center gap-0.5 min-w-0 text-xs overflow-x-auto scrollbar-none">
						<button
							className={`h-7 px-1.5 rounded-full app-button-ghost ${path === '/' ? 'text-gray-900 dark:text-white' : ''}`}
							onClick={() => go('/')}
						>
							/
						</button>
						{segments.map((segment, index) => {
							const target = `/${segments.slice(0, index + 1).join('/')}`;
							const last = index === segments.length - 1;
							return (
								<span key={target} className="flex items-center gap-0.5">
									<Icon name="chevron-right" size={12} class="app-icon-muted" />
									<button
										className={`h-7 px-1.5 rounded-full font-mono ${
											last ? 'text-gray-900 dark:text-white font-medium' : 'app-button-ghost'
										}`}
										onClick={() => (last ? setPathDraft(path) : go(target))}
									>
										{segment}
									</button>
								</span>
							);
						})}
						<button
							className="app-button-ghost flex items-center justify-center w-6 h-6 rounded-full ml-1"
							onClick={() => setPathDraft(path)}
							aria-label="Edit path"
						>
							<Icon name="pencil" size={11} />
						</button>
					</nav>
				)}
				<div className="ml-auto flex items-center gap-0.5">
					{loading && <Spinner size={12} class="mr-1" />}
					<ToolButton icon={<Icon name="home" size={14} />} label="Home" onclick={() => go(HOME)} />
					<ToolButton
						icon={<Icon name="arrow-up" size={14} />}
						label="Parent folder"
						onclick={() => go(`/${segments.slice(0, -1).join('/')}`)}
						disabled={path === '/'}
					/>
					<ToolButton
						icon={<Icon name="eye" size={14} />}
						label={showHidden ? 'Hide dotfiles' : 'Show dotfiles'}
						active={showHidden}
						onclick={() => setShowHidden(!showHidden)}
					/>
					<ToolButton icon={<Icon name="refresh" size={14} />} label="Refresh" onclick={load} />
					<ToolButton
						icon={<Icon name="folder-plus" size={14} />}
						label="New folder"
						onclick={() => setDialog({ kind: 'mkdir' })}
					/>
					<button
						className="app-button flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-extrabold ml-1"
						onClick={() => fileInput.current?.click()}
					>
						<Icon name="upload" size={13} />
						Upload
					</button>
				</div>
			</PageHeader>

			<div
				className="flex-1 min-h-0 overflow-y-auto scrollbar-hover"
				onClick={() => setSelected(new Set())}
				onContextMenu={(event) => contextMenu(event)}
			>
				{error ? (
					<EmptyState
						icon={<Icon name="warning" size={28} />}
						title="Cannot open folder"
						hint={error}
					/>
				) : listing && entries.length === 0 ? (
					<EmptyState icon={<Icon name="folder" size={28} />} title="Empty folder" />
				) : (
					<div className="p-2">
						<div className="grid grid-cols-[minmax(0,1fr)_5rem_9rem_6rem] gap-3 px-2 h-7 items-center text-[0.625rem] text-gray-400 dark:text-gray-600">
							<span>Name</span>
							<span className="text-right">Size</span>
							<span>Modified</span>
							<span>Mode</span>
						</div>
						{entries.map((entry) => (
							<div
								key={entry.name}
								className={`grid grid-cols-[minmax(0,1fr)_5rem_9rem_6rem] items-center gap-3 h-8 px-2 rounded-xl text-xs cursor-default select-none ${
									selected.has(entry.name)
										? 'bg-gray-200/60 dark:bg-white/10'
										: 'hover:bg-gray-100 dark:hover:bg-white/5'
								}`}
								onClick={(event) => select(entry, event)}
								onDoubleClick={() => openEntry(entry)}
								onContextMenu={(event) => contextMenu(event, entry)}
							>
								<span className="flex items-center gap-2 min-w-0">
									<Icon name={entryIcon(entry)} size={14} class="app-icon-muted" />
									<span className="truncate text-gray-900 dark:text-white font-mono">
										{entry.name}
									</span>
									{entry.target && (
										<span className="app-muted truncate font-mono text-[0.625rem]">
											→ {entry.target}
										</span>
									)}
								</span>
								<span className="app-muted tabular-nums text-right">
									{entry.type === 'dir' ? '' : formatBytes(entry.size)}
								</span>
								<span className="app-muted tabular-nums">{formatDate(entry.mtime)}</span>
								<span className="app-muted font-mono text-[0.625rem]">
									{formatMode(entry.mode)}
								</span>
							</div>
						))}
					</div>
				)}
			</div>

			{dragOver && (
				<div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 pointer-events-none">
					<div className="app-surface app-shell-radius border px-6 py-4 flex items-center gap-2 text-sm shadow-2xl">
						<Icon name="upload" size={18} />
						Drop to upload into {path}
					</div>
				</div>
			)}

			<input
				ref={fileInput}
				type="file"
				multiple
				className="hidden"
				onChange={(event) => {
					upload([...(event.currentTarget.files ?? [])]);
					event.currentTarget.value = '';
				}}
			/>

			{editing && (
				<TextEditor
					title={editing}
					read={() => readText(editing)}
					write={(text) => writeText(editing, text)}
					onclose={() => setEditing(null)}
				/>
			)}

			{menu && <DropdownMenu anchor={menu} items={menuItems()} onclose={() => setMenu(null)} />}

			{dialog?.kind === 'mkdir' && (
				<PromptDialog
					title="New folder"
					placeholder="Folder name"
					confirmLabel="Create"
					onsubmit={(name) => run(() => makeDir(join(path, name)), 'Folder created')}
					onclose={() => setDialog(null)}
				/>
			)}
			{dialog?.kind === 'rename' && (
				<PromptDialog
					title="Rename"
					initial={dialog.entry.name}
					confirmLabel="Rename"
					selectBase
					onsubmit={(name) =>
						run(() => renamePath(join(path, dialog.entry.name), join(path, name)), 'Renamed')
					}
					onclose={() => setDialog(null)}
				/>
			)}
			{dialog?.kind === 'delete' && (
				<ConfirmDialog
					title={`Delete ${dialog.names.length === 1 ? dialog.names[0] : `${dialog.names.length} items`}?`}
					message="This runs rm -rf on the tablet. Folders are removed with all their contents."
					confirmLabel="Delete"
					danger
					onconfirm={() =>
						run(() => deletePaths(dialog.names.map((name) => join(path, name))), 'Deleted')
					}
					onclose={() => setDialog(null)}
				/>
			)}
		</div>
	);
}
