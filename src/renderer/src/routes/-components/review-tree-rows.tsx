import { ChevronDownIcon, ChevronRightIcon, ViewfinderCircleIcon } from "@heroicons/react/24/outline";
import type { FileChange } from "@main/git/git-contracts";
import type { FileTreeDirectory, FileTreeLeaf } from "@renderer/routes/-utils/file-tree";
import { STATUS_MARK } from "@renderer/routes/-utils/status-mark";

export type ReviewTreeItem = FileChange | undefined;

const ROW_PADDING = 12;
const ROW_INDENT = 16;
const ROW_CHEVRON_CENTER = 8;

function ReviewTreeRowIndent({ depth }: { depth: number }) {
	return (
		<>
			<span
				aria-hidden="true"
				className="shrink-0 self-stretch"
				style={{ width: depth > 0 ? ROW_PADDING + ROW_CHEVRON_CENTER : ROW_PADDING }}
			/>
			{Array.from({ length: depth }, (_, level) => (
				<span
					key={level}
					aria-hidden="true"
					className="shrink-0 self-stretch border-outline/70 border-l"
					style={{ width: level === depth - 1 ? ROW_CHEVRON_CENTER : ROW_INDENT }}
				/>
			))}
		</>
	);
}

export function ReviewTreeDirectoryRow({
	node,
	depth,
	collapsed,
	onToggle,
}: {
	node: FileTreeDirectory<ReviewTreeItem>;
	depth: number;
	collapsed: boolean;
	onToggle: (node: FileTreeDirectory<ReviewTreeItem>) => void;
}) {
	const ChevronIcon = collapsed ? ChevronRightIcon : ChevronDownIcon;

	return (
		<button
			type="button"
			data-component="review-tree-row"
			data-path={node.path}
			data-kind="directory"
			className="flex w-full items-center pr-3 text-left text-body text-secondary hover:bg-surface-hover hover:text-primary"
			aria-expanded={!collapsed}
			onClick={() => onToggle(node)}
		>
			<ReviewTreeRowIndent depth={depth} />
			<ChevronIcon className="mr-1 size-4 shrink-0" />
			<span className="truncate py-1">{node.name}</span>
		</button>
	);
}

export function ReviewTreeFileRow({
	node,
	depth,
	focused,
	onOpen,
	onToggleFocus,
}: {
	node: FileTreeLeaf<ReviewTreeItem>;
	depth: number;
	focused: boolean;
	onOpen: (path: string) => void;
	onToggleFocus?: (path: string) => void;
}) {
	return (
		<div
			data-component="review-tree-row"
			data-path={node.path}
			data-kind="file"
			data-status={node.item?.status}
			className={`group flex items-center pr-1 hover:bg-surface-hover ${focused ? "bg-surface-active" : ""}`}
		>
			<ReviewTreeRowIndent depth={depth} />
			<button
				type="button"
				data-slot="open"
				className="flex min-w-0 flex-1 items-center gap-1 py-1 text-left text-body"
				onClick={() => onOpen(node.path)}
			>
				<span className="flex size-4 shrink-0 items-center justify-center text-data text-secondary">
					{node.item && STATUS_MARK[node.item.status]}
				</span>
				<span className="truncate text-primary group-hover:underline">{node.name}</span>
			</button>
			{onToggleFocus && (
				<button
					type="button"
					data-slot="focus"
					className={`shrink-0 p-1 hover:text-primary ${
						focused ? "text-primary" : "text-secondary opacity-0 group-hover:opacity-100"
					}`}
					aria-pressed={focused}
					aria-label={`${focused ? "Return from focused file" : "Focus"} ${node.path}`}
					onClick={() => onToggleFocus(node.path)}
				>
					<ViewfinderCircleIcon className="size-4" />
				</button>
			)}
		</div>
	);
}
