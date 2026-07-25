import { type ReactNode, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useMenuDismissal } from "@renderer/routes/-utils/use-menu-dismissal";

const MENU_WIDTH = 280;
const MENU_MAX_HEIGHT = 320;
const MENU_MARGIN = 4;

export function HeaderMenu({
	component,
	icon,
	label,
	ariaLabel,
	title,
	align = "start",
	truncate = false,
	children,
}: {
	component: string;
	icon: ReactNode;
	label?: string;
	ariaLabel: string;
	title?: string;
	align?: "start" | "end";
	truncate?: boolean;
	children: ReactNode;
}) {
	const [menu, setMenu] = useState<{ x: number; y: number }>();
	const closeMenu = useCallback(() => setMenu(undefined), []);
	const registerMenuDismissal = useMenuDismissal(closeMenu);

	const trigger = label === undefined
		? `-m-1 shrink-0 p-1 ${menu ? "text-primary" : "text-secondary hover:text-primary"}`
		: `flex h-full items-center gap-2 border-outline border-r px-3 text-body ${
			truncate ? "min-w-0 shrink" : "shrink-0"
		} ${menu ? "bg-surface-active text-primary" : "text-secondary hover:bg-surface-hover hover:text-primary"}`;

	return (
		<>
			<button
				type="button"
				data-component={component}
				className={trigger}
				aria-haspopup="menu"
				aria-expanded={!!menu}
				aria-label={ariaLabel}
				title={title ?? ariaLabel}
				onPointerDown={(event) => event.stopPropagation()}
				onClick={(event) => {
					if (menu) {
						closeMenu();
						return;
					}

					const rect = event.currentTarget.getBoundingClientRect();
					setMenu({ x: align === "end" ? rect.right - MENU_WIDTH : rect.left, y: rect.bottom });
				}}
			>
				{icon}
				{label !== undefined && <span className="truncate">{label}</span>}
			</button>
			{menu && createPortal(
				<div
					ref={registerMenuDismissal}
					data-component={`${component}-menu`}
					role="menu"
					aria-label={ariaLabel}
					className="fixed z-50 overflow-auto border border-outline-strong bg-surface-raised text-body shadow-lg"
					style={{
						left: Math.max(MENU_MARGIN, Math.min(menu.x, window.innerWidth - MENU_WIDTH - MENU_MARGIN)),
						top: Math.min(menu.y, window.innerHeight - MENU_MAX_HEIGHT),
						width: MENU_WIDTH,
						maxHeight: MENU_MAX_HEIGHT,
					}}
					onPointerDown={(event) => event.stopPropagation()}
					onClick={closeMenu}
				>
					{children}
				</div>,
				document.body,
			)}
		</>
	);
}

export function HeaderMenuItem({
	label,
	detail,
	selected,
	live,
	onClick,
}: {
	label: string;
	detail?: string;
	selected?: boolean;
	live?: { title: string };
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			role={selected === undefined ? "menuitem" : "menuitemradio"}
			aria-checked={selected}
			className={`flex w-full items-center gap-2 px-3 py-2 text-left ${
				selected ? "bg-surface-active" : "hover:bg-surface-hover"
			}`}
			onClick={onClick}
		>
			<span className="min-w-0 flex-1">
				<span className="block truncate text-body text-primary">{label}</span>
				{detail !== undefined && <span className="block truncate text-data text-secondary">{detail}</span>}
			</span>
			{live && (
				<span
					data-slot="live"
					title={live.title}
					className="size-1.5 shrink-0 rounded-full bg-tertiary"
					aria-hidden="true"
				/>
			)}
		</button>
	);
}

export function HeaderMenuGroup({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div role="group" aria-label={label}>
			<span aria-hidden="true" className="block px-3 pt-2.5 pb-1 text-label text-secondary uppercase">
				{label}
			</span>
			{children}
		</div>
	);
}

export function HeaderMenuSeparator() {
	return <div className="border-outline border-t" />;
}
