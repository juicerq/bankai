import { DocumentIcon, FolderIcon } from "@heroicons/react/24/outline";
import { useMemo, useState } from "react";
import { PickerHint } from "@renderer/routes/-components/picker-hint";
import { type PathEntry, pathEntries, searchPaths } from "@renderer/routes/-utils/path-search";
import { usePickerNavigation } from "@renderer/routes/-utils/use-picker-navigation";

export const VISIBLE_MATCHES = 100;

export function ReviewPathPicker({
	paths,
	onOpenFile,
	onClose,
}: {
	paths: string[];
	onOpenFile: (path: string) => void;
	onClose: () => void;
}) {
	const [filter, setFilter] = useState("");
	const entries = useMemo(() => pathEntries(paths), [paths]);
	const matches = searchPaths(entries, filter);
	const items = matches.slice(0, VISIBLE_MATCHES);

	const picker = usePickerNavigation({
		items,
		key: (entry) => entry.path,
		fallback: (found) => found[0],
		onChoose: (highlighted) => {
			if (highlighted) {
				choose(highlighted);
			}
		},
		onClose,
	});

	const choose = (entry: PathEntry) => {
		if (entry.kind === "directory") {
			setFilter(`${entry.path}/`);
			picker.clear();
			return;
		}

		onClose();
		onOpenFile(entry.path);
	};

	return (
		<div
			className="picker-backdrop fixed inset-0 z-50 flex justify-center bg-surface-sunken/70 pt-[14vh]"
			onPointerDown={onClose}
		>
			<div
				data-component="review-path-picker"
				data-highlighted={picker.highlightedKey}
				className="picker-enter flex h-fit w-[560px] max-w-[90vw] flex-col border border-outline-strong bg-surface-raised shadow-2xl"
				onPointerDown={(event) => event.stopPropagation()}
			>
				<div className="flex items-center gap-2 border-outline border-b px-3 py-2.5">
					<span className="text-body text-tertiary" aria-hidden="true">
						›
					</span>
					<input
						data-slot="filter-input"
						autoFocus
						spellCheck={false}
						autoComplete="off"
						aria-label="File or folder to open"
						placeholder="Filter files and folders"
						className="min-w-0 flex-1 bg-transparent text-body text-primary outline-none placeholder:text-secondary"
						value={filter}
						onInput={(event) => {
							setFilter(event.currentTarget.value);
							picker.clear();
						}}
						onKeyDown={picker.onKeyDown}
					/>
				</div>
				<div className="flex items-center justify-between px-3 pt-2.5 pb-1">
					<span className="text-label text-secondary">FILES AND FOLDERS</span>
					{matches.length > items.length && (
						<span data-slot="match-count" className="text-data text-outline-strong">
							{items.length} OF {matches.length}
						</span>
					)}
				</div>
				<div className="h-64 overflow-y-auto pb-1" role="listbox" aria-label="Files and folders">
					{items.map((entry, index) => (
						<ReviewPathPickerItem
							key={entry.path}
							entry={entry}
							index={index}
							{...picker.itemProps(entry)}
							onSelect={() => choose(entry)}
						/>
					))}
					{items.length === 0 && <p className="px-3 py-2 text-data text-secondary">No matching paths.</p>}
				</div>
				<div className="flex items-center gap-3 border-outline border-t px-3 py-2">
					<PickerHint keys={["↑", "↓"]} label="Navigate" />
					<PickerHint keys={["Enter"]} label={picker.highlighted?.kind === "directory" ? "Narrow" : "Open"} />
					<PickerHint keys={["Esc"]} label="Close" />
				</div>
			</div>
		</div>
	);
}

function ReviewPathPickerItem({
	entry,
	index,
	highlighted,
	ref,
	onMouseMove,
	onSelect,
}: {
	entry: PathEntry;
	index: number;
	highlighted: boolean;
	ref?: (element: HTMLElement | null) => void;
	onMouseMove: () => void;
	onSelect: () => void;
}) {
	const Icon = entry.kind === "directory" ? FolderIcon : DocumentIcon;
	const separator = entry.path.lastIndexOf("/");

	return (
		<button
			type="button"
			role="option"
			aria-selected={highlighted}
			data-component="review-path-picker-item"
			data-path={entry.path}
			data-kind={entry.kind}
			data-index={index}
			ref={ref}
			className={`relative flex w-full items-center gap-2.5 px-3 py-1.5 text-left ${
				highlighted ? "bg-surface-active" : ""
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
