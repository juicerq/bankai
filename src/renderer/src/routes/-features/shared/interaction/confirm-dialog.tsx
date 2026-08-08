import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useMenuDismissal } from "@renderer/routes/-features/shared/menus/use-menu-dismissal";

export function ConfirmDialog({
	component,
	title,
	label,
	action,
	danger,
	onConfirm,
	onCancel,
	children,
}: {
	component: string;
	title: string;
	label: string;
	action: string;
	danger?: boolean;
	onConfirm: () => void;
	onCancel: () => void;
	children: ReactNode;
}) {
	const registerDismissal = useMenuDismissal(onCancel);

	return createPortal(
		<div
			className="picker-backdrop fixed inset-0 z-50 flex justify-center bg-surface-sunken/70 pt-[24vh]"
			onPointerDown={onCancel}
		>
			<div
				ref={registerDismissal}
				data-component={component}
				role="dialog"
				aria-label={label}
				className="picker-enter h-fit w-[420px] max-w-[90vw] border border-outline-strong bg-surface-raised shadow-2xl"
				onPointerDown={(event) => event.stopPropagation()}
			>
				<p className="border-outline border-b px-3 py-2.5 text-label text-secondary">{title}</p>
				<p data-slot="confirm-message" className="px-3 py-3 text-body text-primary">{children}</p>
				<div className="flex items-center justify-end gap-2 border-outline border-t px-3 py-2">
					<button
						type="button"
						data-slot="confirm-cancel"
						className="border border-outline px-2 py-1 text-label text-secondary hover:border-outline-strong hover:text-primary"
						onClick={onCancel}
					>
						CANCEL
					</button>
					<button
						type="button"
						data-slot="confirm-accept"
						className={danger
							? "border border-removed px-2 py-1 text-label text-removed hover:bg-removed hover:text-surface"
							: "border border-outline-strong px-2 py-1 text-label text-primary hover:bg-surface-hover"}
						onClick={onConfirm}
					>
						{action}
					</button>
				</div>
			</div>
		</div>,
		document.body,
	);
}
