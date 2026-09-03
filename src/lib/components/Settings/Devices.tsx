import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useStore } from '$lib/store';
import { activeDeviceId, devices } from '$lib/stores';
import { deleteDevice } from '$lib/apis/devices';
import Icon from '../Icon';

export default function Devices() {
	const navigate = useNavigate();
	const list = useStore(devices);
	const active = useStore(activeDeviceId);

	async function remove(id: string) {
		try {
			await deleteDevice(id);
			if (activeDeviceId.get() === id) activeDeviceId.set(null);
		} catch (error) {
			toast.error((error as Error).message);
		}
	}

	return (
		<div className="flex flex-col h-full">
			<div className="flex items-center justify-between mb-4">
				<h2 className="text-sm text-gray-900 dark:text-white">Devices</h2>
				<button
					className="text-[0.625rem] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors duration-100"
					onClick={() => navigate('/devices')}
				>
					Add or edit
				</button>
			</div>
			{list.length === 0 ? (
				<p className="text-[0.8125rem] text-gray-500">No devices saved yet.</p>
			) : (
				<div className="flex flex-col gap-1">
					{list.map((device) => (
						<div
							key={device.id}
							className="flex items-center gap-2 h-9 px-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5"
						>
							<Icon name="tablet" size={14} class="app-icon-muted" />
							<div className="flex-1 min-w-0">
								<div className="text-xs text-gray-900 dark:text-white truncate">
									{device.name}
									{device.id === active && (
										<span className="ml-1.5 text-[0.625rem] text-gray-400">active</span>
									)}
								</div>
								<div className="text-[0.6875rem] text-gray-400 dark:text-gray-600 font-mono truncate">
									{device.username}@{device.host}:{device.port}
								</div>
							</div>
							<button
								className="app-button-ghost flex items-center justify-center w-6 h-6 rounded-full"
								onClick={() => activeDeviceId.set(device.id)}
								aria-label="Use device"
								disabled={device.id === active}
							>
								<Icon name="check" size={12} />
							</button>
							<button
								className="app-button-ghost flex items-center justify-center w-6 h-6 rounded-full"
								onClick={() => remove(device.id)}
								aria-label="Remove device"
							>
								<Icon name="trash" size={12} />
							</button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
