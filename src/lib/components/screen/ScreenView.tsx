import { useEffect, useRef, useState } from 'react';
import fixWebmDuration from 'fix-webm-duration';
import type { ScreenError, ScreenMeta } from '$shared/types';
import { useStore } from '$lib/store';
import { activeDeviceId } from '$lib/stores';
import { downloadUrl } from '$lib/apis/client';
import Icon from '../Icon';
import PageHeader, { EmptyState, ToolButton } from '../common/PageHeader';
import Spinner from '../common/Spinner';

function wsUrl(path: string): string {
	const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
	return `${protocol}://${location.host}${path}`;
}

const RECORDING_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

function timestamp(): string {
	return new Date().toISOString().replace(/[:.]/g, '-');
}

function formatElapsed(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function renderFrame(
	source: HTMLCanvasElement,
	target: HTMLCanvasElement,
	rotation: number,
	invert: boolean
) {
	if (source.width === 0) return;
	const rotated = rotation % 2 === 1;
	const width = rotated ? source.height : source.width;
	const height = rotated ? source.width : source.height;
	if (target.width !== width || target.height !== height) {
		target.width = width;
		target.height = height;
	}
	const context = target.getContext('2d');
	if (!context) return;
	context.save();
	context.translate(width / 2, height / 2);
	context.rotate((rotation * Math.PI) / 2);
	context.drawImage(source, -source.width / 2, -source.height / 2);
	context.restore();
	if (invert) {
		context.globalCompositeOperation = 'difference';
		context.fillStyle = '#fff';
		context.fillRect(0, 0, width, height);
		context.globalCompositeOperation = 'source-over';
	}
}

function drawPacket(context: CanvasRenderingContext2D, packet: ArrayBuffer, meta: ScreenMeta) {
	const view = new DataView(packet);
	const y0 = view.getUint16(0, true);
	const rows = view.getUint16(2, true);
	if (rows === 0) return false;
	const payload = new Uint8Array(packet, 8, view.getUint32(4, true));
	const image = context.createImageData(meta.width, rows);
	const out = image.data;
	let offset = 0;
	if (meta.channels === 1) {
		for (let i = 0; i < payload.length; i += 2) {
			const value = payload[i + 1];
			for (let run = payload[i]; run > 0; run--, offset += 4) {
				out[offset] = out[offset + 1] = out[offset + 2] = value;
				out[offset + 3] = 255;
			}
		}
	} else {
		for (let i = 0; i < payload.length; i += 4) {
			for (let run = payload[i]; run > 0; run--, offset += 4) {
				out[offset] = payload[i + 1];
				out[offset + 1] = payload[i + 2];
				out[offset + 2] = payload[i + 3];
				out[offset + 3] = 255;
			}
		}
	}
	context.putImageData(image, 0, y0);
	return true;
}

export default function ScreenView() {
	const deviceId = useStore(activeDeviceId);
	const canvas = useRef<HTMLCanvasElement | null>(null);
	const area = useRef<HTMLDivElement | null>(null);
	const [meta, setMeta] = useState<ScreenMeta | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [fps, setFps] = useState(0);
	const [rotation, setRotation] = useState(0);
	const [invert, setInvert] = useState(false);
	const [paused, setPaused] = useState(false);
	const [fullscreen, setFullscreen] = useState(false);
	const [generation, setGeneration] = useState(0);
	const [areaSize, setAreaSize] = useState({ width: 0, height: 0 });
	const [recordingSince, setRecordingSince] = useState<number | null>(null);
	const [elapsed, setElapsed] = useState(0);
	const pausedRef = useRef(false);
	pausedRef.current = paused;
	const invertRef = useRef(false);
	invertRef.current = invert;
	const recorder = useRef<MediaRecorder | null>(null);
	const frameLoop = useRef(0);

	useEffect(() => {
		const element = area.current;
		if (!element) return;
		const observer = new ResizeObserver(([entry]) =>
			setAreaSize({ width: entry.contentRect.width, height: entry.contentRect.height })
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, [fullscreen]);

	useEffect(() => {
		if (!deviceId) return;
		setError(null);
		setMeta(null);
		const socket = new WebSocket(wsUrl(`/ws/screen?device=${deviceId}`));
		socket.binaryType = 'arraybuffer';
		let current: ScreenMeta | null = null;
		let updates = 0;
		const counter = setInterval(() => {
			setFps(updates);
			updates = 0;
		}, 1000);
		socket.onmessage = (event) => {
			if (typeof event.data === 'string') {
				const parsed = JSON.parse(event.data) as ScreenMeta | ScreenError;
				if (parsed.type === 'error') setError(parsed.message);
				else {
					current = parsed;
					setMeta(parsed);
				}
				return;
			}
			if (!current || pausedRef.current) return;
			const target = canvas.current;
			if (!target) return;
			if (target.width !== current.width || target.height !== current.height) {
				target.width = current.width;
				target.height = current.height;
			}
			const context = target.getContext('2d');
			if (!context) return;
			if (drawPacket(context, event.data as ArrayBuffer, current)) updates += 1;
		};
		socket.onclose = () => setError((previous) => previous ?? 'Stream closed');
		return () => {
			clearInterval(counter);
			socket.onmessage = null;
			socket.onclose = null;
			socket.close();
		};
	}, [deviceId, generation]);

	useEffect(() => {
		function onFullscreenChange() {
			if (!document.fullscreenElement) setFullscreen(false);
		}
		function onKey(event: KeyboardEvent) {
			const target = event.target as HTMLElement;
			if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
			if (event.key === 'f') toggleFullscreen();
			else if (event.key === 'r') setRotation((value) => (value + 1) % 4);
			else if (event.key === 'i') setInvert((value) => !value);
			else if (event.key === 'Escape' && fullscreen && !document.fullscreenElement)
				setFullscreen(false);
		}
		document.addEventListener('fullscreenchange', onFullscreenChange);
		window.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('fullscreenchange', onFullscreenChange);
			window.removeEventListener('keydown', onKey);
		};
	});

	function toggleFullscreen() {
		if (fullscreen) {
			setFullscreen(false);
			if (document.fullscreenElement) void document.exitFullscreen();
			return;
		}
		setFullscreen(true);
		void document.documentElement.requestFullscreen?.().catch(() => {});
	}

	function saveBlob(blob: Blob, extension: string) {
		const url = URL.createObjectURL(blob);
		downloadUrl(url, `remarkable-${timestamp()}.${extension}`);
		URL.revokeObjectURL(url);
	}

	function snapshot() {
		const source = canvas.current;
		if (!source) return;
		const frame = document.createElement('canvas');
		renderFrame(source, frame, rotation, invert);
		frame.toBlob((blob) => blob && saveBlob(blob, 'png'));
	}

	function startRecording() {
		const source = canvas.current;
		const mimeType = RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
		if (!source || !mimeType) {
			setError('This browser cannot record video');
			return;
		}
		const frame = document.createElement('canvas');
		const startRotation = rotation;
		renderFrame(source, frame, startRotation, invertRef.current);
		const media = new MediaRecorder(frame.captureStream(60), {
			mimeType,
			videoBitsPerSecond: 8_000_000
		});
		const chunks: Blob[] = [];
		const startedAt = Date.now();
		media.ondataavailable = (event) => event.data.size && chunks.push(event.data);
		media.onstop = () => {
			frame
				.captureStream()
				.getTracks()
				.forEach((track) => track.stop());
			fixWebmDuration(new Blob(chunks, { type: mimeType }), Date.now() - startedAt, {
				logger: false
			}).then((blob) => saveBlob(blob, 'webm'));
		};
		const draw = () => {
			if (canvas.current) renderFrame(canvas.current, frame, startRotation, invertRef.current);
			frameLoop.current = requestAnimationFrame(draw);
		};
		frameLoop.current = requestAnimationFrame(draw);
		media.start(1000);
		recorder.current = media;
		setRecordingSince(startedAt);
	}

	function stopRecording() {
		cancelAnimationFrame(frameLoop.current);
		recorder.current?.stop();
		recorder.current = null;
		setRecordingSince(null);
	}

	useEffect(() => {
		if (recordingSince === null) return;
		setElapsed(0);
		const timer = setInterval(() => setElapsed(Date.now() - recordingSince), 500);
		return () => clearInterval(timer);
	}, [recordingSince]);

	useEffect(() => () => stopRecording(), []);

	const rotated = rotation % 2 === 1;
	const frameWidth = meta ? (rotated ? meta.height : meta.width) : 0;
	const frameHeight = meta ? (rotated ? meta.width : meta.height) : 0;
	const padding = fullscreen ? 0 : 24;
	const scale = meta
		? Math.min((areaSize.width - padding) / frameWidth, (areaSize.height - padding) / frameHeight)
		: 1;
	const displayWidth = meta ? meta.width * scale : 0;
	const displayHeight = meta ? meta.height * scale : 0;

	const stage = (
		<div
			ref={area}
			className={`relative flex items-center justify-center overflow-hidden ${
				fullscreen ? 'fixed inset-0 z-[200] bg-black' : 'flex-1 min-h-0'
			}`}
		>
			{error ? (
				<EmptyState
					icon={<Icon name="monitor" size={28} />}
					title="Screen mirror unavailable"
					hint={error}
				/>
			) : !meta ? (
				<Spinner size={20} />
			) : null}
			<canvas
				ref={canvas}
				className={`page-paper absolute ${meta && !error ? '' : 'hidden'}`}
				style={{
					width: displayWidth,
					height: displayHeight,
					transform: `rotate(${rotation * 90}deg)`,
					filter: invert ? 'invert(1)' : undefined
				}}
			/>
			{fullscreen && (
				<button
					className="absolute top-3 right-3 flex items-center justify-center w-8 h-8 rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
					onClick={toggleFullscreen}
					aria-label="Exit full screen"
					title="Exit full screen (Esc)"
				>
					<Icon name="xmark" size={14} />
				</button>
			)}
		</div>
	);

	if (fullscreen) return stage;

	return (
		<div className="h-full flex flex-col">
			<PageHeader>
				<span className="page-title">Screen</span>
				{meta && (
					<span className="text-xs app-muted">
						{meta.model} · {meta.width}×{meta.height} · {fps} updates/s
					</span>
				)}
				<div className="ml-auto flex items-center gap-0.5">
					{recordingSince !== null && (
						<span className="flex items-center gap-1.5 mr-1 text-xs tabular-nums text-red-500">
							<span className="status-dot error connecting"></span>
							{formatElapsed(elapsed)}
						</span>
					)}
					<ToolButton
						icon={<Icon name={recordingSince === null ? 'record' : 'stop'} size={14} />}
						label={recordingSince === null ? 'Record video' : 'Stop recording'}
						active={recordingSince !== null}
						onclick={recordingSince === null ? startRecording : stopRecording}
						disabled={!meta}
					/>
					<ToolButton
						icon={<Icon name="rotate" size={14} />}
						label="Rotate (r)"
						onclick={() => setRotation((value) => (value + 1) % 4)}
					/>
					<ToolButton
						icon={<Icon name="half-moon" size={14} />}
						label="Invert colors (i)"
						active={invert}
						onclick={() => setInvert(!invert)}
					/>
					<ToolButton
						icon={<Icon name={paused ? 'play' : 'pause'} size={14} />}
						label={paused ? 'Resume' : 'Pause'}
						active={paused}
						onclick={() => setPaused(!paused)}
					/>
					<ToolButton
						icon={<Icon name="camera" size={14} />}
						label="Save screenshot"
						onclick={snapshot}
						disabled={!meta}
					/>
					<ToolButton
						icon={<Icon name="expand" size={14} />}
						label="Full screen (f)"
						onclick={toggleFullscreen}
						disabled={!meta}
					/>
					<ToolButton
						icon={<Icon name="refresh" size={14} />}
						label="Reconnect"
						onclick={() => setGeneration((value) => value + 1)}
					/>
				</div>
			</PageHeader>
			{stage}
		</div>
	);
}
