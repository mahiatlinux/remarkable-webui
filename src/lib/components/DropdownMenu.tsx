import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { tooltip } from '$lib/tooltip';
import Icon from './Icon';
import KeyPill from './KeyPill';

const css = `
.menu-row {
	color: color-mix(in oklab, var(--app-fg) 62%, var(--app-bg));
}

.menu-row:hover {
	background: color-mix(in oklab, var(--app-fg) 6%, transparent);
	color: var(--app-fg);
}
`;

interface MenuItem {
	label: string;
	tooltip?: string;
	icon?: string;
	onclick: () => void;
	active?: boolean;
	divider?: boolean;
	image?: string;
	check?: boolean;
	shortcut?: string;
	actionIcon?: string;
	actionLabel?: string;
	actionOnclick?: (anchor: HTMLElement) => void;
}

interface Props {
	items: MenuItem[];
	anchor: { x: number; y: number } | HTMLElement;
	onclose: () => void;
	matchWidth?: boolean;
	preferAbove?: boolean;
	forceAbove?: boolean;
	inlineAbove?: boolean;
	maxHeight?: string;
	header?: ReactNode;
	footer?: ReactNode;
	headerDivider?: boolean;
	footerDivider?: boolean;
	empty?: ReactNode;
	children?: ReactNode;
	className?: string;
	align?: 'start' | 'end';
}

