import { basename } from "node:path";
import { type Project, Projects } from "@core/store/projects";
import type { TabSupervisor } from "@core/terminal/TabSupervisor";
import type { TabGroup } from "@core/workspace/WorkspaceGroup";
import { WorkspaceGroups } from "@core/workspace/WorkspaceGroups";
import { WorkspaceTerminals } from "@core/workspace/WorkspaceTerminals";

export type WorkspaceRuntimeSnapshot = {
	projects: Project[];
	activeProjectId: string | null;
	groups: Record<string, TabGroup>;
};

function projectIdAt(projects: Project[], index: number): string | null {
	const project = projects[index];
	return project ? project.id : null;
}

export class WorkspaceRuntime {
	private current: WorkspaceRuntimeSnapshot;
	private readonly terminals: WorkspaceTerminals;
	private readonly listeners = new Set<() => void>();
	private queue = Promise.resolve();

	constructor(
		supervisor: TabSupervisor,
		projects: Project[],
		focusedIndex: number,
		groups: Record<string, TabGroup>,
	) {
		this.current = {
			projects,
			activeProjectId: projectIdAt(projects, focusedIndex),
			groups,
		};
		this.terminals = new WorkspaceTerminals(
			supervisor,
			Object.values(groups).flatMap((group) => group.tabs),
			(tabId) => {
				this.updateGroups(WorkspaceGroups.remove(this.current.groups, tabId));
			},
		);
	}

	snapshot = (): WorkspaceRuntimeSnapshot => this.current;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	dispose(): void {
		this.terminals.dispose();
		this.listeners.clear();
	}

	selectProject(direction: -1 | 1): void {
		if (this.current.projects.length === 0) {
			return;
		}

		const selected = this.current.projects.findIndex(
			(project) => project.id === this.current.activeProjectId,
		);
		const index = selected < 0
			? 0
			: (selected + direction + this.current.projects.length)
				% this.current.projects.length;
		this.update({
			...this.current,
			activeProjectId: projectIdAt(this.current.projects, index),
		});
	}

	activateProjectAt(index: number): boolean {
		const project = this.current.projects[index];
		if (!project) {
			return false;
		}

		this.update({ ...this.current, activeProjectId: project.id });
		if (!WorkspaceGroups.hasTabs(this.current.groups, project.id)) {
			this.openProjectTab(project);
		}
		return true;
	}

	async selectOrAddProject(cwd: string): Promise<void> {
		await this.serial(async () => {
			const existing = this.current.projects.find((project) => project.cwd === cwd);
			if (existing) {
				this.update({ ...this.current, activeProjectId: existing.id });
				if (!WorkspaceGroups.hasTabs(this.current.groups, existing.id)) {
					this.openProjectTab(existing);
				}
				return;
			}

			const projects = await Projects.add({ cwd, name: basename(cwd) });
			const added = projects.at(-1);
			if (!added) {
				throw new Error("project:add returned an empty list");
			}

			this.update({ ...this.current, projects, activeProjectId: added.id });
			this.openProjectTab(added);
		});
	}

	async renameActiveProject(name: string): Promise<void> {
		await this.withActiveProject(async (project) => {
			const projects = await Projects.rename(project.id, name);
			this.update({ ...this.current, projects });
		});
	}

	async moveActiveProject(direction: "up" | "down"): Promise<void> {
		await this.withActiveProject(async (project) => {
			const projects = await Projects.move({ id: project.id, direction });
			this.update({ ...this.current, projects });
		});
	}

	async removeActiveProject(): Promise<void> {
		await this.withActiveProject(async (project) => {
			const removedIndex = this.current.projects.findIndex(
				(candidate) => candidate.id === project.id,
			);
			const projects = await Projects.remove(project.id);
			const group = this.current.groups[project.id];
			if (group) {
				this.terminals.closeAll(group.tabs);
			}
			const groups = WorkspaceGroups.removeProject(this.current.groups, project.id);

			const activeProjectId = this.current.activeProjectId === project.id
				? projectIdAt(projects, Math.min(removedIndex, projects.length - 1))
				: this.current.activeProjectId;
			this.update({
				projects,
				groups,
				activeProjectId,
			});
		});
	}

	enterActiveProject(): void {
		const project = this.activeProject();
		if (project && !WorkspaceGroups.activeTabId(this.current.groups, project.id)) {
			this.openProjectTab(project);
		}
	}

	openTab(): void {
		const project = this.activeProject();
		if (project) {
			this.openProjectTab(project);
		}
	}

	closeActiveTab(): void {
		const project = this.activeProject();
		const tabId = project
			? WorkspaceGroups.activeTabId(this.current.groups, project.id)
			: undefined;
		if (project && tabId) {
			this.terminals.close(tabId);
			this.updateGroups(WorkspaceGroups.remove(this.current.groups, tabId));
		}
	}

	selectTab(index: number): boolean {
		const project = this.activeProject();
		if (!project) {
			return false;
		}
		const groups = WorkspaceGroups.select(this.current.groups, project.id, index);
		if (!groups) {
			this.openProjectTab(project);
			return true;
		}
		this.updateGroups(groups);
		return true;
	}

	cycleTab(direction: -1 | 1): void {
		const project = this.activeProject();
		if (project) {
			this.updateGroups(WorkspaceGroups.cycle(this.current.groups, project.id, direction));
		}
	}

	private openProjectTab(project: Project): void {
		const tabId = this.terminals.open(project.cwd);
		this.updateGroups(WorkspaceGroups.add(this.current.groups, project.id, tabId));
	}

	private activeProject(): Project | undefined {
		return this.current.projects.find(
			(project) => project.id === this.current.activeProjectId,
		);
	}

	private updateGroups(groups: Record<string, TabGroup>): void {
		if (groups !== this.current.groups) {
			this.update({ ...this.current, groups });
		}
	}

	private update(snapshot: WorkspaceRuntimeSnapshot): void {
		this.current = snapshot;
		for (const listener of this.listeners) {
			listener();
		}
	}

	private async withActiveProject(
		operation: (project: Project) => Promise<void>,
	): Promise<void> {
		await this.serial(async () => {
			const project = this.activeProject();
			if (project) {
				await operation(project);
			}
		});
	}

	private async serial(operation: () => Promise<void>): Promise<void> {
		const next = this.queue.catch(() => {}).then(operation);
		this.queue = next;
		await next;
	}
}
