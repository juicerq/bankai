import { createFileRoute } from "@tanstack/react-router";
import { ReactFlowProvider } from "@xyflow/react";
import { CanvasComponents as Components } from "./-components";

// ROUTE

export const Route = createFileRoute("/")({
	component: SessionsPage,
});

// ROUTE MAIN COMPONENT

function SessionsPage() {
	return (
		<ReactFlowProvider>
			<Components.Root />
		</ReactFlowProvider>
	);
}
