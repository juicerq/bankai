import {
	ArrowUturnLeftIcon,
	ArrowsPointingOutIcon,
	ChevronDownIcon,
	ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { type KeyboardEvent, type PointerEvent, useMemo, useRef, useState } from "react";
import type { FileChange } from "@main/git/Git";
import { STATUS_MARK } from "@renderer/routes/-utils/status-mark";
import { toggledSet } from "@renderer/routes/-utils/toggled-set";

const KEYBOARD_RESIZE_STEP = 8;
const ROW_PADDING = 12;
const ROW_INDENT = 8;

type DirectoryNode = { kind: "directory"; name: string; path: string; children: TreeNode[] };
type FileNode = { kind: "file"; name: string; file: FileChange };
type TreeNode = DirectoryNode | FileNode;

export function ReviewTree({
	files,
	focusedPath,
	defaultWidth,
	preferredWidth,
	minWidth,
	maxWidth,
	onWidthChange,
	onOpenFile,
	onToggleFocusFile,
}: {
	files: FileChange[];
	focusedPath?: string;
	defaultWidth: number;
	preferredWidth: number;
	minWidth: number;
	maxWidth?: number;
	onWidthChange: (width: number) => void;
	onOpenFile: (path: string) => void;
	onToggleFocusFile: (path: string) => void;
}) {
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
	const [resizing, setResizing] = useState(false);
	const dragStart = useRef<{ x: number; width: number } | null>(null);
	const tree = useMemo(() => arrange(build(files)), [files]);
	const availableMax = maxWidth ?? preferredWidth;
	const renderedWidth = Math.min(preferredWidth, availableMax);
	const clampWidth = (width: number) => Math.min(Math.max(width, minWidth), availableMax);
	const endResize = () => {
		dragStart.current = null;
		setResizing(false);
	};
	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
			return;
		}

		event.preventDefault();
		onWidthChange(clampWidth(preferredWidth + (event.key === "ArrowRight" ? KEYBOARD_RESIZE_STEP : -KEYBOARD_RESIZE_STEP)));
	};

	return (
		<div
			style={{ width: renderedWidth }}
			className={`relative flex shrink-0 flex-col ${resizing ? "cursor-col-resize select-none" : ""}`}
			aria-label="Tree"
		>
			<div className="flex h-header shrink-0 items-center justify-between border-outline border-b px-3 text-label text-secondary">
				<span>TREE</span>
				{preferredWidth !== defaultWidth && (
					<button
						type="button"
						className="-m-1 p-1 hover:text-primary"
						aria-label="Reset tree width"
						title="Reset tree width"
						onClick={() => onWidthChange(defaultWidth)}
					>
						<ArrowUturnLeftIcon className="size-4" />
					</button>
				)}
			</div>
			<div className="min-h-0 flex-1 overflow-auto">
				{visibleRows(tree, collapsed).map((row) =>
					row.node.kind === "directory" ? (
						<TreeDirectoryRow
							key={row.node.path}
							node={row.node}
							depth={row.depth}
							collapsed={collapsed.has(row.node.path)}
							onToggle={(path) => setCollapsed((current) => toggledSet(current, path))}
						/>
					) : (
						<TreeFileRow
							key={row.node.file.path}
							node={row.node}
							depth={row.depth}
							focused={row.node.file.path === focusedPath}
							onOpen={onOpenFile}
							onToggleFocus={onToggleFocusFile}
						/>
					),
				)}
			</div>
			<div
				role="separator"
				aria-orientation="vertical"
				aria-label="Resize tree"
				aria-valuemin={minWidth}
				aria-valuemax={availableMax}
				aria-valuenow={renderedWidth}
				tabIndex={0}
				className={`group absolute inset-y-0 right-0 w-px cursor-col-resize touch-none focus-visible:bg-primary focus-visible:outline-none ${
					resizing ? "bg-primary" : "bg-outline group-hover:bg-outline-strong"
				}`}
				onKeyDown={handleKeyDown}
				onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
					event.currentTarget.setPointerCapture(event.pointerId);
					dragStart.current = { x: event.clientX, width: preferredWidth };
					setResizing(true);
				}}
				onPointerMove={(event: PointerEvent<HTMLDivElement>) => {
					const start = dragStart.current;
					if (start) {
						onWidthChange(clampWidth(start.width + event.clientX - start.x));
					}
				}}
				onPointerUp={endResize}
				onPointerCancel={endResize}
			>
				<span className="absolute inset-y-0 -right-1 -left-1" />
			</div>
		</div>
	);
}

