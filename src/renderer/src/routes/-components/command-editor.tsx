import { useState } from "react";
import type { ProjectCommand, ProjectCommandDraft } from "@main/store/commands";

export function CommandEditor({
	command,
	onSave,
	onCancel,
}: {
	command: ProjectCommand | undefined;
	onSave: (draft: ProjectCommandDraft) => void;
	onCancel: () => void;
}) {
	const [label, setLabel] = useState(command?.label ?? "");
	const [line, setLine] = useState(command?.command ?? "");
	const complete = !!label.trim() && !!line.trim();

	const save = () => {
		if (complete) {
			onSave({ label: label.trim(), command: line.trim() });
		}
	};

	return (
		<div
			data-component="command-editor"
			data-id={command?.id}
			className="flex flex-col gap-3 px-3 py-3"
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					onCancel();
				}
			}}
		>
			<Field label="NAME">
				<input
					data-slot="command-label"
					autoFocus
					spellCheck={false}
					autoComplete="off"
					aria-label="Command name"
					placeholder="Dev server"
					className="w-full border border-outline bg-surface px-2 py-1.5 text-body text-primary outline-none placeholder:text-secondary focus:border-tertiary"
					value={label}
					onInput={(event) => setLabel(event.currentTarget.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							save();
						}
					}}
				/>
			</Field>
			<Field label="COMMAND">
				<input
					data-slot="command-line"
					spellCheck={false}
					autoComplete="off"
					aria-label="Command line"
					placeholder="bun run dev"
					className="w-full border border-outline bg-surface px-2 py-1.5 text-data text-primary outline-none placeholder:text-secondary focus:border-tertiary"
					value={line}
					onInput={(event) => setLine(event.currentTarget.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							save();
						}
					}}
				/>
				<span className="mt-1.5 block text-data text-secondary">
					Runs in a plain shell at the project directory. The shell stays open when the command ends.
				</span>
			</Field>
			<div className="flex items-center justify-end gap-2">
				<button
					type="button"
					data-slot="cancel-command"
					className="border border-outline px-2 py-1 text-label text-secondary hover:border-outline-strong hover:text-primary"
					onClick={onCancel}
				>
					CANCEL
				</button>
				<button
					type="button"
					data-slot="save-command"
					disabled={!complete}
					className="bg-primary px-2 py-1 text-label text-surface hover:bg-secondary disabled:opacity-40"
					onClick={save}
				>
					SAVE
				</button>
			</div>
		</div>
	);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div>
			<span className="block pb-1.5 text-label text-secondary">{label}</span>
			{children}
		</div>
	);
}
