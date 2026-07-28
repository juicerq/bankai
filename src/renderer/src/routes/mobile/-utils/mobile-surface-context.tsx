import { createContext, type ReactNode, use } from "react";
import type { Project } from "@main/store/projects";
import type { SessionRow } from "@renderer/routes/-utils/session-rows";

interface MobileSurface {
	projects: Project[];
	rows: SessionRow[];
	chosenProjectIds: ReadonlySet<string>;
	onToggleProject: (projectId: string) => void;
}

const MobileSurfaceContext = createContext<MobileSurface | null>(null);

export function MobileSurfaceProvider({ surface, children }: { surface: MobileSurface; children: ReactNode }) {
	return <MobileSurfaceContext value={surface}>{children}</MobileSurfaceContext>;
}

export function useMobileSurface() {
	const surface = use(MobileSurfaceContext);
	if (!surface) {
		throw new Error("useMobileSurface needs a MobileSurfaceProvider above it");
	}

	return surface;
}
