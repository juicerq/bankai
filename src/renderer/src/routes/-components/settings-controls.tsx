import type { ReactNode } from "react";

export function Setting({
	title,
	description,
	slot,
	on,
	onToggle,
	children,
}: {
	title: string;
	description: string;
	slot: string;
	on: boolean;
	onToggle: () => void;
	children?: ReactNode;
}) {
	return (
		<div className="px-3 py-3">
			<div className="flex items-start gap-3">
				<div className="min-w-0 flex-1">
					<span className="block text-body text-primary">{title}</span>
					<span className="mt-1 block text-data text-secondary">{description}</span>
				</div>
				<Switch label={title} slot={slot} on={on} onToggle={onToggle} />
			</div>
			{children && (
				<div className="mt-3">
					{children}
				</div>
			)}
		</div>
	);
}

export function Switch({
	label,
	slot,
	on,
	onToggle,
}: {
	label: string;
	slot: string;
	on: boolean;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={on}
			aria-label={label}
			data-slot={slot}
			className={`flex h-4 w-7 shrink-0 items-center border p-[2px] ${
				on ? "border-tertiary justify-end" : "border-outline-strong justify-start"
			}`}
			onClick={onToggle}
		>
			<span className={`size-2.5 ${on ? "bg-tertiary" : "bg-outline-strong"}`} aria-hidden="true" />
		</button>
	);
}
