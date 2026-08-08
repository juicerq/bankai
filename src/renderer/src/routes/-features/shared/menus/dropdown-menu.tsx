import { CheckIcon, ChevronDownIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMenuDismissal } from "@renderer/routes/-features/shared/menus/use-menu-dismissal";

const MENU_MIN_WIDTH = 280;
const MENU_MAX_HEIGHT = 320;
const MENU_MARGIN = 4;
const MENU_BORDER = 1;
const REMOVE_CONFIRM_MS = 1000;

const TRIGGER_SHAPE = {
	header: "h-full border-outline border-r px-3",
	field: "w-full border border-outline bg-surface px-2 py-1.5",
} as const;

const TRIGGER_OPEN = {
	header: "bg-surface-active text-primary",
	field: "border-tertiary text-primary",
} as const;

const TRIGGER_CLOSED = {
	header: "text-secondary hover:bg-surface-hover hover:text-primary",
	field: "text-primary hover:border-outline-strong",
} as const;

export function DropdownMenu({
	component,
	variant = "header",
	icon,
	label,
	ariaLabel,
	title,
	truncate = false,
	badge,
	pinned,
	children,
}: {
	component: string;
	variant?: keyof typeof TRIGGER_SHAPE;
	icon: ReactNode;
	label: string;
	ariaLabel: string;
	title?: string;
	truncate?: boolean;
	badge?: ReactNode;
	pinned?: ReactNode;
	children: ReactNode;
}) {
	const [menu, setMenu] = useState<{ x: number; y: number; width: number }>();
	const closeMenu = useCallback(() => setMenu(undefined), []);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const registerMenuDismissal = useMenuDismissal(closeMenu, triggerRef);

	const trigger = `flex items-center gap-2 text-body ${TRIGGER_SHAPE[variant]} ${
		truncate ? "min-w-0 shrink" : "shrink-0"
	} ${menu ? TRIGGER_OPEN[variant] : TRIGGER_CLOSED[variant]}`;

	return (
		<>
			<button
				type="button"
				ref={triggerRef}
				data-component={component}
				className={trigger}
				aria-haspopup="menu"
				aria-expanded={!!menu}
				aria-label={ariaLabel}
				title={title ?? ariaLabel}
				onClick={(event) => {
					if (menu) {
						closeMenu();
						return;
					}

					const rect = event.currentTarget.getBoundingClientRect();
					setMenu({
						x: rect.left - MENU_BORDER,
						y: rect.bottom,
						width: Math.max(MENU_MIN_WIDTH, Math.round(rect.width) + MENU_BORDER * 2),
					});
				}}
			>
				{icon}
				<span className="min-w-0 flex-1 truncate text-left">{label}</span>
				{badge}
				<ChevronDownIcon
					data-slot="chevron"
					aria-hidden="true"
					className={`size-3 shrink-0 transition-transform duration-150 ease-out motion-reduce:transition-none ${
						menu ? "-rotate-180" : ""
					}`}
				/>
			</button>
			{menu && createPortal(
				<div
					ref={registerMenuDismissal}
					data-component={`${component}-menu`}
					role="menu"
					aria-label={ariaLabel}
					className="fixed z-50 flex flex-col border border-outline-strong bg-surface-raised text-body shadow-lg"
					style={{
						left: Math.max(MENU_MARGIN, Math.min(menu.x, window.innerWidth - menu.width - MENU_MARGIN)),
						top: Math.min(menu.y, window.innerHeight - MENU_MAX_HEIGHT),
						width: menu.width,
						maxHeight: MENU_MAX_HEIGHT,
					}}
					onPointerDown={(event) => event.stopPropagation()}
					onClick={closeMenu}
				>
					{pinned && (
						<div role="presentation" data-slot="pinned" className="shrink-0">
							{pinned}
						</div>
					)}
					<div role="presentation" className="min-h-0 overflow-auto">
						{children}
					</div>
				</div>,
				document.body,
			)}
		</>
	);
}

export function DropdownMenuItem({
	label,
	detail,
	detailTone,
	selected,
	signal,
	remove,
	onClick,
}: {
	label: string;
	detail?: string;
	detailTone?: "danger";
	selected?: boolean;
	signal?: { title: string; className: string };
	remove?: { label: string; onConfirm: () => void };
	onClick: () => void;
}) {
	return (
		<div className={`group flex items-center ${selected ? "bg-surface-active" : "hover:bg-surface-hover"}`}>
			<button
				type="button"
				role={selected === undefined ? "menuitem" : "menuitemradio"}
				aria-checked={selected}
				className="flex min-w-0 flex-1 items-center py-2 pl-3 text-left"
				onClick={onClick}
			>
				<span className="min-w-0 flex-1">
					<span className="block truncate text-body text-primary">{label}</span>
					{detail !== undefined && (
						<span
							title={detail}
							className={`block truncate text-data ${detailTone === "danger" ? "text-removed" : "text-secondary"}`}
						>
							{detail}
						</span>
					)}
				</span>
			</button>
			<span className="relative flex w-6 shrink-0 self-stretch items-center justify-center">
				{signal && (
					<span
						data-slot="signal"
						title={signal.title}
						className={`size-1.5 rounded-full ${signal.className} ${remove ? "group-hover:opacity-0" : ""}`}
						aria-hidden="true"
					/>
				)}
				{remove && <DropdownMenuRemove label={remove.label} onConfirm={remove.onConfirm} />}
			</span>
		</div>
	);
}

function DropdownMenuRemove({ label, onConfirm }: { label: string; onConfirm: () => void }) {
	const [armed, setArmed] = useState(false);
	const disarm = useRef<{ timer?: ReturnType<typeof setTimeout> }>({});
	const action = armed ? `Confirm: ${label}` : label;

	return (
		<button
			type="button"
			data-slot="remove"
			aria-label={action}
			title={action}
			className={`absolute inset-0 flex items-center justify-center opacity-0 focus-visible:opacity-100 group-hover:opacity-100 ${
				armed ? "text-removed opacity-100" : "text-secondary hover:text-primary"
			}`}
			onClick={(event) => {
				event.stopPropagation();
				clearTimeout(disarm.current.timer);
				if (armed) {
					setArmed(false);
					onConfirm();
					return;
				}

				setArmed(true);
				disarm.current.timer = setTimeout(() => setArmed(false), REMOVE_CONFIRM_MS);
			}}
		>
			{armed ? <CheckIcon className="size-4" /> : <XMarkIcon className="size-4" />}
		</button>
	);
}

export function DropdownMenuSeparator() {
	return <div className="border-outline border-t" />;
}
