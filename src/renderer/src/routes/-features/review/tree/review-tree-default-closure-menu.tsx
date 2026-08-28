import { ArrowPathIcon, CheckIcon } from "@heroicons/react/24/outline";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import type { ReviewClosedTarget } from "@shared/review-default-closure";
import { useMenuDismissal } from "@renderer/routes/-features/shared/menus/use-menu-dismissal";

export interface ReviewTreeDefaultClosureMenuState {
	target: ReviewClosedTarget;
	x: number;
	y: number;
}

export function ReviewTreeDefaultClosureMenu({
	menu,
	active,
	onClose,
	onSet,
}: {
	menu: ReviewTreeDefaultClosureMenuState;
	active: boolean;
	onClose: () => void;
	onSet: (target: ReviewClosedTarget, closed: boolean) => Promise<void>;
}) {
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string>();
	const registerMenuDismissal = useMenuDismissal(onClose);
	const attachMenu = useCallback((element: HTMLDivElement | null) => {
		if (element) {
			element.focus();
		}
		return registerMenuDismissal(element);
	}, [registerMenuDismissal]);
	const label = menu.target.kind === "file" ? "Close by default" : "Close files by default";

	return createPortal(
		<div
			ref={attachMenu}
			data-component="review-tree-default-closure-menu"
			role="menu"
			tabIndex={-1}
			aria-label={`Actions for ${menu.target.path}`}
			aria-busy={pending}
			className="fixed z-50 min-w-48 border border-outline-strong bg-surface-raised text-body shadow-lg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
			style={{
				left: Math.max(4, Math.min(menu.x, window.innerWidth - 196)),
				top: Math.max(4, Math.min(menu.y, window.innerHeight - 96)),
			}}
			onPointerDown={(event) => event.stopPropagation()}
		>
			<button
				type="button"
				role="menuitemcheckbox"
				aria-checked={active}
				disabled={pending}
				className="flex w-full items-center gap-2 px-3 py-2 text-left text-primary hover:bg-surface-hover disabled:text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
				onClick={async () => {
					setPending(true);
					setError(undefined);
					try {
						await onSet(menu.target, !active);
						onClose();
					} catch (cause) {
						setPending(false);
						setError(cause instanceof Error ? cause.message : "Could not save");
					}
				}}
			>
				<span className="flex size-4 shrink-0 items-center justify-center">
					{pending
						? <ArrowPathIcon className="size-3.5 animate-spin" aria-hidden="true" />
						: active && <CheckIcon className="size-4" aria-hidden="true" />}
				</span>
				{label}
			</button>
			{error && <p role="alert" className="border-outline border-t px-3 py-2 text-data text-removed">{error}</p>}
		</div>,
		document.body,
	);
}
