import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { SystemAction, SystemInfo } from '$shared/types';
import { getSystemInfo, getWebInterfaceStatus, runSystemAction } from '$lib/apis/system';
import { formatBytes, formatDate, formatDuration } from '$lib/utils/format';
import Icon from '../Icon';
import PageHeader, { EmptyState, ToolButton } from '../common/PageHeader';
import Spinner from '../common/Spinner';
import { ConfirmDialog } from '../common/Dialog';

function Card({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
	return (
		<section className="rounded-2xl border p-3.5 flex flex-col gap-2">
			<h2 className="flex items-center gap-1.5 text-[0.6875rem] text-gray-400 dark:text-gray-600">
				<Icon name={icon} size={12} />
				{title}
			</h2>
			{children}
		</section>
	);
}

function Row({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="flex items-baseline justify-between gap-3 text-xs">
			<span className="app-muted shrink-0">{label}</span>
			<span className="text-gray-900 dark:text-white text-right truncate font-mono">
				{value ?? '–'}
			</span>
		</div>
	);
}

function Bar({ fraction }: { fraction: number }) {
	return (
		<div className="h-1.5 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
			<div
				className="h-full rounded-full bg-gray-700 dark:bg-gray-300 transition-all"
				style={{ width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` }}
			></div>
		</div>
	);
}

export default function DeviceView() {
	const [info, setInfo] = useState<SystemInfo | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [webui, setWebui] = useState<boolean | null | 'checking'>(null);
	const [confirm, setConfirm] = useState<SystemAction | null>(null);

	function load() {
		setLoading(true);
		getSystemInfo()
			.then((result) => {
				setInfo(result);
				setError(null);
			})
			.catch((err: Error) => setError(err.message))
			.finally(() => setLoading(false));
	}

	useEffect(() => {
		load();
		const timer = setInterval(load, 20000);
		return () => clearInterval(timer);
	}, []);

	function checkWebui() {
		setWebui('checking');
		getWebInterfaceStatus()
			.then((result) => setWebui(result.reachable))
			.catch(() => setWebui(false));
	}

	async function act(action: SystemAction) {
		try {
			await runSystemAction(action);
			toast.success(
				action === 'restart-xochitl'
					? 'xochitl restarted'
					: action === 'reboot'
						? 'Rebooting the tablet'
						: 'Powering off the tablet'
			);
			if (action === 'restart-xochitl') setTimeout(load, 3000);
		} catch (err) {
			toast.error((err as Error).message);
		}
	}

	return (
		<div className="h-full flex flex-col">
			<PageHeader>
				<span className="page-title">Device</span>
				{info && <span className="text-xs app-muted truncate">{info.model}</span>}
				<div className="ml-auto flex items-center gap-0.5">
					{loading && <Spinner size={12} class="mr-1" />}
					<ToolButton icon={<Icon name="refresh" size={14} />} label="Refresh" onclick={load} />
				</div>
			</PageHeader>

			{error && !info ? (
				<EmptyState
					icon={<Icon name="warning" size={28} />}
					title="Cannot read device info"
					hint={error}
				/>
			) : !info ? (
				<div className="flex-1 flex items-center justify-center">
					<Spinner size={20} />
				</div>
			) : (
				<div className="flex-1 min-h-0 overflow-y-auto scrollbar-hover">
					<div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
						<Card title="Tablet" icon="tablet">
							<Row label="Model" value={info.model} />
							<Row label="Machine" value={info.machine} />
							<Row label="Serial" value={info.serial} />
							<Row label="Firmware" value={info.firmware} />
							<Row label="System" value={info.osName} />
							<Row label="Hostname" value={info.hostname} />
						</Card>

						<Card title="Battery" icon="battery">
							{info.battery.capacity !== null ? (
								<>
									<div className="flex items-baseline justify-between">
										<span className="text-2xl font-semibold tabular-nums text-gray-900 dark:text-white">
											{info.battery.capacity}%
										</span>
										<span className="text-xs app-muted">{info.battery.status}</span>
									</div>
									<Bar fraction={info.battery.capacity / 100} />
									{info.battery.temperature !== null && (
										<Row label="Temperature" value={`${info.battery.temperature.toFixed(1)} °C`} />
									)}
								</>
							) : (
								<span className="text-xs app-muted">No battery information exposed</span>
							)}
						</Card>

						<Card title="Storage" icon="archive">
							{info.storage ? (
								<>
									<Row
										label="Used"
										value={`${formatBytes(info.storage.usedKb * 1024)} of ${formatBytes(info.storage.totalKb * 1024)}`}
									/>
									<Bar fraction={info.storage.usedKb / info.storage.totalKb} />
									<Row label="Free" value={formatBytes(info.storage.availableKb * 1024)} />
								</>
							) : (
								<span className="text-xs app-muted">Unavailable</span>
							)}
							{info.memory && (
								<>
									<Row
										label="Memory in use"
										value={`${formatBytes((info.memory.totalKb - info.memory.availableKb) * 1024)} of ${formatBytes(info.memory.totalKb * 1024)}`}
									/>
									<Bar fraction={1 - info.memory.availableKb / info.memory.totalKb} />
								</>
							)}
						</Card>

						<Card title="Network" icon="wifi">
							{info.addresses.length === 0 && (
								<span className="text-xs app-muted">No addresses</span>
							)}
							{info.addresses.map((entry) => (
								<Row key={entry.iface} label={entry.iface} value={entry.address} />
							))}
							<Row label="Wifi network" value={info.wifiSsid} />
							<Row label="USB cable" value={info.usbConnected ? 'connected' : 'not detected'} />
						</Card>

						<Card title="Software" icon="settings">
							<Row label="xochitl" value={info.xochitlActive ? 'running' : 'stopped'} />
							<Row
								label="USB web interface"
								value={
									info.webInterfaceEnabled === null
										? 'unknown'
										: info.webInterfaceEnabled
											? 'enabled'
											: 'disabled'
								}
							/>
							<div className="flex items-center justify-between gap-3 text-xs">
								<span className="app-muted">Reachable through SSH</span>
								<button
									className="app-button-ghost h-6 px-2 rounded-full text-xs font-mono"
									onClick={checkWebui}
									disabled={webui === 'checking'}
								>
									{webui === null ? 'check' : webui === 'checking' ? '…' : webui ? 'yes' : 'no'}
								</button>
							</div>
							<Row label="Uptime" value={formatDuration(info.uptimeSeconds)} />
							<Row label="Device time" value={formatDate(info.deviceTime)} />
						</Card>

						<Card title="Power" icon="power">
							<p className="text-xs app-muted">
								Restarting xochitl reloads the tablet interface and applies pending library changes.
							</p>
							<div className="flex flex-wrap gap-1.5 mt-1">
								<button
									className="app-button-ghost flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs border border-gray-200 dark:border-white/10"
									onClick={() => act('restart-xochitl')}
								>
									<Icon name="refresh" size={13} />
									Restart xochitl
								</button>
								<button
									className="app-button-ghost flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs border border-gray-200 dark:border-white/10"
									onClick={() => setConfirm('reboot')}
								>
									<Icon name="rotate" size={13} />
									Reboot
								</button>
								<button
									className="app-button-ghost flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs border border-gray-200 dark:border-white/10"
									onClick={() => setConfirm('poweroff')}
								>
									<Icon name="power" size={13} />
									Power off
								</button>
							</div>
						</Card>
					</div>
				</div>
			)}

			{confirm && (
				<ConfirmDialog
					title={confirm === 'reboot' ? 'Reboot the tablet?' : 'Power off the tablet?'}
					message={
						confirm === 'reboot'
							? 'The connection drops for about a minute while the tablet restarts.'
							: 'You will need to press the power button on the tablet to turn it back on.'
					}
					confirmLabel={confirm === 'reboot' ? 'Reboot' : 'Power off'}
					danger
					onconfirm={() => act(confirm)}
					onclose={() => setConfirm(null)}
				/>
			)}
		</div>
	);
}
