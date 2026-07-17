import { useEffect } from "react";
import {
	type WorkspacePersistenceInput,
	WorkspacePersistence,
} from "@core/workspace/WorkspacePersistence";

export function useWorkspacePersistence(input: WorkspacePersistenceInput): void {
	useEffect(() => {
		void WorkspacePersistence.save(input);
	}, [
		input.projects,
		input.groups,
		input.activeIndex,
		input.focus,
		input.zen,
		input.screen,
		input.reviewSession,
		input.captures,
	]);
}
