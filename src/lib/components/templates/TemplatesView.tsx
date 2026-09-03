import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { TemplateInfo, TemplateInput } from '$shared/types';
import {
	addTemplate,
	deleteTemplate,
	forgetTemplateDocument,
	getTemplateDocument,
	getTemplates,
	templateFileUrl,
	templateSourceUrl,
	updateTemplate
} from '$lib/apis/system';
import { downloadUrl } from '$lib/apis/client';
import { templateSvg } from '$lib/templates/render';
import DropdownMenu from '../DropdownMenu';
import Icon from '../Icon';
import KeyPill from '../KeyPill';
import Modal from '../Modal';
import PageHeader, { EmptyState } from '../common/PageHeader';
import Spinner from '../common/Spinner';
import { ConfirmDialog } from '../common/Dialog';
import TextEditor from '../files/TextEditor';
import AddTemplateDialog from './AddTemplateDialog';
import TemplatePreview, { paperFor } from './TemplatePreview';

type CustomTemplate = TemplateInfo & { id: string };

function isCustom(template: TemplateInfo): template is CustomTemplate {
	return Boolean(template.id);
}

async function downloadSvg(template: TemplateInfo) {
	if (template.file === 'template') {
		const doc = await getTemplateDocument(templateSourceUrl(template));
		const [width, height] = paperFor(template);
		const blob = new Blob([templateSvg(doc, width, height)], { type: 'image/svg+xml' });
		const url = URL.createObjectURL(blob);
		downloadUrl(url, `${template.name}.svg`);
		URL.revokeObjectURL(url);
		return;
	}
	if (template.file) {
		downloadUrl(
			templateFileUrl(template.filename, template.file),
			`${template.filename}.${template.file}`
		);
	}
}