function TreeDirectoryRow({
	node,
	depth,
	collapsed,
	onToggle,
}: {
	node: DirectoryNode;
	depth: number;
	collapsed: boolean;
	onToggle: (path: string) => void;
}) {
	const ChevronIcon = collapsed ? ChevronRightIcon : ChevronDownIcon;

	return (
		<button
			type="button"
			className="flex w-full items-center gap-1 py-1 pr-3 text-left text-body text-secondary hover:bg-surface-hover hover:text-primary"
			style={{ paddingLeft: ROW_PADDING + depth * ROW_INDENT }}
			aria-expanded={!collapsed}
			onClick={() => onToggle(node.path)}
		>
			<ChevronIcon className="size-4 shrink-0" />
			<span className="truncate">{node.name}</span>
		</button>
	);
}

function TreeFileRow({
	node,
	depth,
	focused,
	onOpen,
	onToggleFocus,
}: {
	node: FileNode;
	depth: number;
	focused: boolean;
	onOpen: (path: string) => void;
	onToggleFocus: (path: string) => void;
}) {
	return (
		<div
			className="group flex items-center pr-1 hover:bg-surface-hover"
			style={{ paddingLeft: ROW_PADDING + depth * ROW_INDENT }}
		>
			<button
				type="button"
				className="flex min-w-0 flex-1 items-center gap-1 py-1 text-left text-body"
				onClick={() => onOpen(node.file.path)}
			>
				<span className="flex size-4 shrink-0 items-center justify-center text-data text-secondary">
					{STATUS_MARK[node.file.status]}
				</span>
				<span className="truncate text-primary group-hover:underline">{node.name}</span>
			</button>
			<button
				type="button"
				className={`shrink-0 p-1 hover:text-primary ${
					focused ? "text-primary" : "text-secondary opacity-0 group-hover:opacity-100"
				}`}
				aria-pressed={focused}
				aria-label={`${focused ? "Return from focused file" : "Focus"} ${node.file.path}`}
				onClick={() => onToggleFocus(node.file.path)}
			>
				<ArrowsPointingOutIcon className="size-4" />
			</button>
		</div>
	);
}

function build(files: FileChange[]): TreeNode[] {
	const root: DirectoryNode = { kind: "directory", name: "", path: "", children: [] };
	const directories = new Map<string, DirectoryNode>();

	for (const file of files) {
		const segments = file.path.split("/");
		let directory = root;

		for (const [index, segment] of segments.entries()) {
			if (index === segments.length - 1) {
				directory.children.push({ kind: "file", name: segment, file });
				continue;
			}

			const path = directory.path ? `${directory.path}/${segment}` : segment;
			const existing = directories.get(path);
			if (existing) {
				directory = existing;
				continue;
			}

			const created: DirectoryNode = { kind: "directory", name: segment, path, children: [] };
			directories.set(path, created);
			directory.children.push(created);
			directory = created;
		}
	}

	return root.children;
}

function arrange(nodes: TreeNode[]): TreeNode[] {
	return nodes.map((node) => (node.kind === "file" ? node : collapseChain(node))).sort(byDirectoryThenName);
}

function byDirectoryThenName(a: TreeNode, b: TreeNode): number {
	if (a.kind !== b.kind) {
		return a.kind === "directory" ? -1 : 1;
	}
	return a.name.localeCompare(b.name);
}

function collapseChain(node: DirectoryNode): DirectoryNode {
	const only = node.children.length === 1 ? node.children[0] : undefined;
	if (only?.kind === "directory") {
		const merged = collapseChain(only);
		return { ...merged, name: `${node.name}/${merged.name}` };
	}

	return { ...node, children: arrange(node.children) };
}

function visibleRows(nodes: TreeNode[], collapsed: ReadonlySet<string>, depth = 0): { node: TreeNode; depth: number }[] {
	return nodes.flatMap((node) => {
		if (node.kind === "file" || collapsed.has(node.path)) {
			return [{ node, depth }];
		}
		return [{ node, depth }, ...visibleRows(node.children, collapsed, depth + 1)];
	});
}
