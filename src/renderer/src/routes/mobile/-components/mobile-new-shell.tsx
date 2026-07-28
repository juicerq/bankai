import { PlusIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import type { Project } from "@main/store/projects";
import type { AgentActivityState } from "@shared/activity";
import { ACTIVITY_DOT_CLASS } from "@renderer/routes/-utils/agent-activity";

export function MobileNewShell({
	projects,
	projectActivity,
	onCreate,
}: {
	projects: Project[];
	projectActivity: ReadonlyMap<string, AgentActivityState>;
	onCreate: (projectId: string) => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const [problem, setProblem] = useState<string>();
	const [creating, setCreating] = useState<string>();

	if (projects.length === 0) {
		return null;
	}

	const create = async (projectId: string) => {
		if (creating) {
			return;
		}

		setCreating(projectId);
		setProblem(undefined);
		try {
			await onCreate(projectId);
		} catch (err) {
			setProblem(err instanceof Error ? err.message : String(err));
			setOpen(true);
		} finally {
			setCreating(undefined);
		}
	};

	const handleNew = async () => {
		const [onlyProject, ...rest] = projects;
		if (onlyProject && rest.length === 0) {
			await create(onlyProject.id);
			return;
		}

		setProblem(undefined);
		setOpen(true);
	};

	return (
		<>
			<button
				type="button"
				data-component="mobile-new-shell"
				aria-label="New shell"
				disabled={!!creating}
				className="-mr-3 flex h-full w-11 shrink-0 items-center justify-center text-tertiary active:bg-surface-active disabled:text-outline-strong"
				onClick={handleNew}
			>
				<PlusIcon className="size-5" aria-hidden="true" />
			</button>
			{open && (
				<MobileProjectSheet
					projects={projects}
					projectActivity={projectActivity}
					problem={problem}
					creating={creating}
					onCreate={create}
					onClose={() => setOpen(false)}
				/>
			)}
		</>
	);
}

function MobileProjectSheet({
	projects,
	projectActivity,
	problem,
	creating,
	onCreate,
	onClose,
}: {
	projects: Project[];
	projectActivity: ReadonlyMap<string, AgentActivityState>;
	problem: string | undefined;
	creating: string | undefined;
	onCreate: (projectId: string) => Promise<void>;
	onClose: () => void;
}) {
	const sorted = [...projects].sort((left, right) => left.name.localeCompare(right.name));

	return (
		<div className="fixed inset-0 z-50 flex flex-col justify-end bg-surface-sunken/70" onPointerDown={onClose}>
			<div
				role="dialog"
				aria-modal="true"
				aria-label="New shell"
				data-component="mobile-project-sheet"
				className="flex max-h-[70vh] flex-col border-outline-strong border-t bg-surface-raised"
				onPointerDown={(event) => event.stopPropagation()}
			>
				<div className="flex h-header shrink-0 items-center justify-between border-outline border-b px-4">
					<span className="text-label text-secondary">NEW SHELL IN</span>
					<button
						type="button"
						data-slot="cancel"
						className="-mr-2 flex h-full items-center px-2 text-label text-secondary active:text-primary"
						onClick={onClose}
					>
						CANCEL
					</button>
				</div>
				{problem && (
					<p data-slot="problem" className="shrink-0 px-4 pt-3 text-removed text-support">
						{problem}
					</p>
				)}
				<div className="min-h-0 flex-1 overflow-y-auto">
					{sorted.map((project) => {
						const activity = projectActivity.get(project.id);

						return (
							<button
								key={project.id}
								type="button"
								data-component="mobile-project-option"
								data-project-id={project.id}
								data-activity={activity}
								disabled={!!creating}
								className="flex min-h-14 w-full items-center gap-3 border-outline border-b px-4 text-left active:bg-surface-active disabled:text-secondary"
								onClick={() => onCreate(project.id)}
							>
								<span
									data-slot="project-dot"
									aria-hidden="true"
									className={`size-1.5 shrink-0 rounded-full ${
										activity ? ACTIVITY_DOT_CLASS[activity] : "bg-outline-strong"
									}`}
								/>
								<span className="min-w-0 flex-1 truncate text-body text-primary">{project.name}</span>
								{creating === project.id && (
									<span data-slot="opening" className="shrink-0 text-data text-tertiary">
										OPENING
									</span>
								)}
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}
