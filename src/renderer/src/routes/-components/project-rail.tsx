import { useEffect, useState } from "react";
import type { Project } from "@main/store/projects";

export function ProjectRail({
	projects,
	loading,
	selectedId,
	onSelect,
	onAdd,
	onOpenDirectory,
	onRemove,
	adding,
	addFailed,
}: {
	projects: Project[];
	loading: boolean;
	selectedId: string | undefined;
	onSelect: (projectId: string) => void;
	onAdd: () => void;
	onOpenDirectory: (projectId: string) => void;
	onRemove: (projectId: string) => void;
	adding: boolean;
	addFailed: boolean;
}) {
	return (
		<aside className="flex min-h-0 w-rail shrink-0 flex-col border-r border-outline bg-surface-raised">
			<h1 className="m-0 flex h-header shrink-0 items-center gap-2 border-b border-outline px-3 text-label">
				<span className="text-tertiary text-title leading-none">卍</span>
				<span>BANKAI</span>
			</h1>
			<div className="border-outline border-b px-3 py-2 text-label text-secondary">Projects</div>
			<nav className="min-h-0 flex-1 overflow-auto" aria-label="Projects">
				{loading && <div className="p-3 text-data text-secondary">Loading workspace...</div>}
				{projects.map((project) => (
					<ProjectRailItem
						key={project.id}
						project={project}
						selected={selectedId === project.id}
						onSelect={onSelect}
						onOpenDirectory={onOpenDirectory}
						onRemove={onRemove}
					/>
				))}
			</nav>
			<button
				type="button"
				className="mx-3 my-2 border border-outline-strong border-dashed p-2 text-left text-secondary text-support hover:border-primary hover:text-primary"
				disabled={adding}
				onClick={onAdd}
			>
				<span className="mr-2">+</span>
				{adding && "Opening..."}
				{!adding && "Add project"}
			</button>
			{addFailed && (
				<div className="px-3 pb-2 text-data text-removed">
					Picker failed.{" "}
					<button type="button" className="text-primary underline" onClick={onAdd}>
						Retry
					</button>
				</div>
			)}
			<footer className="mt-auto flex shrink-0 items-center gap-2 border-outline border-t px-3 py-3 text-data text-secondary">
				<span className="size-2 shrink-0 rounded-full bg-tertiary" /> Local sessions
			</footer>
		</aside>
	);
}

function ProjectRailItem({
	project,
	selected,
	onSelect,
	onOpenDirectory,
	onRemove,
}: {
	project: Project;
	selected: boolean;
	onSelect: (projectId: string) => void;
	onOpenDirectory: (projectId: string) => void;
	onRemove: (projectId: string) => void;
}) {
	const [menuPosition, setMenuPosition] = useState<{ x: number; y: number }>();

	useEffect(() => {
		if (!menuPosition) {
			return;
		}

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
	}, [menuPosition]);

	return (
		<>
			<button
				type="button"
				aria-current={selected ? "page" : undefined}
				aria-pressed={selected}
				className={`flex w-full items-center gap-3 px-3 py-[9px] text-left hover:bg-surface-hover ${
					selected ? "bg-surface-active" : ""
				}`}
				onClick={() => onSelect(project.id)}
				onContextMenu={(event) => {
					event.preventDefault();
					setMenuPosition({ x: event.clientX, y: event.clientY });
				}}
			>
				<span className="min-w-0">
					<span className="block truncate text-body text-primary">{project.name}</span>
					<span className="block truncate text-data text-secondary">{project.path}</span>
				</span>
			</button>
			{menuPosition && (
				<div
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
							if (window.confirm(`Remove ${project.name} from the project list?`)) {
								onRemove(project.id);
							}
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
