import { ArrowUturnUpIcon, FolderIcon } from "@heroicons/react/24/outline";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { orpc } from "@renderer/lib/api";
import { PickerHint, PickerKeys } from "@renderer/routes/-features/shared/pickers/picker-hint";
import {
	appendBrowseSegment,
	browseDirectoryPath,
	browseLeafSegment,
	browseParentPath,
	browseSeparator,
} from "@renderer/routes/-features/review/tree/browse-path";
import { usePickerNavigation } from "@renderer/routes/-features/shared/pickers/use-picker-navigation";

const HOME_PATH = "~";

export function ProjectPicker({
	adding,
	addError,
	onAdd,
	onOpenSystemPicker,
	onClose,
}: {
	adding: boolean;
	addError: string | undefined;
	onAdd: (path: string) => void;
	onOpenSystemPicker: () => void;
	onClose: () => void;
}) {
	const [typedPath, setTypedPath] = useState<string>();
	const [submittedPath, setSubmittedPath] = useState<string>();
	const queryPath = typedPath === undefined ? HOME_PATH : browseDirectoryPath(typedPath);
	const { data, isError } = useQuery(
		orpc.projects.browse.queryOptions({
			input: { path: queryPath },
			enabled: queryPath.length > 0,
			placeholderData: keepPreviousData,
		}),
	);
	const path = typedPath ?? (data ? `${data.path}${browseSeparator(data.path)}` : "");
	const filter = browseLeafSegment(path);
	const parentPath = browseParentPath(path);
	const items = [
		...(parentPath ? [{ name: "..", nextPath: parentPath }] : []),
		...(queryPath.length > 0 ? (data?.directories ?? []) : [])
			.filter((name) => name.toLowerCase().startsWith(filter.toLowerCase()))
			.filter((name) => filter.startsWith(".") || !name.startsWith("."))
			.map((name) => ({ name, nextPath: appendBrowseSegment(path, name) })),
	];
	const failure = submittedPath === path.trim() ? addError : undefined;

	const submit = () => {
		setSubmittedPath(path.trim());
		onAdd(path.trim());
	};

	const picker = usePickerNavigation({
		items,
		key: (item) => item.name,
		onChoose: (highlighted, event) => {
			if (adding) {
				return;
			}

			if (highlighted && !event.ctrlKey && !event.metaKey) {
				browseTo(highlighted.nextPath);
				return;
			}

			submit();
		},
		onClose,
	});

	const browseTo = (nextPath: string) => {
		setTypedPath(nextPath);
		picker.clear();
	};

	return (
		<div
			className="picker-backdrop fixed inset-0 z-50 flex justify-center bg-surface-sunken/70 pt-[14vh]"
			onPointerDown={onClose}
		>
			<div
				data-component="project-picker"
				data-path={path}
				data-highlighted={picker.highlightedKey}
				className="picker-enter flex h-fit w-[560px] max-w-[90vw] flex-col border border-outline-strong bg-surface-raised shadow-2xl"
				onPointerDown={(event) => event.stopPropagation()}
			>
				<div className="flex items-center gap-2 border-outline border-b px-3 py-2.5">
					<span className="text-body text-tertiary" aria-hidden="true">
						›
					</span>
					<input
						data-slot="path-input"
						autoFocus
						spellCheck={false}
						autoComplete="off"
						aria-label="Project directory"
						placeholder="~/projects/"
						className="min-w-0 flex-1 bg-transparent text-body text-primary outline-none placeholder:text-secondary"
						value={path}
						onInput={(event) => {
							setTypedPath(event.currentTarget.value);
							picker.clear();
						}}
						onKeyDown={picker.onKeyDown}
					/>
					<button
						type="button"
						data-slot="add"
						disabled={adding}
						className="flex shrink-0 items-center gap-1.5 border border-outline px-2 py-1 text-label text-secondary hover:border-outline-strong hover:text-primary disabled:opacity-50"
						onClick={submit}
					>
						ADD
						<PickerKeys keys={["Ctrl", "Enter"]} />
					</button>
				</div>
				{(failure || isError) && (
					<p
						data-component="project-picker-notice"
						data-message={failure}
						className="border-outline border-b px-3 py-2 text-data text-removed"
					>
						{failure ?? "This directory cannot be read."}
					</p>
				)}
				<span className="px-3 pt-2.5 pb-1 text-label text-secondary">DIRECTORIES</span>
				<div className="h-64 overflow-y-auto pb-1" role="listbox" aria-label="Directories">
					{items.map((item, index) => (
						<PickerItem
							key={item.name}
							name={item.name}
							index={index}
							{...picker.itemProps(item)}
							onSelect={() => browseTo(item.nextPath)}
						/>
					))}
					{items.length === 0 && (
						<p className="px-3 py-2 text-data text-secondary">
							{queryPath.length === 0 ? "Type a directory path." : "No matching directories."}
						</p>
					)}
				</div>
				<div className="flex items-center justify-between gap-3 border-outline border-t px-3 py-2">
					<div className="flex items-center gap-3">
						<PickerHint keys={["↑", "↓"]} label="Navigate" />
						<PickerHint keys={["Enter"]} label={picker.highlighted ? "Open" : "Add"} />
						<PickerHint keys={["Esc"]} label="Close" />
					</div>
					<button
						type="button"
						data-slot="system-picker"
						className="shrink-0 text-label text-secondary hover:text-primary"
						onClick={onOpenSystemPicker}
					>
						SYSTEM PICKER
					</button>
				</div>
			</div>
		</div>
	);
}

function PickerItem({
	name,
	index,
	highlighted,
	ref,
	onMouseMove,
	onSelect,
}: {
	name: string;
	index: number;
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
			data-component="project-picker-item"
			data-name={name}
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
			{name === ".." ? (
				<ArrowUturnUpIcon className="size-3.5 shrink-0 text-secondary" aria-hidden="true" />
			) : (
				<FolderIcon className="size-3.5 shrink-0 text-secondary" aria-hidden="true" />
			)}
			<span className="truncate text-body text-primary">{name}</span>
		</button>
	);
}
