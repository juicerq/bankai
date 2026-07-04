import { createRootRoute, Outlet } from "@tanstack/react-router";
import { useTheme } from "@renderer/lib/theme";

export const Route = createRootRoute({
	component: RootComponent,
});

function RootComponent() {
	useTheme();

	return (
		<div className="book-canvas min-h-screen font-serif text-ink">
			<Outlet />
		</div>
	);
}
