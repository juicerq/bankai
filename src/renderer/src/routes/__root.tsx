import { createRootRoute, Outlet } from "@tanstack/react-router";
import { StreamOverlay } from "@renderer/routes/-components/stream-overlay";

export const Route = createRootRoute({ component: RootLayout });

function RootLayout() {
	return (
		<>
			<Outlet />
			<StreamOverlay />
		</>
	);
}
