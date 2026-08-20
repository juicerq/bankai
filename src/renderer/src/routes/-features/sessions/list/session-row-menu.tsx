import { createPortal } from "react-dom";
import { MenuItem } from "@renderer/routes/-features/shared/menus/menu-item";
import type { SessionRow } from "@renderer/routes/-features/sessions/list/session-rows";
import { useMenuDismissal } from "@renderer/routes/-features/shared/menus/use-menu-dismissal";

export interface SessionMenu {
	row: SessionRow;
	archived: boolean;
	x: number;
	y: number;
}

const MENU_WIDTH = 216;
const MENU_HEIGHT = 140;

export function SessionRowMenu({
	menu,
	onClose,
	onCreate,
	onRename,
	onTogglePin,
	onArchive,
	onUnarchive,
	onCloseSession,
}: {
	menu: SessionMenu;
	onClose: () => void;
	onCreate: (projectId: string) => void;
	onRename: (shellId: string) => void;
	onTogglePin: (row: SessionRow) => void;
	onArchive: (projectId: string, shellId: string) => void;
	onUnarchive: (projectId: string, shellId: string) => void;
	onCloseSession: (projectId: string, shellId: string) => void;
}) {
	const registerMenuDismissal = useMenuDismissal(onClose);

	const act = (action: () => void) => () => {
		onClose();
		action();
	};

	return createPortal(
		<div
			ref={registerMenuDismissal}
			data-component="session-row-menu"
			role="menu"
			aria-label={`Actions for ${menu.row.title}`}
			className="fixed z-50 min-w-52 border border-outline-strong bg-surface-raised text-body shadow-lg"
			style={{
				left: Math.min(menu.x, window.innerWidth - MENU_WIDTH),
				top: Math.min(menu.y, window.innerHeight - MENU_HEIGHT),
			}}
			onPointerDown={(event) => event.stopPropagation()}
		>
			<MenuItem label="New shell in this project" onClick={act(() => onCreate(menu.row.projectId))} />
			<MenuItem label="Rename" onClick={act(() => onRename(menu.row.shellId))} />
			{!menu.archived && (
				<MenuItem
					label={menu.row.pinnedAt === undefined ? "Pin" : "Unpin"}
					onClick={act(() => onTogglePin(menu.row))}
				/>
			)}
			{menu.archived
				? (
					<MenuItem
						label="Unarchive"
						onClick={act(() => onUnarchive(menu.row.projectId, menu.row.shellId))}
					/>
				)
				: (
					<MenuItem
						label="Archive"
						onClick={act(() => onArchive(menu.row.projectId, menu.row.shellId))}
					/>
				)}
			<div className="border-outline border-t" />
			<MenuItem
				label="Close"
				danger
				onClick={act(() => onCloseSession(menu.row.projectId, menu.row.shellId))}
			/>
		</div>,
		document.body,
	);
}
