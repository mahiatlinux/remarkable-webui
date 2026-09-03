import { toast } from 'sonner';
import { useStore } from '$lib/store';
import {
	activeDeviceId,
	appVersion,
	devices,
	libraryView,
	showThumbnails,
	type LibraryView
} from '$lib/stores';
import { updateDevice } from '$lib/apis/devices';
import ToggleSwitch from '../common/ToggleSwitch';

export default function General() {
	const version = useStore(appVersion);
	const view = useStore(libraryView);
	const thumbnails = useStore(showThumbnails);
	const list = useStore(devices);
	const active = useStore(activeDeviceId);
	const current = list.find((device) => device.id === active);

	function setAutoRestart(value: boolean) {
		if (!current) return;
		updateDevice(current.id, { autoRestart: value }).catch((error: Error) =>
			toast.error(error.message)
		);
	}

	return (
		<div className="flex flex-col h-full">
			<div className="flex-1 min-h-0 overflow-y-auto scrollbar-hover pr-1.5 -mr-1.5">
				<h2 className="text-sm text-gray-900 dark:text-white mb-4">General</h2>

				<div className="mb-5">
					<div className="flex items-baseline gap-2">
						<span className="text-xs font-semibold text-gray-900 dark:text-white">
							reMarkable WebUI
						</span>
						<span className="text-[0.6875rem] text-gray-400 dark:text-gray-600 font-mono">
							v{version}
						</span>
					</div>
					<p className="text-[0.8125rem] text-gray-500 mt-0.5">
						Local web interface for reMarkable paper tablets over SSH.
					</p>
				</div>

				<h3 className="text-xs text-gray-400 dark:text-gray-600 mb-2">Library</h3>
				<div className="flex gap-1">
					{[
						{ value: 'grid' as LibraryView, label: 'Grid' },
						{ value: 'list' as LibraryView, label: 'List' }
					].map((opt) => (
						<button
							key={opt.value}
							className={`flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs transition-colors duration-100
							${
								view === opt.value
									? 'bg-gray-200/50 dark:bg-white/8 text-gray-900 dark:text-white font-medium'
									: 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
							}`}
							onClick={() => libraryView.set(opt.value)}
						>
							{opt.label}
						</button>
					))}
				</div>
				<label className="flex items-center justify-between cursor-pointer mt-3">
					<span className="text-xs text-gray-600 dark:text-gray-400">Show page thumbnails</span>
					<ToggleSwitch value={thumbnails} onchange={(value) => showThumbnails.set(value)} />
				</label>
				<p className="text-[0.6875rem] text-gray-400 dark:text-gray-600 mt-1">
					Thumbnails are read from the tablet on demand. Turn this off on slow connections.
				</p>

				{current && (
					<>
						<h3 className="text-xs text-gray-400 dark:text-gray-600 mb-2 mt-5">{current.name}</h3>
						<label className="flex items-center justify-between cursor-pointer">
							<span className="text-xs text-gray-600 dark:text-gray-400">
								Restart xochitl automatically after changes
							</span>
							<ToggleSwitch value={current.autoRestart} onchange={setAutoRestart} />
						</label>
						<p className="text-[0.6875rem] text-gray-400 dark:text-gray-600 mt-1">
							The tablet only notices renamed, moved or uploaded documents after its interface
							restarts. The restart takes a few seconds and closes the open notebook.
						</p>
					</>
				)}
			</div>
		</div>
	);
}
