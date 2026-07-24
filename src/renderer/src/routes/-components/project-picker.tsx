import { ArrowUturnUpIcon, FolderIcon } from "@heroicons/react/24/outline";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { orpc } from "@renderer/lib/api";
import {
	appendBrowseSegment,
	browseDirectoryPath,
	browseLeafSegment,
	browseParentPath,
	browseSeparator,
} from "@renderer/routes/-utils/browse-path";

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
	const [highlighted, setHighlighted] = useState<string>();
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

	const browseTo = (nextPath: string) => {
		setTypedPath(nextPath);
		setHighlighted(undefined);
	};

	const submit = () => {
		setSubmittedPath(path.trim());
		onAdd(path.trim());
	};

	const moveHighlight = (step: number) => {
		const current = items.findIndex((item) => item.name === highlighted);
		const position = current < 0 ? items.length : current;

		setHighlighted(items[(position + step + items.length + 1) % (items.length + 1)]?.name);
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Escape") {
			onClose();
			return;
		}

		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			moveHighlight(event.key === "ArrowDown" ? 1 : -1);
			return;
		}

		if (event.key !== "Enter" || adding) {
			return;
		}

		event.preventDefault();
		const item = items.find((entry) => entry.name === highlighted);
		if (item && !event.ctrlKey && !event.metaKey) {
			browseTo(item.nextPath);
			return;
		}

		submit();
	};

	return (
		<div
			className="picker-backdrop fixed inset-0 z-50 flex justify-center bg-surface-sunken/70 pt-[14vh]"
			onPointerDown={onClose}
		>
			<div
				data-component="project-picker"
				data-path={path}
				data-highlighted={highlighted}
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
							setHighlighted(undefined);
						}}
						onKeyDown={handleKeyDown}
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
							highlighted={item.name === highlighted}
							onHighlight={setHighlighted}
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
						<PickerHint keys={["Enter"]} label={highlighted ? "Open" : "Add"} />
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
	onHighlight,
	onSelect,
}: {
	name: string;
	index: number;
	highlighted: boolean;
	onHighlight: (name: string) => void;
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
			ref={highlighted ? (element) => element?.scrollIntoView({ block: "nearest" }) : undefined}
			className={`relative flex w-full items-center gap-2.5 px-3 py-1.5 text-left ${
				highlighted ? "bg-surface-active" : ""
			}`}
			onMouseMove={() => onHighlight(name)}
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

function PickerHint({ keys, label }: { keys: string[]; label: string }) {
	return (
		<span className="flex items-center gap-1.5">
			<PickerKeys keys={keys} />
			<span className="text-data text-secondary">{label}</span>
		</span>
	);
}

function PickerKeys({ keys }: { keys: string[] }) {
	return keys.map((key) => (
		<kbd key={key} className="border border-outline px-1 py-0.5 text-label text-secondary">
			{key}
		</kbd>
	));
}
