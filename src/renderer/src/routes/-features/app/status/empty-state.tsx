export function EmptyState({
	mark,
	title,
	description,
	actionLabel,
	onAction,
}: {
	mark: string;
	title: string;
	description: string;
	actionLabel: string;
	onAction: () => void;
}) {
	return (
		<div className="m-auto text-center">
			<span className="text-secondary text-title">{mark}</span>
			<h2 className="mt-3 mb-2 text-title">{title}</h2>
			<p className="text-secondary text-support">{description}</p>
			<button
				type="button"
				className="mt-3 bg-primary px-3 py-2 text-label text-surface"
				onClick={onAction}
			>
				{actionLabel}
			</button>
		</div>
	);
}
