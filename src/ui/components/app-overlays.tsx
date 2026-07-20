import type { Project } from "@core/store/projects";
import type { useProjectOverlay } from "@ui/-utils/use-project-overlay";
import type { useSettingsOverlay } from "@ui/-utils/use-settings-overlay";
import { ProjectPicker } from "@ui/components/project-picker";
import { ProjectPickerState } from "@ui/components/project-picker-state";
import { ProjectRenameOverlay } from "@ui/components/project-rename-overlay";
import { SettingsOverlay } from "@ui/components/settings-overlay";

export function AppOverlays({
	projectOverlay,
	settingsOverlay,
	existingCwds,
	activeProject,
	onPick,
	onRename,
}: {
	projectOverlay: ReturnType<typeof useProjectOverlay>;
	settingsOverlay: ReturnType<typeof useSettingsOverlay>;
	existingCwds: string[];
	activeProject: Project | undefined;
	onPick: (cwd: string) => void;
	onRename: (name: string) => void;
}) {
	const { overlay, close, home } = projectOverlay;

	if (overlay?.kind === "picker") {
		if (overlay.state === "loading") {
			return <ProjectPickerState status="loading" onCancel={close} />;
		}
		if (overlay.state === "error") {
			return <ProjectPickerState status="error" message={overlay.message} onCancel={close} />;
		}

		return (
			<ProjectPicker
				home={home}
				entries={overlay.entries}
				existingCwds={existingCwds}
				onPick={onPick}
				onCancel={close}
			/>
		);
	}

	if (overlay?.kind === "rename" && activeProject) {
		return (
			<ProjectRenameOverlay current={activeProject.name} onSubmit={onRename} onCancel={close} />
		);
	}

	if (settingsOverlay.open) {
		return (
			<SettingsOverlay
				defaultHarness={settingsOverlay.defaultHarness}
				onSelect={settingsOverlay.select}
				onClose={settingsOverlay.close}
			/>
		);
	}

	return null;
}
