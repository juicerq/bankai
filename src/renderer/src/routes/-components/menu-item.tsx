export function MenuItem({
	label,
	onClick,
	danger = false,
}: {
	label: string;
	onClick: () => void;
	danger?: boolean;
}) {
	return (
		<button
			type="button"
			role="menuitem"
			className={`block w-full px-3 py-2 text-left hover:bg-surface-hover ${danger ? "text-removed" : "text-primary"}`}
			onClick={onClick}
		>
			{label}
		</button>
	);
}
