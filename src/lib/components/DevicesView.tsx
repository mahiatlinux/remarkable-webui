import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { DeviceInput, DeviceState } from '$shared/types';
import { useStore } from '$lib/store';
import { activeDeviceId, devices } from '$lib/stores';
import {
	connectDevice,
	createDevice,
	deleteDevice,
	disconnectDevice,
	probeUsb,
	updateDevice
} from '$lib/apis/devices';
import Icon from './Icon';
import PageHeader from './common/PageHeader';
import Spinner from './common/Spinner';
import { ConfirmDialog } from './common/Dialog';

const USB_HOST = '10.11.99.1';

type Draft = DeviceInput & { id?: string };

const emptyDraft = (): Draft => ({
	name: '',
	host: USB_HOST,
	port: 22,
	username: 'root',
	password: '',
	keyPath: '',
	autoRestart: true
});

export default function DevicesView() {
	const navigate = useNavigate();
	const list = useStore(devices);
	const active = useStore(activeDeviceId);
	const [draft, setDraft] = useState<Draft | null>(list.length === 0 ? emptyDraft() : null);
	const [saving, setSaving] = useState(false);
	const [usb, setUsb] = useState<boolean | null>(null);
	const [removing, setRemoving] = useState<DeviceState | null>(null);

	useEffect(() => {
		let cancelled = false;
		const check = () =>
			probeUsb()
				.then((result) => !cancelled && setUsb(result.reachable))
				.catch(() => !cancelled && setUsb(false));
		check();
		const timer = setInterval(check, 5000);
		return () => {
			cancelled = true;
			clearInterval(timer);
		};
	}, []);

	async function save(event: FormEvent) {
		event.preventDefault();
		if (!draft) return;
		setSaving(true);
		try {
			const payload = {
				...draft,
				password: draft.password || undefined,
				keyPath: draft.keyPath || undefined
			};
			const state = draft.id ? await updateDevice(draft.id, payload) : await createDevice(payload);
			setDraft(null);
			await use(state);
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setSaving(false);
		}
	}

	async function use(device: DeviceState) {
		activeDeviceId.set(device.id);
		try {
			await connectDevice(device.id);
			navigate('/library');
		} catch (error) {
			toast.error((error as Error).message);
		}
	}

	async function toggleConnection(device: DeviceState) {
		try {
			if (device.status === 'connected') await disconnectDevice(device.id);
			else await connectDevice(device.id);
		} catch (error) {
			toast.error((error as Error).message);
		}
	}

	function edit(device: DeviceState) {
		setDraft({
			id: device.id,
			name: device.name,
			host: device.host,
			port: device.port,
			username: device.username,
			password: '',
			keyPath: device.keyPath ?? '',
			autoRestart: device.autoRestart
		});
	}

	const field = 'app-input w-full h-8 px-3 rounded-full text-xs';
	const labelClass = 'block text-[0.6875rem] text-gray-400 dark:text-gray-600 mb-1';

	return (
		<div className="h-full flex flex-col">
			<PageHeader>
				<span className="page-title">Devices</span>
				<span className="ml-auto flex items-center gap-1.5 text-[0.6875rem] text-gray-400 dark:text-gray-600">
					<Icon name="usb" size={12} />
					{usb === null
						? 'Checking USB…'
						: usb
							? `Tablet on USB (${USB_HOST})`
							: 'No tablet on USB'}
				</span>
			</PageHeader>

			<div className="flex-1 min-h-0 overflow-y-auto scrollbar-hover">
				<div className="max-w-xl mx-auto w-full px-4 py-6 flex flex-col gap-6">
					{list.length > 0 && (
						<section>
							<h2 className="text-xs text-gray-400 dark:text-gray-600 mb-2">Saved devices</h2>
							<div className="flex flex-col gap-1">
								{list.map((device) => (
									<div
										key={device.id}
										className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl border ${
											device.id === active
												? 'border-gray-300 dark:border-white/15 bg-gray-50 dark:bg-white/3'
												: 'border-gray-200 dark:border-white/6'
										}`}
									>
										<span className={`status-dot ${device.status}`}></span>
										<div className="flex-1 min-w-0">
											<div className="text-xs font-medium text-gray-900 dark:text-white truncate">
												{device.name}
												{device.model && (
													<span className="ml-2 font-normal text-gray-400 dark:text-gray-600">
														{device.model}
													</span>
												)}
											</div>
											<div className="text-[0.6875rem] font-mono text-gray-400 dark:text-gray-600 truncate">
												{device.username}@{device.host}:{device.port}
												{device.status === 'error' && device.error && (
													<span className="ml-2 font-sans text-red-500">{device.error}</span>
												)}
											</div>
										</div>
										{device.status === 'connecting' && <Spinner size={12} />}
										<button
											className="app-button-ghost h-7 px-2 rounded-full text-xs"
											onClick={() => toggleConnection(device)}
										>
											{device.status === 'connected' ? 'Disconnect' : 'Connect'}
										</button>
										<button
											className="app-button-ghost flex items-center justify-center w-7 h-7 rounded-full"
											onClick={() => edit(device)}
											aria-label="Edit"
										>
											<Icon name="pencil" size={13} />
										</button>
										<button
											className="app-button-ghost flex items-center justify-center w-7 h-7 rounded-full"
											onClick={() => setRemoving(device)}
											aria-label="Remove"
										>
											<Icon name="trash" size={13} />
										</button>
										<button
											className="app-button h-7 px-3 rounded-full text-xs font-extrabold"
											onClick={() => use(device)}
										>
											Open
										</button>
									</div>
								))}
							</div>
						</section>
					)}

					{draft ? (
						<form onSubmit={save} className="flex flex-col gap-3">
							<div className="flex items-center justify-between">
								<h2 className="text-xs text-gray-400 dark:text-gray-600">
									{draft.id ? 'Edit device' : 'Add a device'}
								</h2>
								{usb && draft.host !== USB_HOST && (
									<button
										type="button"
										className="text-[0.6875rem] text-gray-500 hover:text-gray-900 dark:hover:text-white"
										onClick={() => setDraft({ ...draft, host: USB_HOST })}
									>
										Use USB address
									</button>
								)}
							</div>
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
								<div>
									<label className={labelClass}>Name</label>
									<input
										className={field}
										value={draft.name}
										placeholder="My reMarkable"
										onChange={(e) => setDraft({ ...draft, name: e.currentTarget.value })}
									/>
								</div>
								<div>
									<label className={labelClass}>Host</label>
									<input
										className={field}
										value={draft.host}
										placeholder={USB_HOST}
										required
										onChange={(e) => setDraft({ ...draft, host: e.currentTarget.value })}
									/>
								</div>
								<div>
									<label className={labelClass}>Username</label>
									<input
										className={field}
										value={draft.username}
										onChange={(e) => setDraft({ ...draft, username: e.currentTarget.value })}
									/>
								</div>
								<div>
									<label className={labelClass}>Port</label>
									<input
										className={field}
										type="number"
										min={1}
										max={65535}
										value={draft.port}
										onChange={(e) => setDraft({ ...draft, port: Number(e.currentTarget.value) })}
									/>
								</div>
								<div>
									<label className={labelClass}>Password</label>
									<input
										className={field}
										type="password"
										value={draft.password ?? ''}
										placeholder={draft.id ? 'Leave empty to keep' : 'From Settings > Help'}
										autoComplete="off"
										onChange={(e) => setDraft({ ...draft, password: e.currentTarget.value })}
									/>
								</div>
								<div>
									<label className={labelClass}>Private key path (optional)</label>
									<input
										className={field}
										value={draft.keyPath ?? ''}
										placeholder="~/.ssh/id_ed25519"
										onChange={(e) => setDraft({ ...draft, keyPath: e.currentTarget.value })}
									/>
								</div>
							</div>
							<p className="text-[0.6875rem] text-gray-400 dark:text-gray-600 leading-relaxed">
								The root password is under Settings › General › Help › Copyrights and licenses on
								the tablet. Over USB the tablet is always {USB_HOST}. Over wifi use the address
								shown in Settings › Wi-Fi. reMarkable Paper Pro needs developer mode enabled first.
							</p>
							<div className="flex justify-end gap-1.5">
								{list.length > 0 && (
									<button
										type="button"
										className="app-button-ghost h-8 px-3 rounded-full text-xs"
										onClick={() => setDraft(null)}
									>
										Cancel
									</button>
								)}
								<button
									type="submit"
									className="app-button h-8 px-4 rounded-full text-xs font-extrabold"
									disabled={saving || !draft.host.trim()}
								>
									{saving ? 'Connecting…' : draft.id ? 'Save and connect' : 'Add and connect'}
								</button>
							</div>
						</form>
					) : (
						<button
							className="flex items-center gap-2 h-10 px-4 rounded-2xl border border-dashed border-gray-300 dark:border-white/10 text-xs text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/3 transition-colors"
							onClick={() => setDraft(emptyDraft())}
						>
							<Icon name="plus" size={14} />
							Add a device
						</button>
					)}
				</div>
			</div>

			{removing && (
				<ConfirmDialog
					title={`Remove ${removing.name}?`}
					message="Only the saved connection is removed. Nothing changes on the tablet."
					confirmLabel="Remove"
					danger
					onconfirm={async () => {
						await deleteDevice(removing.id);
						if (activeDeviceId.get() === removing.id) activeDeviceId.set(null);
					}}
					onclose={() => setRemoving(null)}
				/>
			)}
		</div>
	);
}
