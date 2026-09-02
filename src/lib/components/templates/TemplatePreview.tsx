import { useEffect, useState } from 'react';
import type { TemplateInfo } from '$shared/types';
import { getTemplateDocument, templateFileUrl } from '$lib/apis/system';
import { templateSvg } from '$lib/templates/render';
import Icon from '../Icon';
import Spinner from '../common/Spinner';

const PAPER: [number, number] = [1404, 1872];

export function paperFor(template: TemplateInfo): [number, number] {
	return template.landscape ? [PAPER[1], PAPER[0]] : PAPER;
}

interface Props {
	template: TemplateInfo;
	className: string;
}

export default function TemplatePreview({ template, className }: Props) {
	const [svg, setSvg] = useState<string | null>(null);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		if (template.file !== 'template') return;
		let cancelled = false;
		getTemplateDocument(template.filename)
			.then((doc) => {
				const [width, height] = paperFor(template);
				if (!cancelled) setSvg(templateSvg(doc, width, height));
			})
			.catch(() => !cancelled && setFailed(true));
		return () => {
			cancelled = true;
		};
	}, [template]);

	if (template.filename === 'Blank') return <div className={`${className} bg-white`} />;

	if (template.file === 'template') {
		if (failed) {
			return (
				<div className={`${className} flex items-center justify-center text-gray-300`}>
					<Icon name="warning" size={20} />
				</div>
			);
		}
		if (!svg) {
			return (
				<div className={`${className} flex items-center justify-center`}>
					<Spinner size={14} />
				</div>
			);
		}
		return (
			<div
				className={`${className} [&>svg]:w-full [&>svg]:h-full`}
				dangerouslySetInnerHTML={{ __html: svg }}
			/>
		);
	}
	if (!template.file) {
		return (
			<div className={`${className} flex items-center justify-center text-gray-300`}>
				<Icon name="grid" size={20} />
			</div>
		);
	}
	return (
		<img
			src={templateFileUrl(template.filename, template.file)}
			alt={template.name}
			loading="lazy"
			draggable={false}
			className={className}
		/>
	);
}
