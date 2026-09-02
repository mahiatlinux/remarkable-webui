import { useSyncExternalStore } from 'react';

export interface Readable<T> {
	subscribe(run: (value: T) => void): () => void;
	get(): T;
}

export interface Writable<T> extends Readable<T> {
	set(value: T): void;
	update(fn: (value: T) => T): void;
}

function changed(a: unknown, b: unknown): boolean {
	return a !== a
		? b === b
		: a !== b || (a !== null && typeof a === 'object') || typeof a === 'function';
}

export function writable<T>(initial: T): Writable<T> {
	let value = initial;
	const subscribers = new Set<(value: T) => void>();
	const set = (next: T) => {
		if (!changed(value, next)) return;
		value = next;
		for (const run of subscribers) run(value);
	};
	return {
		subscribe(run) {
			subscribers.add(run);
			run(value);
			return () => {
				subscribers.delete(run);
			};
		},
		get: () => value,
		set,
		update: (fn) => set(fn(value))
	};
}

export function useStore<T>(store: Readable<T>): T {
	return useSyncExternalStore(
		(onChange) => store.subscribe(onChange),
		() => store.get()
	);
}
