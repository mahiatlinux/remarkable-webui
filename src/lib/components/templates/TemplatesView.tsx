import { useEffect, useMemo, useState } from 'react';
import type { TemplateInfo } from '$shared/types';
import { getTemplateDocument, getTemplates, templateFileUrl } from '$lib/apis/system';
import { downloadUrl } from '$lib/apis/client';
import { templateSvg } from '$lib/templates/render';
import Icon from '../Icon';
import Modal from '../Modal';
import PageHeader, { EmptyState } from '../common/PageHeader';
import Spinner from '../common/Spinner';
import TemplatePreview, { paperFor } from './TemplatePreview';

async function downloadSvg(template: TemplateInfo) {
	if (template.file === 'template') {
		const doc = await getTemplateDocument(template.filename);
		const [width, height] = paperFor(template);
		const blob = new Blob([templateSvg(doc, width, height)], { type: 'image/svg+xml' });
		const url = URL.createObjectURL(blob);
		downloadUrl(url, `${template.filename}.svg`);
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

	useEffect(() => {
		getTemplates()
			.then(setTemplates)
			.catch((err: Error) => setError(err.message));
	}, []);

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

	return (
		<div className="h-full flex flex-col">
			<PageHeader>
				<span className="text-xs font-medium text-gray-900 dark:text-white">Templates</span>
				{templates && <span className="text-xs app-muted">{visible.length} shown</span>}
				<div className="ml-auto flex items-center gap-1">
					<input
						className="app-input h-7 w-40 px-2 rounded-lg text-xs"
						placeholder="Filter"
						value={query}
						onChange={(event) => setQuery(event.currentTarget.value)}
					/>
					<div className="flex gap-0.5">
						{(['portrait', 'landscape'] as const).map((value) => (
							<button
								key={value}
								className={`h-7 px-2 rounded-lg text-xs transition-colors ${
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
								className={`flex items-center w-full h-7 px-2 rounded-lg text-xs text-left transition-colors ${
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
										className="flex flex-col gap-1.5 p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 text-left transition-colors"
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
											<div className="text-xs text-gray-900 dark:text-white truncate">
												{template.name}
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

			{preview && (
				<Modal
					onclose={() => setPreview(null)}
					class="max-w-[90vw] max-h-[90vh] flex flex-col p-3 gap-2"
				>
					<div className="flex items-center gap-2">
						<span className="text-xs font-medium text-gray-900 dark:text-white">
							{preview.name}
						</span>
						<span className="text-[0.6875rem] app-muted font-mono">{preview.filename}</span>
						<button
							className="ml-auto app-button-ghost flex items-center gap-1.5 h-7 px-2 rounded-lg text-xs"
							onClick={() => void downloadSvg(preview)}
							disabled={!preview.file}
						>
							<Icon name="download" size={13} />
							Download
						</button>
						<button
							className="app-button-ghost flex items-center justify-center w-7 h-7 rounded-lg"
							onClick={() => setPreview(null)}
							aria-label="Close"
						>
							<Icon name="xmark" size={14} />
						</button>
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
		</div>
	);
}
