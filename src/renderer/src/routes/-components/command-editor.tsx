import { useState } from "react";
import type { ProjectCommand, ProjectCommandDraft } from "@main/store/commands";
import type { Project } from "@main/store/projects";

export function CommandEditor({
	command,
	projects,
	projectId,
	onSave,
	onCancel,
}: {
	command: ProjectCommand | undefined;
	projects: readonly Project[];
	projectId: string | undefined;
	onSave: (projectId: string, draft: ProjectCommandDraft) => void;
	onCancel: () => void;
}) {
	const [ownerId, setOwnerId] = useState(command?.projectId ?? projectId ?? "");
	const [label, setLabel] = useState(command?.label ?? "");
	const [line, setLine] = useState(command?.command ?? "");
	const owner = projects.find((project) => project.id === ownerId);
	const complete = !!owner && !!label.trim() && !!line.trim();

	const save = () => {
		if (complete) {
			onSave(owner.id, { label: label.trim(), command: line.trim() });
		}
	};

	return (
		<div
			data-component="command-editor"
			data-command-id={command?.id}
			data-project-id={owner?.id}
			className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-4"
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					onCancel();
				}
			}}
		>
			<div className="border-outline border-b pb-3">
				<span className="block text-label text-secondary">{command ? "EDIT COMMAND" : "NEW COMMAND"}</span>
				<span className="mt-1 block text-data text-tertiary">
					{command ? "Project ownership stays fixed while editing." : "Choose where this command will run."}
				</span>
			</div>
			<Field label="PROJECT">
				{command || projectId ? (
					<div data-slot="command-project" className="border border-outline bg-surface px-2 py-1.5 text-body text-primary">
						{owner?.name}
						<span className="ml-2 text-data text-tertiary">{owner?.path}</span>
					</div>
				) : (
					<select
						data-slot="project-select"
						aria-label="Command project"
						className="w-full border border-outline bg-surface px-2 py-1.5 text-body text-primary outline-none focus-visible:border-tertiary"
						value={ownerId}
						onChange={(event) => setOwnerId(event.currentTarget.value)}
					>
						<option value="">Choose a project</option>
						{projects.map((project) => (
							<option key={project.id} value={project.id}>{project.name}</option>
						))}
					</select>
				)}
			</Field>
			<Field label="NAME">
				<input
					data-slot="command-label"
					autoFocus
					maxLength={60}
					spellCheck={false}
					autoComplete="off"
					aria-label="Command name"
					placeholder="Dev server"
					className="w-full border border-outline bg-surface px-2 py-1.5 text-body text-primary outline-none placeholder:text-secondary focus-visible:border-tertiary"
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
					maxLength={2000}
					spellCheck={false}
					autoComplete="off"
					aria-label="Command line"
					placeholder="bun run dev"
					className="w-full border border-outline bg-surface px-2 py-1.5 text-data text-primary outline-none placeholder:text-secondary focus-visible:border-tertiary"
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
			<div className="mt-auto flex items-center justify-end gap-2 border-outline border-t pt-3">
				<button
					type="button"
					data-slot="cancel-command"
					className="border border-outline px-2 py-1 text-label text-secondary hover:border-outline-strong hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					onClick={onCancel}
				>
					CANCEL
				</button>
				<button
					type="button"
					data-slot="save-command"
					disabled={!complete}
					className="bg-primary px-2 py-1 text-label text-surface hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
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
