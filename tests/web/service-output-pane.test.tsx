import { afterEach, expect, test } from "bun:test";
import { useState } from "react";
import type { ProjectCommand } from "@main/store/project-commands";
import type { Project } from "@main/store/projects";
import { ServiceLogPane } from "@renderer/routes/-components/service-log-pane";
import { ServicesFooter } from "@renderer/routes/-components/services-footer";
import { useServiceLog } from "@renderer/routes/-utils/use-service-log";
import type { ServiceState } from "@shared/services";
import { get, query, slot } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

const projects: Project[] = [
	{ id: "alpha", name: "alpha", path: "/projects/alpha", createdAt: 1 },
	{ id: "beta", name: "beta", path: "/projects/beta", createdAt: 2 },
];

const services: ProjectCommand[] = [
	{ id: "beta-api", projectId: "beta", label: "beta api", command: "bun dev", kind: "service", createdAt: 1 },
];

const states = new Map<string, ServiceState>();

afterEach(cleanup);

function Harness() {
	const [reviewOpen, setReviewOpen] = useState(true);
	const [selectedProjectId, setSelectedProjectId] = useState("alpha");
	const closeReview = () => setReviewOpen(false);
	const serviceLog = useServiceLog({ services, onOpen: closeReview });
	const selectSession = (projectId: string) => {
		setSelectedProjectId(projectId);
		serviceLog.close();
	};

	return (
		<>
			<span data-component="surface-state" data-review-open={reviewOpen} data-selected-project={selectedProjectId} />
			<button type="button" data-component="select-session" onClick={() => selectSession("alpha")}>
				alpha session
			</button>
			<ServicesFooter
				services={services}
				projects={projects}
				open
				states={states}
				openedCommandId={serviceLog.openedCommandId}
				onToggle={() => {}}
				onStart={() => {}}
				onStop={() => {}}
				onRestart={() => {}}
				onRemove={() => {}}
				onOpenLog={serviceLog.toggle}
			/>
			{serviceLog.opened && (
				<ServiceLogPane
					projectId={serviceLog.opened.projectId}
					commandId={serviceLog.opened.id}
					label={serviceLog.opened.label}
					status="stopped"
					resizeDeferred={false}
					onClose={serviceLog.close}
				/>
			)}
		</>
	);
}

function openBetaService() {
	fireEvent.click(slot(get("service-row", { commandId: "beta-api" }), "open-service-log"));
}

test("the output opens for a service whose project is not the selected session's project", () => {
	render(<Harness />);

	expect(get("surface-state").dataset.selectedProject).toBe("alpha");
	expect(query("service-log")).toBeNull();

	openBetaService();

	expect(get("service-log", { commandId: "beta-api" })).toBeTruthy();

	openBetaService();

	expect(query("service-log")).toBeNull();
});

test("selecting a session closes the output", () => {
	render(<Harness />);
	openBetaService();

	fireEvent.click(get("select-session"));

	expect(query("service-log")).toBeNull();
});

test("opening the output closes the review panel", () => {
	render(<Harness />);

	expect(get("surface-state").dataset.reviewOpen).toBe("true");

	openBetaService();

	expect(get("surface-state").dataset.reviewOpen).toBe("false");
});
