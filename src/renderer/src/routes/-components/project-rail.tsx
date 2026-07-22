import { PlusIcon } from "@heroicons/react/24/outline";
import { useCallback, useState } from "react";
import type { Project } from "@main/store/projects";
import { type DragReorder, useDragReorder } from "@renderer/routes/-utils/use-drag-reorder";

export function ProjectRail({
	projects,
	loading,
	selectedId,
	onSelect,
	onPrepare,
	onAdd,
	onOpenDirectory,
	onRemove,
	onMove,
	adding,
	addFailed,
}: {
	projects: Project[];
	loading: boolean;
	selectedId: string | undefined;
	onSelect: (projectId: string) => void;
	onPrepare: (projectId: string) => void;
	onAdd: () => void;
	onOpenDirectory: (projectId: string) => void;
	onRemove: (projectId: string) => void;
	onMove: (data: { projectId: string; toIndex: number }) => void;
	adding: boolean;
	addFailed: boolean;
}) {
	const drag = useDragReorder(
		projects.map((project) => project.id),
		(data) => onMove({ projectId: data.id, toIndex: data.toIndex }),
	);

	return (
		<aside className="flex min-h-0 w-rail shrink-0 flex-col border-r border-outline bg-surface-raised">
			<h1 className="m-0 flex h-header shrink-0 items-center justify-between border-b border-outline px-3 text-label">
				<span className="flex items-center gap-2">
					<svg viewBox="268 88 488 854" className="h-5 w-auto fill-tertiary" aria-hidden="true">
						<path d="M512 88 C556 88 588 106 606 142 C596 184 558 200 546 248 L554 396 L724 396 C742 392 756 406 756 427 C756 448 742 462 724 458 L598 458 C572 622 542 784 512 942 C482 784 452 622 426 458 L300 458 C282 462 268 448 268 427 C268 406 282 392 300 396 L470 396 L478 248 C466 200 428 184 418 142 C436 106 468 88 512 88 Z" />
					</svg>
					<span>BANKAI</span>
				</span>
				{import.meta.env.DEV && (
					<span className="border border-outline-strong px-1.5 py-0.5 text-secondary">DEV</span>
				)}
			</h1>
			<div className="flex items-center justify-between border-outline border-b px-3 py-2 text-label text-secondary">
				<span>PROJECTS</span>
				<button
					type="button"
					className="text-secondary hover:text-primary disabled:opacity-50"
					disabled={adding}
					onClick={onAdd}
					aria-label={adding ? "Opening project picker" : "Add project"}
				>
					<PlusIcon className="size-4" aria-hidden="true" />
				</button>
			</div>
			{addFailed && (
				<div className="px-3 py-2 text-data text-removed">
					Picker failed.{" "}
					<button type="button" className="text-primary underline" onClick={onAdd}>
						Retry
					</button>
				</div>
			)}
			<nav className="min-h-0 flex-1 overflow-auto" aria-label="Projects">
				{loading && <div className="p-3 text-data text-secondary">Loading workspace...</div>}
				{projects.map((project) => (
					<ProjectRailItem
						key={project.id}
						project={project}
						selected={selectedId === project.id}
						drag={drag}
						onSelect={onSelect}
						onPrepare={onPrepare}
						onOpenDirectory={onOpenDirectory}
						onRemove={onRemove}
					/>
				))}
			</nav>
		</aside>
	);
}

function ProjectRailItem({
	project,
	selected,
	drag,
	onSelect,
	onPrepare,
	onOpenDirectory,
	onRemove,
}: {
	project: Project;
	selected: boolean;
	drag: DragReorder;
	onSelect: (projectId: string) => void;
	onPrepare: (projectId: string) => void;
	onOpenDirectory: (projectId: string) => void;
	onRemove: (projectId: string) => void;
}) {
	const [menuPosition, setMenuPosition] = useState<{ x: number; y: number }>();
	const dropEdge = drag.dropEdge(project.id);
	const registerMenuDismissal = useCallback(() => {
		const close = () => setMenuPosition(undefined);
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				close();
			}
		};

		window.addEventListener("pointerdown", close);
		window.addEventListener("blur", close);
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("pointerdown", close);
			window.removeEventListener("blur", close);
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, []);

	return (
		<>
			<button
				type="button"
				aria-current={selected ? "page" : undefined}
				aria-pressed={selected}
				className={`relative flex w-full items-center gap-3 px-3 py-[9px] text-left ${
					selected ? "bg-surface-active" : "hover:bg-surface-hover"
				}`}
				{...drag.itemProps(project.id)}
				onPointerEnter={() => onPrepare(project.id)}
				onFocus={() => onPrepare(project.id)}
				onClick={() => onSelect(project.id)}
				onContextMenu={(event) => {
					event.preventDefault();
					setMenuPosition({ x: event.clientX, y: event.clientY });
				}}
			>
				{selected && <span className="absolute inset-y-0 left-0 w-0.5 bg-tertiary" aria-hidden="true" />}
				{dropEdge && (
					<span
						className={`absolute inset-x-0 h-0.5 bg-tertiary ${dropEdge === "before" ? "top-0" : "bottom-0"}`}
					/>
				)}
				<span className="min-w-0">
					<span className="block truncate text-body text-primary">{project.name}</span>
					<span className="block truncate text-data text-secondary">{project.path}</span>
				</span>
			</button>
			{menuPosition && (
				<div
					ref={registerMenuDismissal}
					role="menu"
					aria-label={`Actions for ${project.name}`}
					className="fixed z-50 min-w-44 border border-outline-strong bg-surface-raised text-body shadow-lg"
					style={{ left: Math.min(menuPosition.x, window.innerWidth - 184), top: Math.min(menuPosition.y, window.innerHeight - 112) }}
					onPointerDown={(event) => event.stopPropagation()}
				>
					<ProjectMenuItem label="Open folder" onClick={() => {
						setMenuPosition(undefined);
						onOpenDirectory(project.id);
					}} />
					<ProjectMenuItem label="Copy path" onClick={() => {
						setMenuPosition(undefined);
						void navigator.clipboard.writeText(project.path);
					}} />
					<div className="border-outline border-t" />
					<ProjectMenuItem
						label="Remove from list"
						danger
						onClick={() => {
							setMenuPosition(undefined);
							onRemove(project.id);
						}}
					/>
				</div>
			)}
		</>
	);
}

function ProjectMenuItem({ label, onClick, danger = false }: { label: string; onClick: () => void; danger?: boolean }) {
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
