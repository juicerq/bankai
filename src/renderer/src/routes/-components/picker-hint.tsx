export function PickerHint({ keys, label }: { keys: string[]; label: string }) {
	return (
		<span className="flex items-center gap-1.5">
			<PickerKeys keys={keys} />
			<span className="text-data text-secondary">{label}</span>
		</span>
	);
}

export function PickerKeys({ keys }: { keys: string[] }) {
	return keys.map((key) => (
		<kbd key={key} className="border border-outline px-1 py-0.5 text-label text-secondary">
			{key}
		</kbd>
	));
}
