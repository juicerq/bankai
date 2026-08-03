import { FolderIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import type { ProjectCommand, ProjectCommandDraft } from "@main/store/project-commands";
import type { Project } from "@main/store/projects";
import { DropdownMenu, DropdownMenuItem } from "@renderer/routes/-components/dropdown-menu";
import { Switch } from "@renderer/routes/-components/settings-controls";

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
	const [scopedId, setScopedId] = useState(projectId);
	const [label, setLabel] = useState(command?.label ?? "");
	const [line, setLine] = useState(command?.command ?? "");
	const [kind, setKind] = useState<ProjectCommand["kind"]>(command?.kind ?? "task");
	const [autostart, setAutostart] = useState(command?.autostart === true);

	if (!command && projectId !== scopedId) {
		setScopedId(projectId);
		setOwnerId(projectId ?? "");
	}

	const owner = projects.find((project) => project.id === ownerId);
	const complete = !!owner && !!label.trim() && !!line.trim();

	const save = () => {
		if (!complete) {
			return;
		}

		if (kind === "service") {
			onSave(owner.id, { label: label.trim(), command: line.trim(), kind, autostart });

			return;
		}

		onSave(owner.id, { label: label.trim(), command: line.trim(), kind });
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
				<span className="mt-1 block text-data text-secondary">
					{command ? "Project ownership stays fixed while editing." : "Choose where this command will run."}
				</span>
			</div>
			<Field label="PROJECT">
				{command ? (
					<div data-slot="command-project" className="border border-outline bg-surface px-2 py-1.5 text-body text-primary">
						{owner?.name}
						<span className="ml-2 text-data text-secondary">{owner?.path}</span>
					</div>
				) : (
					<DropdownMenu
						component="project-select"
						variant="field"
						truncate
						icon={<FolderIcon className="size-4 shrink-0" aria-hidden="true" />}
						label={owner?.name ?? "Choose a project"}
						ariaLabel={`Command project: ${owner?.name ?? "none"}`}
						title={owner?.path}
					>
						{projects.map((project) => (
							<DropdownMenuItem
								key={project.id}
								label={project.name}
								detail={project.path}
								selected={project.id === ownerId}
								onClick={() => setOwnerId(project.id)}
							/>
						))}
					</DropdownMenu>
				)}
			</Field>
			<Field label="KIND">
				<div data-slot="command-kind" className="flex border border-outline">
					<KindOption
						kind="task"
						title="TASK"
						description="Opens a shell"
						selected={kind === "task"}
						onSelect={setKind}
					/>
					<KindOption
						kind="service"
						title="SERVICE"
						description="Runs in the background"
						selected={kind === "service"}
						onSelect={setKind}
					/>
				</div>
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
					{kind === "service"
						? "Runs in the background at the project directory, with no shell in the session list."
						: "Runs in a plain shell at the project directory. The shell stays open when the command ends."}
				</span>
			</Field>
			{kind === "service" && (
				<div className="flex items-center gap-3 border border-outline bg-surface px-2 py-1.5">
					<div className="min-w-0 flex-1">
						<span className="block text-body text-primary">Start when Bankai opens</span>
						<span className="mt-0.5 block text-data text-secondary">You never have to start it by hand.</span>
					</div>
					<Switch
						label="Start when Bankai opens"
						slot="command-autostart"
						on={autostart}
						onToggle={() => setAutostart(!autostart)}
					/>
				</div>
			)}
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

function KindOption({
	kind,
	title,
	description,
	selected,
	onSelect,
}: {
	kind: ProjectCommand["kind"];
	title: string;
	description: string;
	selected: boolean;
	onSelect: (kind: ProjectCommand["kind"]) => void;
}) {
	return (
		<button
			type="button"
			data-slot={`kind-${kind}`}
			aria-pressed={selected}
			className={`flex flex-1 flex-col gap-0.5 px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring ${
				selected ? "bg-surface-active" : "bg-surface hover:bg-surface-hover"
			}`}
			onClick={() => onSelect(kind)}
		>
			<span className={`text-label ${selected ? "text-primary" : "text-secondary"}`}>{title}</span>
			<span className="text-data text-secondary">{description}</span>
		</button>
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
