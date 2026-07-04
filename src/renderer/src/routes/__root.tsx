import { createRootRoute, Outlet } from "@tanstack/react-router";
import { useTheme } from "@renderer/lib/theme";

export const Route = createRootRoute({
	component: RootComponent,
});

function RootComponent() {
	useTheme();

	return (
		<div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
			<Outlet />
		</div>
	);
}
