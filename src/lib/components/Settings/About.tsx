import { useStore } from '$lib/store';
import { appVersion } from '$lib/stores';
import Icon from '../Icon';
import { openExternal } from '$lib/desktop';
import { toast } from 'sonner';

const REPO_URL = 'https://github.com/mahiatlinux/remarkable-webui';

export default function About() {
	const version = useStore(appVersion);

	return (
		<div className="flex flex-col h-full">
			<h2 className="text-sm text-gray-900 dark:text-white mb-4">About</h2>
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
			<p className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 mt-4">
				Built by Maheswar with
				<Icon name="heart" size={12} class="text-red-500" />
			</p>
			<a
				href={REPO_URL}
				onClick={(event) => {
					event.preventDefault();
					void openExternal(REPO_URL).catch((error: Error) => toast.error(error.message));
				}}
				target="_blank"
				rel="noopener"
				className="app-button-ghost inline-flex items-center gap-1.5 h-7 px-3 mt-3 rounded-full border text-xs self-start"
			>
				<Icon name="github" size={13} />
				GitHub
			</a>
		</div>
	);
}