export default function TemplatesView() {
	const [templates, setTemplates] = useState<TemplateInfo[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [category, setCategory] = useState<string>('all');
	const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
	const [query, setQuery] = useState('');
	const [preview, setPreview] = useState<TemplateInfo | null>(null);
	const [showAdd, setShowAdd] = useState(false);
	const [showDownload, setShowDownload] = useState(false);
	const [editing, setEditing] = useState<CustomTemplate | null>(null);
	const [removing, setRemoving] = useState<CustomTemplate | null>(null);
	const downloadButton = useRef<HTMLButtonElement | null>(null);

	function load() {
		getTemplates()
			.then((list) => {
				setTemplates(list);
				setError(null);
			})
			.catch((err: Error) => setError(err.message));
	}

	useEffect(load, []);

	const categories = useMemo(
		() => [...new Set((templates ?? []).flatMap((template) => template.categories))].sort(),
		[templates]
	);

	const visible = (templates ?? []).filter(
		(template) =>
			template.landscape === (orientation === 'landscape') &&
			(category === 'all' || template.categories.includes(category)) &&
			template.name.toLowerCase().includes(query.trim().toLowerCase())
	);

	async function add(input: TemplateInput) {
		const created = await addTemplate(input);
		toast.success(`Added ${created.name}`);
		load();
	}

	async function remove(template: CustomTemplate) {
		await deleteTemplate(template.id);
		toast.success(`Deleted ${template.name}`);
		setPreview(null);
		load();
	}

	return (
		<div className="h-full flex flex-col relative">
			<PageHeader>
				<span className="page-title">Templates</span>
				{templates && <span className="text-xs app-muted">{visible.length} shown</span>}
				<div className="ml-auto flex items-center gap-1">
					<input
						className="app-input h-7 w-40 px-3 rounded-full text-xs"
						placeholder="Filter"
						value={query}
						onChange={(event) => setQuery(event.currentTarget.value)}
					/>
					<div className="flex gap-0.5">
						{(['portrait', 'landscape'] as const).map((value) => (
							<button
								key={value}
								className={`h-7 px-2 rounded-full text-xs transition-colors ${
									orientation === value
										? 'bg-gray-200/50 dark:bg-white/8 text-gray-900 dark:text-white font-medium'
										: 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
								}`}
								onClick={() => setOrientation(value)}
							>
								{value === 'portrait' ? 'Portrait' : 'Landscape'}
							</button>
						))}
					</div>
					<button
						className="app-button flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-extrabold ml-1"
						onClick={() => setShowAdd(true)}
					>
						<Icon name="plus" size={13} />
						Add
					</button>
				</div>
			</PageHeader>

			{error ? (
				<EmptyState
					icon={<Icon name="grid" size={28} />}
					title="Templates unavailable"
					hint={error}
				/>
			) : !templates ? (
				<div className="flex-1 flex items-center justify-center">
					<Spinner size={20} />
				</div>
			) : (
				<div className="flex-1 min-h-0 flex">
					<div className="w-40 shrink-0 border-r border-gray-200 dark:border-white/6 p-2 overflow-y-auto scrollbar-hover hidden sm:block">
						{['all', ...categories].map((entry) => (
							<button
								key={entry}
								className={`flex items-center w-full h-7 px-2 rounded-full text-xs text-left transition-colors ${
									category === entry
										? 'bg-gray-100 dark:bg-white/6 text-gray-900 dark:text-white font-medium'
										: 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
								}`}
								onClick={() => setCategory(entry)}
							>
								{entry === 'all' ? 'All categories' : entry}
							</button>
						))}
					</div>
					<div className="flex-1 min-w-0 overflow-y-auto scrollbar-hover">
						{visible.length === 0 ? (
							<EmptyState icon={<Icon name="grid" size={28} />} title="No templates match" />
						) : (
							<div className="grid gap-2 p-3 grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]">
								{visible.map((template) => (
									<button
										key={`${template.filename}-${template.landscape}`}
										className="flex flex-col gap-1.5 p-2 rounded-xl border hover:bg-gray-100 dark:hover:bg-white/5 text-left transition-colors"
										onClick={() => setPreview(template)}
									>
										<div
											className={`page-paper w-full overflow-hidden rounded-md ${
												template.landscape ? 'aspect-[4/3]' : 'aspect-[3/4]'
											}`}
										>
											<TemplatePreview template={template} className="w-full h-full" />
										</div>
										<div className="min-w-0 px-0.5">
											<div className="flex items-center gap-1.5 text-xs text-gray-900 dark:text-white">
												<span className="truncate">{template.name}</span>
												{template.id && <KeyPill text="Custom" />}
											</div>
											<div className="text-[0.625rem] text-gray-400 dark:text-gray-600 truncate">
												{template.categories.join(', ')}
											</div>
										</div>
									</button>
								))}
							</div>
						)}
					</div>
				</div>
			)}

			{editing && (
				<TextEditor
					title={`${editing.name}.template`}
					read={() =>
						getTemplateDocument(templateSourceUrl(editing)).then((doc) =>
							JSON.stringify(doc, null, 4)
						)
					}
					write={async (text) => {
						await updateTemplate(editing.id, text);
						forgetTemplateDocument(templateSourceUrl(editing));
					}}
					onclose={() => {
						setEditing(null);
						load();
					}}
				/>
			)}

			{showAdd && <AddTemplateDialog onsubmit={add} onclose={() => setShowAdd(false)} />}

			{preview && (
				<Modal
					onclose={() => setPreview(null)}
					class="max-w-[90vw] max-h-[90vh] flex flex-col p-3 gap-2"
				>
					<div className="flex items-center gap-2">
						<span className="text-xs font-extrabold tracking-tight text-gray-900 dark:text-white">
							{preview.name}
						</span>
						<span className="text-[0.6875rem] app-muted font-mono">{preview.filename}</span>
						<div className="ml-auto flex items-center gap-0.5">
							{isCustom(preview) && (
								<>
									<button
										className="app-button-ghost flex items-center gap-1.5 h-7 px-2 rounded-full text-xs"
										onClick={() => {
											setEditing(preview);
											setPreview(null);
										}}
									>
										<Icon name="pencil" size={13} />
										Edit
									</button>
									<button
										className="app-button-ghost flex items-center gap-1.5 h-7 px-2 rounded-full text-xs"
										onClick={() => setRemoving(preview)}
									>
										<Icon name="trash" size={13} />
										Delete
									</button>
								</>
							)}
							<button
								ref={downloadButton}
								className="app-button-ghost flex items-center gap-1.5 h-7 px-2 rounded-full text-xs"
								onClick={() =>
									preview.file === 'template' ? setShowDownload(true) : void downloadSvg(preview)
								}
								disabled={!preview.file}
							>
								<Icon name="download" size={13} />
								Download
							</button>
							<button
								className="app-button-ghost flex items-center justify-center w-7 h-7 rounded-full"
								onClick={() => setPreview(null)}
								aria-label="Close"
							>
								<Icon name="xmark" size={14} />
							</button>
						</div>
					</div>
					<div
						className={`page-paper min-h-0 overflow-hidden ${
							preview.landscape ? 'w-[80vw] max-w-[1100px] aspect-[4/3]' : 'h-[78vh] aspect-[3/4]'
						}`}
					>
						<TemplatePreview template={preview} className="w-full h-full" />
					</div>
				</Modal>
			)}

			{preview && showDownload && downloadButton.current && (
				<DropdownMenu
					anchor={downloadButton.current}
					align="end"
					items={[
						{ label: 'SVG', icon: 'image', onclick: () => void downloadSvg(preview) },
						{
							label: 'Template file',
							icon: 'code',
							onclick: () => downloadUrl(templateSourceUrl(preview), `${preview.name}.template`)
						}
					]}
					onclose={() => setShowDownload(false)}
				/>
			)}

			{removing && (
				<ConfirmDialog
					title={`Delete ${removing.name}?`}
					message="The template is removed from the tablet. Pages already using it keep their background."
					confirmLabel="Delete"
					danger
					onconfirm={() => remove(removing)}
					onclose={() => setRemoving(null)}
				/>
			)}
		</div>
	);
}
