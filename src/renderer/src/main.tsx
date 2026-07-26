import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@renderer/lib/api";
import { installContinuityPush } from "@renderer/lib/continuity-push";
import { installLoggerBridge } from "@renderer/lib/logger-bridge";
import { installReviewPrewarm } from "@renderer/lib/prewarm-reviews";
import { queryClient } from "@renderer/lib/query-client";
import { router } from "@renderer/lib/router";
import { installStartupTiming, markStartup } from "@renderer/lib/startup";
import { DEFAULT_REVIEW_MODE } from "@renderer/routes/-utils/review-scope";
import "@renderer/styles.css";

markStartup("module");
installStartupTiming({ queryClient });

installLoggerBridge();
installContinuityPush({ queryClient });
installReviewPrewarm({ queryClient, mode: DEFAULT_REVIEW_MODE });
markStartup("installed");

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

markStartup("render-called");
