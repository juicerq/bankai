import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@renderer/lib/api";
import { installLoggerBridge } from "@renderer/lib/logger-bridge";
import { queryClient } from "@renderer/lib/query-client";
import { router } from "@renderer/lib/router";
import "@renderer/styles.css";

installLoggerBridge();

const rootElement = document.querySelector("#root");

if (!rootElement) {
	throw new Error("Elemento #root não encontrado");
}

createRoot(rootElement).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>
	</StrictMode>,
);
