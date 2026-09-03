import { useState } from 'react';
import Icon from './Icon';
import Modal from './Modal';
import General from './Settings/General';
import Appearance from './Settings/Appearance';
import Devices from './Settings/Devices';

export type SettingsTab = 'general' | 'appearance' | 'devices';

interface Props {
	onclose: () => void;
	initialTab?: SettingsTab;
}

const TABS: { id: SettingsTab; label: string; icon: string }[] = [
	{ id: 'general', label: 'General', icon: 'settings' },
	{ id: 'appearance', label: 'Appearance', icon: 'sun-light' },
	{ id: 'devices', label: 'Devices', icon: 'tablet' }
];

export default function SettingsModal({ onclose, initialTab = 'general' }: Props) {
	const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

	return (
		<Modal
			onclose={onclose}
			class="w-full max-w-2xl mx-4 md:mx-0 flex flex-col md:flex-row max-h-[78vh] md:h-[30rem] lg:h-[32rem]"
		>
			<nav className="shrink-0 min-w-0 md:min-h-0 overflow-x-auto md:overflow-x-hidden md:overflow-y-auto scrollbar-none border-b md:border-b-0 md:border-r border-gray-200 dark:border-white/6 md:w-[11.25rem]">
				<div className="flex w-max min-w-full md:w-auto md:min-w-0 md:flex-col p-1 gap-px">
					<button
						className="flex items-center gap-1.5 h-7 px-2 md:w-full shrink-0 rounded-full text-xs text-gray-400 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-75 md:mb-1"
						onClick={onclose}
					>
						<Icon name="chevron-left" size={12} />
						<span>Back</span>
					</button>

					{TABS.map((tab) => (
						<button
							key={tab.id}
							className={`flex items-center gap-1.5 h-7 px-2 md:w-full shrink-0 rounded-full text-xs text-left transition-colors duration-75
								${
									activeTab === tab.id
										? 'font-medium text-gray-900 dark:text-white bg-gray-100 dark:bg-white/6'
										: 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
								}`}
							onClick={() => setActiveTab(tab.id)}
						>
							<Icon name={tab.icon} size={14} /> {tab.label}
						</button>
					))}
				</div>
			</nav>

			<div className="flex-1 overflow-y-auto scrollbar-none min-h-0 p-4 md:px-5">
				{activeTab === 'general' && <General />}
				{activeTab === 'appearance' && <Appearance />}
				{activeTab === 'devices' && <Devices />}
			</div>
		</Modal>
	);
}
