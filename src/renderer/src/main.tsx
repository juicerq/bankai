import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@renderer/lib/api";
import { installContinuityPush } from "@renderer/lib/continuity-push";
import { AttentionAlert } from "@renderer/lib/attention-alert";
import { installLoggerBridge } from "@renderer/lib/logger-bridge";
import { installReviewPrewarm } from "@renderer/lib/prewarm-reviews";
import { installPushSync } from "@renderer/lib/push";
import { queryClient } from "@renderer/lib/query-client";
import { router } from "@renderer/lib/router";
import { installServicesPush } from "@renderer/lib/services-push";
import { installServiceWorker } from "@renderer/lib/service-worker";
import { installStartupTiming, markStartup } from "@renderer/lib/startup";
import { Theme } from "@renderer/lib/theme";
import { DEFAULT_REVIEW_MODE } from "@renderer/routes/-features/review/header/review-scope";
import "@renderer/styles.css";

markStartup("module");
installStartupTiming({ queryClient });

installLoggerBridge();
Theme.install({ queryClient });
installContinuityPush({ queryClient });
AttentionAlert.install();
installServicesPush({ queryClient });
installReviewPrewarm({ queryClient, mode: DEFAULT_REVIEW_MODE });
installServiceWorker();
installPushSync();
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
