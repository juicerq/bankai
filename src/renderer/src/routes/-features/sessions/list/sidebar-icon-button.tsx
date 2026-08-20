import type { ReactNode, Ref } from "react";

const SIDEBAR_ICON_BUTTON =
	"flex h-full w-8 shrink-0 items-center justify-center border-outline border-l focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function SidebarIconButton({
	slot,
	label,
	title,
	disabled = false,
	active = false,
	expanded,
	buttonRef,
	onClick,
	children,
}: {
	slot: string;
	label: string;
	title?: string;
	disabled?: boolean;
	active?: boolean;
	expanded?: boolean;
	buttonRef?: Ref<HTMLButtonElement>;
	onClick: (event: { altKey: boolean }) => void;
	children: ReactNode;
}) {
	const tone = active
		? "bg-surface-active text-primary"
		: "text-secondary hover:bg-surface-hover hover:text-primary disabled:bg-transparent disabled:text-outline-strong";

	return (
		<button
			type="button"
			ref={buttonRef}
			data-slot={slot}
			className={`${SIDEBAR_ICON_BUTTON} ${tone}`}
			disabled={disabled}
			aria-label={label}
			aria-haspopup={expanded === undefined ? undefined : "menu"}
			aria-expanded={expanded}
			title={title ?? label}
			onClick={(event) => onClick(event)}
		>
			{children}
		</button>
	);
}
