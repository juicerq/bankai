import { createRootRoute, Outlet } from "@tanstack/react-router";
import { PairingScreen } from "@renderer/routes/-features/settings/pairing-screen";
import { StreamOverlay } from "@renderer/routes/-features/app/status/stream-overlay";

export const Route = createRootRoute({ component: RootLayout });

function RootLayout() {
	return (
		<>
			<Outlet />
			<StreamOverlay />
			<PairingScreen />
		</>
	);
}
