import type { LibraryItem } from '$shared/types';
import { createFolder, createNotebook, purgeItems, renameItem } from '$lib/apis/library';
import { ConfirmDialog, PromptDialog } from '../common/Dialog';
import MoveDialog from './MoveDialog';
import NewNotebookDialog from './NewNotebookDialog';

export type LibraryDialog =
	| { kind: 'rename'; item: LibraryItem }
	| { kind: 'new-folder' }
	| { kind: 'new-notebook' }
	| { kind: 'move'; ids: string[] }
	| { kind: 'purge'; ids: string[] };
export type RunLibraryAction = (action: () => Promise<unknown>, success?: string) => Promise<void>;

export default function LibraryDialogs({
	dialog,
	onclose,
	items,
	parent,
	run,
	moveTo
}: {
	dialog: LibraryDialog | null;
	onclose: () => void;
	items: Map<string, LibraryItem>;
	parent: string;
	run: RunLibraryAction;
	moveTo: (ids: string[], target: string) => Promise<void>;
}) {
	return (
		<>
			{dialog?.kind === 'rename' && (
				<PromptDialog
					title="Rename"
					initial={dialog.item.name}
					confirmLabel="Rename"
					onsubmit={(name) => run(() => renameItem(dialog.item.id, name), 'Renamed')}
					onclose={onclose}
				/>
			)}
			{dialog?.kind === 'new-folder' && (
				<PromptDialog
					title="New folder"
					placeholder="Folder name"
					confirmLabel="Create"
					onsubmit={(name) => run(() => createFolder(name, parent), 'Folder created')}
					onclose={onclose}
				/>
			)}
			{dialog?.kind === 'new-notebook' && (
				<NewNotebookDialog
					onsubmit={(name, template) =>
						run(
							() => createNotebook(name, parent, template.filename, template.landscape),
							'Notebook created'
						)
					}
					onclose={onclose}
				/>
			)}
			{dialog?.kind === 'move' && (
				<MoveDialog
					items={items}
					moving={dialog.ids}
					current={parent}
					onmove={(target) => moveTo(dialog.ids, target)}
					onclose={onclose}
				/>
			)}
			{dialog?.kind === 'purge' && (
				<ConfirmDialog
					title={`Delete ${dialog.ids.length === 1 ? 'this item' : `${dialog.ids.length} items`} permanently?`}
					message="The files are removed from the tablet. This cannot be undone."
					confirmLabel="Delete"
					danger
					onconfirm={() => run(() => purgeItems(dialog.ids), 'Deleted')}
					onclose={onclose}
				/>
			)}
		</>
	);
}
