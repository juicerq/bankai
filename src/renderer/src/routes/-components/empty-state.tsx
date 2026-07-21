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
		<div className="empty-state">
			<span className="empty-state-mark">{mark}</span>
			<h2>{title}</h2>
			<p>{description}</p>
			<button type="button" onClick={onAction}>
				{actionLabel}
			</button>
		</div>
	);
}
