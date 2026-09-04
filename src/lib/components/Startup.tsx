import { useEffect, useState, type ReactNode } from 'react';
import { initializeDesktop } from '$lib/desktop';
import Icon from './Icon';

export default function Startup({ children }: { children: ReactNode }) {
	const [ready, setReady] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [attempt, setAttempt] = useState(0);
	useEffect(() => {
		let disposed = false;
		setError(null);
		void initializeDesktop()
			.then(() => !disposed && setReady(true))
			.catch((error: unknown) => !disposed && setError(String(error)));
		return () => {
			disposed = true;
		};
	}, [attempt]);
	if (ready) return children;
	return (
		<div className="startup-screen">
			<Icon name="tablet" size={32} />
			<h1>reMarkable</h1>
			<p role="status">{error ?? 'Opening your workspace…'}</p>
			{error && (
				<button className="app-button" onClick={() => setAttempt((value) => value + 1)}>
					Try again
				</button>
			)}
		</div>
	);
}
