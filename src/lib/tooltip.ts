import tippy, { type Instance, type Props as TippyProps } from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import type { RefCallback } from 'react';

export type TooltipParams = string | Partial<TippyProps> | null | undefined | false;

const instances = new WeakMap<HTMLElement, Instance>();
const pendingDestroy = new WeakMap<HTMLElement, number>();

function optsFor(value: TooltipParams): Partial<TippyProps> | null {
	if (!value) return null;
	const opts: Partial<TippyProps> = typeof value === 'string' ? { content: value } : value;
	return opts.content ? opts : null;
}

function destroy(node: HTMLElement) {
	instances.get(node)?.destroy();
	instances.delete(node);
}

export function tooltip(params: TooltipParams): RefCallback<HTMLElement> {
	return (node) => {
		if (!node) return;
		const scheduled = pendingDestroy.get(node);
		if (scheduled !== undefined) {
			cancelAnimationFrame(scheduled);
			pendingDestroy.delete(node);
		}
		const opts = optsFor(params);
		const existing = instances.get(node);
		if (!opts) {
			if (existing) destroy(node);
		} else if (existing) {
			existing.setProps(opts);
		} else {
			instances.set(
				node,
				tippy(node, {
					arrow: false,
					delay: [400, 0],
					duration: [100, 75],
					placement: 'bottom',
					theme: 'chat',
					touch: false,
					...opts
				})
			);
		}
		return () => {
			pendingDestroy.set(
				node,
				requestAnimationFrame(() => {
					pendingDestroy.delete(node);
					destroy(node);
				})
			);
		};
	};
}