export default function DropdownMenu({
	items,
	anchor,
	onclose,
	matchWidth = false,
	preferAbove = false,
	forceAbove = false,
	inlineAbove = false,
	maxHeight,
	header,
	footer,
	headerDivider = true,
	footerDivider = true,
	empty,
	children,
	className = '',
	align = 'start'
}: Props) {
	const menuEl = useRef<HTMLDivElement | null>(null);
	const [pos, setPos] = useState<{ x: number; top?: number; bottom?: number }>({
		x: -9999,
		top: -9999
	});
	const [anchorWidth, setAnchorWidth] = useState(0);
	const [menuMaxHeight, setMenuMaxHeightState] = useState<number | undefined>(undefined);
	const [ready, setReady] = useState(false);
	const menuMaxHeightRef = useRef<number | undefined>(undefined);
	const frame = useRef<number | undefined>(undefined);
	const anchorFrame = useRef<number | undefined>(undefined);
	const settleTimers = useRef<number[]>([]);
	const lastViewportState = useRef('');
	const lastAnchorState = useRef('');
	const latest = useRef({ anchor, matchWidth, preferAbove, forceAbove, inlineAbove, align });
	latest.current = { anchor, matchWidth, preferAbove, forceAbove, inlineAbove, align };

	function setMenuMaxHeight(value: number | undefined) {
		menuMaxHeightRef.current = value;
		setMenuMaxHeightState(value);
	}

	function visualViewportRect() {
		const vv = window.visualViewport;
		return {
			left: vv?.offsetLeft ?? 0,
			top: vv?.offsetTop ?? 0,
			width: vv?.width ?? window.innerWidth,
			height: vv?.height ?? window.innerHeight
		};
	}

	function viewportState() {
		const viewport = visualViewportRect();
		return [
			viewport.left,
			viewport.top,
			viewport.width,
			viewport.height,
			window.innerWidth,
			window.innerHeight
		].join(':');
	}

	function anchorState() {
		const { anchor: currentAnchor } = latest.current;
		if (!(currentAnchor instanceof HTMLElement)) {
			return `${currentAnchor.x}:${currentAnchor.y}:${viewportState()}`;
		}

		const rect = currentAnchor.getBoundingClientRect();
		return [rect.left, rect.top, rect.right, rect.bottom, rect.width, rect.height, viewportState()]
			.map((value) => (typeof value === 'number' ? value.toFixed(2) : value))
			.join(':');
	}

	function measureMenu() {
		if (!menuEl.current) return { width: 0, height: 0 };

		const previousMaxHeight = menuEl.current.style.maxHeight;
		menuEl.current.style.maxHeight = '';
		const size = {
			width: menuEl.current.offsetWidth,
			height: menuEl.current.offsetHeight
		};
		menuEl.current.style.maxHeight = previousMaxHeight;
		return size;
	}

	function updatePosition() {
		if (!menuEl.current) return;
		const {
			anchor: currentAnchor,
			matchWidth: currentMatchWidth,
			preferAbove: currentPreferAbove,
			forceAbove: currentForceAbove,
			inlineAbove: currentInlineAbove,
			align: currentAlign
		} = latest.current;

		if (currentInlineAbove) {
			if (currentMatchWidth && currentAnchor instanceof HTMLElement) {
				setAnchorWidth(currentAnchor.getBoundingClientRect().width);
			}
			setReady(true);
			return;
		}

		let ax: number;
		let anchorTop: number;
		let anchorBottom: number;

		if (currentAnchor instanceof HTMLElement) {
			const rect = currentAnchor.getBoundingClientRect();
			ax = rect.left;
			anchorTop = rect.top;
			anchorBottom = rect.bottom;
			if (currentMatchWidth) setAnchorWidth(rect.width);
		} else {
			ax = currentAnchor.x;
			anchorTop = currentAnchor.y;
			anchorBottom = currentAnchor.y;
		}

		const { width: mw, height: mh } = measureMenu();
		const viewport = visualViewportRect();
		const viewportRight = viewport.left + viewport.width;
		const viewportBottom = viewport.top + viewport.height;
		const layoutViewportHeight = window.innerHeight;
		const pad = 8;
		const gap = 4;

		if (currentAlign === 'end' && currentAnchor instanceof HTMLElement) {
			const rect = currentAnchor.getBoundingClientRect();
			ax = rect.right - mw;
		}
		if (ax + mw > viewportRight - pad) ax = viewportRight - mw - pad;
		if (ax < viewport.left + pad) ax = viewport.left + pad;

		const spaceAbove = anchorTop - viewport.top - gap - pad;
		const spaceBelow = viewportBottom - anchorBottom - gap - pad;

		let availableHeight: number;

		if (
			currentForceAbove ||
			(currentPreferAbove && (mh <= spaceAbove || spaceAbove >= spaceBelow))
		) {
			availableHeight = spaceAbove;
			setPos({
				x: ax,
				bottom: Math.max(pad, layoutViewportHeight - anchorTop + gap)
			});
		} else {
			if (mh <= spaceBelow) {
				availableHeight = spaceBelow;
				const nextTop = Math.min(anchorBottom + gap, viewportBottom - pad - mh);
				setPos({ x: ax, top: Math.max(nextTop, viewport.top + pad) });
			} else {
				availableHeight = spaceAbove;
				setPos({
					x: ax,
					bottom: Math.max(pad, layoutViewportHeight - anchorTop + gap)
				});
			}
		}

		setMenuMaxHeight(
			availableHeight >= 0 &&
				(currentForceAbove || mh > availableHeight || menuMaxHeightRef.current != null)
				? Math.max(0, availableHeight)
				: undefined
		);
		setReady(true);
	}

	function scheduleUpdate() {
		if (frame.current != null) cancelAnimationFrame(frame.current);
		frame.current = requestAnimationFrame(() => {
			frame.current = undefined;
			updatePosition();
		});
	}

	function scheduleSettledUpdates() {
		for (const timer of settleTimers.current) window.clearTimeout(timer);
		settleTimers.current = [];
		scheduleUpdate();
		for (const delay of [50, 150, 300]) {
			settleTimers.current.push(window.setTimeout(scheduleUpdate, delay));
		}
	}

	function handleViewportChange() {
		const nextViewportState = viewportState();
		if (nextViewportState === lastViewportState.current) return;
		lastViewportState.current = nextViewportState;
		scheduleSettledUpdates();
	}

	function handleFocusIn(event: FocusEvent) {
		if (event.target instanceof Node && menuEl.current?.contains(event.target)) {
			scheduleSettledUpdates();
		}
	}

	function trackAnchor() {
		const nextAnchorState = anchorState();
		if (nextAnchorState !== lastAnchorState.current) {
			lastAnchorState.current = nextAnchorState;
			updatePosition();
		}
		anchorFrame.current = requestAnimationFrame(trackAnchor);
	}

	useEffect(() => {
		let dvhProbe: HTMLDivElement | undefined;
		let dvhObserver: ResizeObserver | undefined;

		lastViewportState.current = viewportState();
		lastAnchorState.current = anchorState();
		scheduleUpdate();
		anchorFrame.current = requestAnimationFrame(trackAnchor);

		window.addEventListener('scroll', scheduleUpdate, true);
		window.addEventListener('resize', scheduleSettledUpdates);
		window.visualViewport?.addEventListener('resize', scheduleSettledUpdates);
		window.visualViewport?.addEventListener('scroll', scheduleUpdate);
		document.addEventListener('focusin', handleFocusIn);

		if ('ResizeObserver' in window) {
			dvhProbe = document.createElement('div');
			dvhProbe.style.position = 'fixed';
			dvhProbe.style.left = '-1px';
			dvhProbe.style.top = '0';
			dvhProbe.style.width = '1px';
			dvhProbe.style.height = '100dvh';
			dvhProbe.style.pointerEvents = 'none';
			dvhProbe.style.visibility = 'hidden';
			document.body.appendChild(dvhProbe);

			dvhObserver = new ResizeObserver(handleViewportChange);
			dvhObserver.observe(dvhProbe);
		}

		return () => {
			if (frame.current != null) cancelAnimationFrame(frame.current);
			if (anchorFrame.current != null) cancelAnimationFrame(anchorFrame.current);
			for (const timer of settleTimers.current) window.clearTimeout(timer);
			dvhObserver?.disconnect();
			dvhProbe?.remove();
			window.removeEventListener('scroll', scheduleUpdate, true);
			window.removeEventListener('resize', scheduleSettledUpdates);
			window.visualViewport?.removeEventListener('resize', scheduleSettledUpdates);
			window.visualViewport?.removeEventListener('scroll', scheduleUpdate);
			document.removeEventListener('focusin', handleFocusIn);
		};
	}, []);

	useEffect(() => {
		if (menuEl.current) scheduleSettledUpdates();
	}, [maxHeight]);

	const menuStyle: CSSProperties = {
		...(inlineAbove
			? {}
			: {
					left: `${pos.x}px`,
					...(pos.bottom != null
						? { bottom: `${pos.bottom}px` }
						: { top: `${pos.top ?? -9999}px` }),
					...(menuMaxHeight ? { maxHeight: `${menuMaxHeight}px` } : {})
				}),
		...(anchorWidth ? { width: `${anchorWidth}px` } : {}),
		opacity: ready ? 1 : 0,
		pointerEvents: ready ? 'auto' : 'none'
	};

	const content = (
		<>
			<style href="dropdown-menu-css" precedence="default">
				{css}
			</style>
			<div
				className="fixed inset-0 z-[1000]"
				onClick={onclose}
				onContextMenu={(e) => {
					e.preventDefault();
					onclose();
				}}
			></div>
			<div
				ref={menuEl}
				className={`${
					inlineAbove
						? `absolute bottom-full mb-1 ${align === 'end' ? 'right-0' : 'left-0'}`
						: 'fixed'
				} app-theme app-surface app-popover-radius z-[1001] min-w-36 border shadow-xl p-0.5 flex flex-col overflow-hidden ${className}`}
				style={menuStyle}
				onClick={(e) => e.stopPropagation()}
				onMouseDown={(e) => e.stopPropagation()}
			>
				{header && (
					<div className="flex-none">
						{header}
						{headerDivider && <div className="app-divider h-px mx-1 my-0.5"></div>}
					</div>
				)}

				<div
					className="flex flex-1 min-h-0 flex-col gap-px overflow-y-auto"
					style={maxHeight ? { maxHeight } : undefined}
				>
					{children
						? children
						: items.length === 0 && empty
							? empty
							: items.map((item, index) =>
									item.divider ? (
										<div key={index} className="app-divider h-px mx-1 my-0.5"></div>
									) : (
										<div
											key={index}
											className={`group menu-row flex items-center gap-1 w-full h-6 rounded-xl text-xs transition-colors duration-75 ${
												item.active ? 'app-interactive-active' : ''
											}`}
										>
											<button
												className="flex items-center gap-2 min-w-0 flex-1 h-full px-2 text-inherit"
												ref={tooltip(
													item.tooltip ? { content: item.tooltip, placement: 'top' } : null
												)}
												onClick={() => {
													item.onclick();
													onclose();
												}}
											>
												{item.image ? (
													<img
														src={item.image}
														alt=""
														className="w-4 h-4 rounded-full object-cover shrink-0"
													/>
												) : item.icon ? (
													<Icon name={item.icon} size={14} />
												) : null}
												<span className="flex-1 text-left truncate">{item.label}</span>
												{item.shortcut && <KeyPill text={item.shortcut} class="ml-auto shrink-0" />}
												{item.check && item.active && (
													<svg
														className="app-icon-muted w-3 h-3 shrink-0"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														strokeWidth="2.5"
														strokeLinecap="round"
														strokeLinejoin="round"
													>
														<polyline points="20 6 9 17 4 12" />
													</svg>
												)}
											</button>
											{item.actionIcon && item.actionOnclick && (
												<button
													className="app-icon-muted app-interactive flex items-center justify-center w-5 h-5 mr-0.5 rounded-full shrink-0 transition-all duration-75"
													aria-label={item.actionLabel}
													onClick={(e) => {
														e.stopPropagation();
														item.actionOnclick?.(e.currentTarget as HTMLElement);
													}}
												>
													<Icon name={item.actionIcon} size={12} />
												</button>
											)}
										</div>
									)
								)}
				</div>

				{footer && (
					<div className="flex-none">
						{footerDivider && <div className="app-divider h-px mx-1 my-0.5"></div>}
						{footer}
					</div>
				)}
			</div>
		</>
	);

	return inlineAbove ? content : createPortal(content, document.body);
}
