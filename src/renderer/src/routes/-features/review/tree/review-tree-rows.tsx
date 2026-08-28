import { ChevronDownIcon, ChevronRightIcon, EllipsisHorizontalIcon, ViewfinderCircleIcon } from "@heroicons/react/24/outline";
import { createContext, type MouseEvent, type ReactNode, type Ref, useContext } from "react";
import type { FileChange } from "@shared/review";
import type { ReviewClosedTarget } from "@shared/review-default-closure";
import {
	type FileTreeDirectory,
	type FileTreeLeaf,
	highlightFileTreeName,
} from "@renderer/routes/-features/review/tree/file-tree";
import { STATUS_MARK } from "@renderer/routes/-features/review/tree/status-mark";

export type ReviewTreeItem = FileChange | undefined;

const ROW_PADDING = 12;
const ROW_INDENT = 16;
const ROW_CHEVRON_CENTER = 8;
const ReviewTreeFilterContext = createContext("");

export function ReviewTreeRowFilter({ query, children }: { query: string; children: ReactNode }) {
	return <ReviewTreeFilterContext value={query}>{children}</ReviewTreeFilterContext>;
}

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

function ReviewTreeRowName({ name, className }: { name: string; className: string }) {
	const filter = useContext(ReviewTreeFilterContext);
	const runs = highlightFileTreeName(name, filter);
	const matching = runs.some((run) => run.highlighted);

	return (
		<span data-slot="name" data-filter-match={matching || undefined} className={className}>
			{matching
				? runs.map((run, index) => (
						<span key={index} className={run.highlighted ? "text-tertiary" : undefined}>
							{run.text}
						</span>
					))
				: name}
		</span>
	);
}

function fileRowBackground(focused: boolean, highlighted: boolean) {
	if (focused) {
		return "bg-surface-active";
	}

	if (highlighted) {
		return "bg-surface-hover";
	}

	return "";
}

export function ReviewTreeDirectoryRow({
	node,
	depth,
	collapsed,
	defaultClosed,
	onToggle,
	onOpenActions,
}: {
	node: FileTreeDirectory<ReviewTreeItem>;
	depth: number;
	collapsed: boolean;
	defaultClosed: boolean;
	onToggle: (node: FileTreeDirectory<ReviewTreeItem>) => void;
	onOpenActions: (event: MouseEvent<HTMLButtonElement>, target: ReviewClosedTarget) => void;
}) {
	const ChevronIcon = collapsed ? ChevronRightIcon : ChevronDownIcon;

	return (
		<div
			data-component="review-tree-row"
			data-path={node.path}
			data-kind="directory"
			className="group flex w-full items-center pr-1 text-body text-secondary hover:bg-surface-hover hover:text-primary"
		>
			<button
				type="button"
				className="flex min-w-0 flex-1 items-center text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
				aria-expanded={!collapsed}
				onClick={() => onToggle(node)}
			>
				<ReviewTreeRowIndent depth={depth} />
				<ChevronIcon className="mr-1 size-4 shrink-0" />
				<ReviewTreeRowName name={node.name} className="min-w-0 truncate py-1" />
			</button>
			<ReviewTreeRowActions path={node.path} kind="directory" active={defaultClosed} onOpen={onOpenActions} />
		</div>
	);
}

function ReviewTreeRowActions({
	path,
	kind,
	active,
	onOpen,
}: {
	path: string;
	kind: ReviewClosedTarget["kind"];
	active: boolean;
	onOpen: (event: MouseEvent<HTMLButtonElement>, target: ReviewClosedTarget) => void;
}) {
	return (
		<button
			type="button"
			data-slot="default-closure-actions"
			data-active={active || undefined}
			className={`flex size-6 shrink-0 items-center justify-center hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
				active ? "bg-surface-active text-primary" : "text-secondary opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
			}`}
			aria-label={`Actions for ${path}`}
			aria-haspopup="menu"
			onClick={(event) => onOpen(event, { kind, path })}
		>
			<EllipsisHorizontalIcon className="size-4" aria-hidden="true" />
		</button>
	);
}

export function ReviewTreeFileRow({
	ref,
	node,
	depth,
	focused,
	highlighted,
	defaultClosed,
	onOpen,
	onToggleFocus,
	onOpenActions,
}: {
	ref?: Ref<HTMLDivElement>;
	node: FileTreeLeaf<ReviewTreeItem>;
	depth: number;
	focused: boolean;
	highlighted: boolean;
	defaultClosed: boolean;
	onOpen: (path: string) => void;
	onToggleFocus: (path: string) => void;
	onOpenActions: (event: MouseEvent<HTMLButtonElement>, target: ReviewClosedTarget) => void;
}) {
	return (
		<div
			ref={ref}
			data-component="review-tree-row"
			data-path={node.path}
			data-kind="file"
			data-status={node.item?.status}
			data-focused={focused || undefined}
			data-highlighted={highlighted || undefined}
			className={`group relative flex items-center pr-1 hover:bg-surface-hover ${fileRowBackground(focused, highlighted)}`}
		>
			{highlighted && (
				<span data-slot="keyboard-cursor" className="absolute inset-y-0 left-0 w-0.5 bg-tertiary" aria-hidden="true" />
			)}
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
				<ReviewTreeRowName name={node.name} className="min-w-0 truncate text-primary group-hover:underline" />
			</button>
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
			<ReviewTreeRowActions path={node.path} kind="file" active={defaultClosed} onOpen={onOpenActions} />
		</div>
	);
}
