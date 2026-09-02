import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useStore } from '$lib/store';
import { activeDeviceId, devices } from '$lib/stores';
import Icon from '../Icon';
import PageHeader, { ToolButton } from '../common/PageHeader';

function wsUrl(path: string): string {
	const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
	return `${protocol}://${location.host}${path}`;
}

function cssColor(name: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export default function TerminalView() {
	const deviceId = useStore(activeDeviceId);
	const list = useStore(devices);
	const device = list.find((entry) => entry.id === deviceId);
	const host = useRef<HTMLDivElement | null>(null);
	const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');
	const [message, setMessage] = useState<string | null>(null);
	const [generation, setGeneration] = useState(0);

	useEffect(() => {
		const element = host.current;
		if (!element || !deviceId) return;
		setStatus('connecting');
		setMessage(null);
		const terminal = new Terminal({
			cursorBlink: true,
			fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
			fontSize: 12,
			theme: {
				background: cssColor('--app-bg') || '#0b0d10',
				foreground: cssColor('--app-fg') || '#e7e9ed',
				cursor: cssColor('--app-fg') || '#e7e9ed'
			}
		});
		const fit = new FitAddon();
		terminal.loadAddon(fit);
		terminal.open(element);
		fit.fit();
		const socket = new WebSocket(
			wsUrl(`/ws/terminal?device=${deviceId}&cols=${terminal.cols}&rows=${terminal.rows}`)
		);
		socket.binaryType = 'arraybuffer';
		socket.onopen = () => {
			setStatus('open');
			terminal.focus();
		};
		socket.onmessage = (event) => {
			if (typeof event.data === 'string') {
				const parsed = JSON.parse(event.data) as { type: string; message?: string };
				if (parsed.type === 'error') setMessage(parsed.message ?? 'Terminal error');
				return;
			}
			terminal.write(new Uint8Array(event.data as ArrayBuffer));
		};
		socket.onclose = () => {
			setStatus('closed');
			terminal.write('\r\n\x1b[2m[session closed]\x1b[0m\r\n');
		};
		const input = terminal.onData((data) => {
			if (socket.readyState === WebSocket.OPEN)
				socket.send(JSON.stringify({ type: 'input', data }));
		});
		const observer = new ResizeObserver(() => {
			fit.fit();
			if (socket.readyState === WebSocket.OPEN) {
				socket.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
			}
		});
		observer.observe(element);
		return () => {
			observer.disconnect();
			input.dispose();
			socket.onopen = null;
			socket.onmessage = null;
			socket.onclose = null;
			socket.close();
			terminal.dispose();
		};
	}, [deviceId, generation]);

	return (
		<div className="h-full flex flex-col">
			<PageHeader>
				<span className="text-xs font-medium text-gray-900 dark:text-white">Terminal</span>
				<span className="text-xs app-muted font-mono truncate">
					{device ? `${device.username}@${device.host}` : ''}
				</span>
				<span className="ml-auto text-[0.6875rem] app-muted">
					{status === 'connecting' ? 'Connecting…' : status === 'open' ? 'Connected' : 'Closed'}
				</span>
				<ToolButton
					icon={<Icon name="refresh" size={14} />}
					label="New session"
					onclick={() => setGeneration((value) => value + 1)}
				/>
			</PageHeader>
			{message && (
				<div className="px-4 h-8 flex items-center text-xs text-red-500 border-b border-gray-200 dark:border-white/6">
					{message}
				</div>
			)}
			<div className="flex-1 min-h-0 p-2">
				<div ref={host} className="h-full w-full" />
			</div>
		</div>
	);
}
