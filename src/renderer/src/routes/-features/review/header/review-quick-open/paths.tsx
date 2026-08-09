import { DocumentIcon, FolderIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { PickerHint } from "@renderer/routes/-features/shared/pickers/picker-hint";
import type {
	QuickOpenContentAction,
	QuickOpenPath,
} from "@renderer/routes/-features/review/header/review-quick-open/model";
import { useReviewQuickOpen } from "@renderer/routes/-features/review/header/review-quick-open/review-quick-open-context";

export function ReviewQuickOpenPaths() {
	const { filter, matchCount, choices, picker, onFilterChange, onChoose } = useReviewQuickOpen().paths;
	const contentAction = choices.find((choice): choice is QuickOpenContentAction => choice.kind === "content");
	const paths = choices.filter((choice): choice is QuickOpenPath => choice.kind === "path");
	let chooseLabel = "Open";
	if (picker.highlighted?.kind === "content") {
		chooseLabel = "Search contents";
	} else if (picker.highlighted?.entry.kind === "directory") {
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
				{contentAction && (
					<ReviewQuickOpenContentAction
						choice={contentAction}
						{...picker.itemProps(contentAction)}
						onSelect={() => onChoose(contentAction)}
					/>
				)}
				{paths.map((choice, index) => (
						<ReviewQuickOpenPathItem
							key={choice.key}
							choice={choice}
							index={index}
							{...picker.itemProps(choice)}
							onSelect={() => onChoose(choice)}
						/>
					))}
				{paths.length === 0 && <p className="px-3 py-2 text-data text-secondary">No matching paths.</p>}
			</div>
			<div className="flex items-center gap-3 border-outline border-t px-3 py-2">
				<PickerHint keys={["↑", "↓"]} label="Navigate" />
				<PickerHint keys={["Enter"]} label={chooseLabel} />
				<PickerHint keys={["Esc"]} label="Close" />
			</div>
		</>
	);
}

function ReviewQuickOpenContentAction({
	choice,
	highlighted,
	ref,
	onMouseMove,
	onSelect,
}: {
	choice: QuickOpenContentAction;
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
			data-component="review-quick-open-content-action"
			ref={ref}
			className={`relative flex w-full items-center gap-2.5 border-outline border-b px-3 py-2 text-left ${
				highlighted ? "bg-surface-active" : "bg-surface"
			}`}
			onMouseMove={onMouseMove}
			onMouseDown={(event) => event.preventDefault()}
			onClick={onSelect}
		>
			{highlighted && <span className="absolute inset-y-0 left-0 w-0.5 bg-tertiary" aria-hidden="true" />}
			<MagnifyingGlassIcon className="size-3.5 shrink-0 text-secondary" aria-hidden="true" />
			<span className="min-w-0 flex-1 truncate text-body text-primary">
				Search contents for “{choice.query}”
			</span>
			<span className="shrink-0 text-data text-secondary">WORKTREE</span>
		</button>
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
