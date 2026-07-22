import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState, useSyncExternalStore } from "react";
import { orpc } from "@renderer/lib/api";
import { EmptyState } from "@renderer/routes/-components/empty-state";
import { ProjectRail } from "@renderer/routes/-components/project-rail";
import { ProjectWorkspace } from "@renderer/routes/-components/project-workspace";
import { WindowControls } from "@renderer/routes/-components/window-controls";
import { ProjectWarmPool } from "@renderer/routes/-utils/project-warm-pool";

const MODIFIER_KEYS = new Set(["Alt", "Control", "Meta", "Shift"]);

export const Route = createFileRoute("/")({ component: Bankai });

function Bankai() {
	const queryClient = useQueryClient();
	const projects = useQuery(orpc.projects.list.queryOptions());
	const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
	const [mountedProjectIds, setMountedProjectIds] = useState<string[]>([]);
	const [fullscreen, setFullscreen] = useState(false);
	const [warmPool] = useState(() => new ProjectWarmPool());
	const inactiveWarmProjectIds = useSyncExternalStore(warmPool.subscribe, warmPool.getSnapshot, warmPool.getSnapshot);
	const availableProjects = projects.data || [];
	const selectedId = activeProjectId || availableProjects[0]?.id;
	const mountedIds = selectedId && !mountedProjectIds.includes(selectedId)
		? [...mountedProjectIds, selectedId]
		: mountedProjectIds;

	const selectProject = useCallback((projectId: string) => {
		warmPool.activate(projectId);
		if (selectedId && selectedId !== projectId) {
			warmPool.deactivate(selectedId);
		}
		setMountedProjectIds((current) => {
			const withOutgoing = selectedId && !current.includes(selectedId) ? [...current, selectedId] : current;
			return withOutgoing.includes(projectId) ? withOutgoing : [...withOutgoing, projectId];
		});
		setActiveProjectId(projectId);
	}, [selectedId, warmPool]);

	const registerShortcuts = useCallback(() => {
		let leaderArmed = false;

		const shortcutAction = (event: KeyboardEvent) => {
			if (leaderArmed) {
				leaderArmed = false;
				if (event.code !== "KeyF") {
					return;
				}

				return () => setFullscreen((current) => !current);
			}

			if (!event.ctrlKey || event.altKey || event.metaKey) {
				return;
			}

			if (event.code === "KeyX") {
				return () => {
					leaderArmed = true;
				};
			}

			if (!event.code.startsWith("Digit")) {
				return;
			}

			const project = availableProjects[Number(event.code.slice(5)) - 1];
			return () => {
				if (project) {
					selectProject(project.id);
				}
			};
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (MODIFIER_KEYS.has(event.key)) {
				return;
			}

			const action = shortcutAction(event);
			if (!action) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			action();
		};

		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [availableProjects, selectProject]);

	const addProject = useMutation(
		orpc.projects.chooseDirectory.mutationOptions({
			onSuccess: async (project) => {
				if (!project) {
					return;
				}
				selectProject(project.id);
				await queryClient.invalidateQueries({ queryKey: orpc.projects.list.key() });
			},
		}),
	);
	const openDirectory = useMutation(orpc.projects.openDirectory.mutationOptions());
	const moveProject = useMutation(
		orpc.projects.move.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: orpc.projects.list.key() });
			},
		}),
	);
	const removeProject = useMutation(
		orpc.projects.remove.mutationOptions({
			onSuccess: async (_, input) => {
				warmPool.remove(input.projectId);
				setMountedProjectIds((current) => current.filter((id) => id !== input.projectId));
				setActiveProjectId((current) => current === input.projectId ? null : current);
				await queryClient.invalidateQueries({ queryKey: orpc.projects.list.key() });
			},
		}),
	);

	return (
		<main ref={registerShortcuts} className="relative flex h-full bg-surface">
			<WindowControls />
			{!fullscreen && (
				<ProjectRail
					projects={availableProjects}
					loading={projects.isPending}
					selectedId={selectedId}
					onSelect={selectProject}
					onAdd={() => addProject.mutate({})}
					onOpenDirectory={(projectId) => openDirectory.mutate({ projectId })}
					onRemove={(projectId) => removeProject.mutate({ projectId })}
					onMove={moveProject.mutate}
					adding={addProject.isPending}
					addFailed={addProject.isError}
				/>
			)}
			<section className="flex min-h-0 min-w-0 flex-1 flex-col">
				{projects.isError && (
					<EmptyState
						mark="!"
						title="Projects unavailable"
						description={String(projects.error)}
						actionLabel="Retry loading"
						onAction={() => projects.refetch()}
					/>
				)}
				{projects.isSuccess && availableProjects.length === 0 && (
					<EmptyState
						mark="›_"
						title="Choose a working directory"
						description="Bankai keeps project shells together in one focused workspace."
						actionLabel="Add first project"
						onAction={() => addProject.mutate({})}
					/>
				)}
				{!projects.isError && availableProjects.filter((project) => mountedIds.includes(project.id)).map((project) => {
					const active = project.id === selectedId;
					return (
						<ProjectWorkspace
							key={project.id}
							project={project}
							active={active}
							warm={active || inactiveWarmProjectIds.includes(project.id)}
						/>
					);
				})}
			</section>
		</main>
	);
}
