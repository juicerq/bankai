import { useCallback } from "react";

const MODIFIER_KEYS = new Set(["Alt", "Control", "Meta", "Shift"]);

export function useBankaiShortcuts({
	projects,
	onActivateProject,
	onToggleFullscreen,
}: {
	projects: { id: string }[];
	onActivateProject: (projectId: string) => void;
	onToggleFullscreen: () => void;
}) {
	return useCallback(() => {
		let leaderArmed = false;

		const shortcutAction = (event: KeyboardEvent) => {
			if (leaderArmed) {
				leaderArmed = false;
				if (event.code !== "KeyF") {
					return;
				}

				return onToggleFullscreen;
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

			const project = projects[Number(event.code.slice(5)) - 1];
			return () => {
				if (project) {
					onActivateProject(project.id);
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
		const handleWindowBlur = () => {
			leaderArmed = false;
		};

		window.addEventListener("keydown", handleKeyDown, true);
		window.addEventListener("blur", handleWindowBlur);
		return () => {
			window.removeEventListener("keydown", handleKeyDown, true);
			window.removeEventListener("blur", handleWindowBlur);
		};
	}, [projects, onActivateProject, onToggleFullscreen]);
}
