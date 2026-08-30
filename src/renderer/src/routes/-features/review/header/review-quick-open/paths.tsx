import { DocumentIcon, ExclamationTriangleIcon, FolderIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { PickerHint } from "@renderer/routes/-features/shared/pickers/picker-hint";
import type {
	QuickOpenMatch,
	QuickOpenPath,
} from "@renderer/routes/-features/review/header/review-quick-open/model";
import { useReviewQuickOpen } from "@renderer/routes/-features/review/header/review-quick-open/review-quick-open-context";

export function ReviewQuickOpenPaths() {
	const { filter, searching, matchCount, choices, picker, onFilterChange, onChoose, status, groups } = useReviewQuickOpen().paths;
	const paths = choices.filter((choice): choice is QuickOpenPath => choice.kind === "path");
	let chooseLabel = "Open";
	if (picker.highlighted?.kind === "path" && picker.highlighted.entry.kind === "directory") {
		chooseLabel = "Narrow";
	}

	return (
		<>
			<div className="flex items-center gap-2 border-outline border-b px-3 py-2.5">
				<span className="text-body text-tertiary" aria-hidden="true">
					›
				</span>
				<input
					data-slot="filter-input"
					autoFocus
					spellCheck={false}
					autoComplete="off"
					aria-label="File, folder, or text to find"
					aria-busy={searching}
					placeholder="Open a file or search its contents"
					className="min-w-0 flex-1 bg-transparent text-body text-primary outline-none placeholder:text-secondary"
					value={filter}
					onInput={(event) => {
						onFilterChange(event.currentTarget.value);
						picker.clear();
					}}
					onKeyDown={picker.onKeyDown}
				/>
			</div>
			<div className="flex items-center justify-between px-3 pt-2.5 pb-1">
				<span className="text-label text-secondary">QUICK OPEN</span>
				{matchCount > paths.length && (
					<span
						data-slot="match-count"
						data-visible={paths.length}
						data-total={matchCount}
						className="text-data text-outline-strong"
					>
						{paths.length} OF {matchCount}
					</span>
				)}
			</div>
			<div className="h-72 overflow-y-auto pb-1" role="listbox" aria-label="Quick open results">
				{paths.map((choice, index) => (
						<ReviewQuickOpenPathItem
							key={choice.key}
							choice={choice}
							index={index}
							{...picker.itemProps(choice)}
							onSelect={() => onChoose(choice)}
						/>
					))}
				{filter && <div className="border-outline border-t px-3 pt-2.5 pb-1 text-label text-secondary">CONTENTS</div>}
				{status === "searching" && <ReviewQuickOpenNotice icon={MagnifyingGlassIcon}>Searching…</ReviewQuickOpenNotice>}
				{status === "error" && <ReviewQuickOpenNotice icon={ExclamationTriangleIcon}>Search failed</ReviewQuickOpenNotice>}
				{status === "empty" && <ReviewQuickOpenNotice icon={MagnifyingGlassIcon}>No content matches.</ReviewQuickOpenNotice>}
				{status === "truncated" && (
					<div data-slot="truncated" className="border-outline border-b px-3 py-2 text-data text-secondary">
						Search stopped early. Refine the term to inspect more files.
					</div>
				)}
				{groups.map((group) => (
					<section key={group.path} data-component="review-quick-open-file" data-path={group.path} data-matches={group.matches.length}>
						<header className="truncate bg-surface px-3 py-1.5 text-data text-secondary" title={group.path}>{group.path}</header>
						<div className="divide-y divide-outline/70">
							{group.matches.map((choice) => (
								<ReviewQuickOpenMatchItem key={choice.key} choice={choice} {...picker.itemProps(choice)} onSelect={() => onChoose(choice)} />
							))}
						</div>
					</section>
				))}
				{!filter && paths.length === 0 && <p className="px-3 py-2 text-data text-secondary">No paths.</p>}
			</div>
			<div className="flex items-center gap-3 border-outline border-t px-3 py-2">
				<PickerHint keys={["↑", "↓"]} label="Navigate" />
				<PickerHint keys={["Enter"]} label={chooseLabel} />
				<PickerHint keys={["Esc"]} label="Close" />
			</div>
		</>
	);
}

function ReviewQuickOpenMatchItem({
	choice,
	highlighted,
	ref,
	onMouseMove,
	onSelect,
}: {
	choice: QuickOpenMatch;
	highlighted: boolean;
	ref?: (element: HTMLElement | null) => void;
	onMouseMove: () => void;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			role="option"
			aria-selected={highlighted}
			data-component="review-quick-open-match"
			data-path={choice.match.file}
			data-line={choice.match.line}
			ref={ref}
			className={`relative flex w-full gap-2 px-3 py-1.5 text-left ${
				highlighted ? "bg-surface-active" : "hover:bg-surface-hover"
			}`}
			onMouseMove={onMouseMove}
			onMouseDown={(event) => event.preventDefault()}
			onClick={onSelect}
		>
			{highlighted && <span className="absolute inset-y-0 left-0 w-0.5 bg-tertiary" aria-hidden="true" />}
			<span className="w-8 shrink-0 text-right text-data text-outline-strong tabular-nums">{choice.match.line}</span>
			<span className="min-w-0 flex-1 truncate text-support text-primary" title={choice.match.text}>{choice.match.text}</span>
		</button>
	);
}

function ReviewQuickOpenNotice({ icon: Icon, children }: { icon: typeof MagnifyingGlassIcon; children: string }) {
	return (
		<div className="flex items-center gap-2 px-3 py-2 text-data text-secondary">
			<Icon className="size-4" aria-hidden="true" />
			{children}
		</div>
	);
}

function ReviewQuickOpenPathItem({
	choice,
	index,
	highlighted,
	ref,
	onMouseMove,
	onSelect,
}: {
	choice: QuickOpenPath;
	index: number;
	highlighted: boolean;
	ref?: (element: HTMLElement | null) => void;
	onMouseMove: () => void;
	onSelect: () => void;
}) {
	const { entry } = choice;
	const Icon = entry.kind === "directory" ? FolderIcon : DocumentIcon;
	const separator = entry.path.lastIndexOf("/");

	return (
		<button
			type="button"
			role="option"
			aria-selected={highlighted}
			data-component="review-quick-open-item"
			data-path={entry.path}
			data-kind={entry.kind}
			data-index={index}
			ref={ref}
			className={`relative flex w-full items-center gap-2.5 px-3 py-1.5 text-left ${
				highlighted ? "bg-surface-active" : "hover:bg-surface-hover"
			}`}
			onMouseMove={onMouseMove}
			onMouseDown={(event) => event.preventDefault()}
			onClick={onSelect}
		>
			{highlighted && <span className="absolute inset-y-0 left-0 w-0.5 bg-tertiary" aria-hidden="true" />}
			<Icon className="size-3.5 shrink-0 text-secondary" aria-hidden="true" />
			<span className="shrink-0 truncate text-body text-primary">{entry.path.slice(separator + 1)}</span>
			<span className="min-w-0 flex-1 truncate text-data text-outline-strong">{entry.path.slice(0, separator)}</span>
		</button>
	);
}
