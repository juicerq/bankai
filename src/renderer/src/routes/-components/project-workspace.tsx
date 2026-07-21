import { ViewColumnsIcon } from "@heroicons/react/24/outline";
import { useRef, useState } from "react";
import type { Project } from "@main/store/projects";
import { ReviewPanel } from "@renderer/routes/-components/review-panel";
import { TerminalPane } from "@renderer/routes/-components/terminal-pane";

type ShellTab = {
	id: string;
	label: string;
};

export function ProjectWorkspace({
	project,
	active,
}: {
	project: Project;
	active: boolean;
}) {
	const [tabs, setTabs] = useState<ShellTab[]>(() => [newShellTab(1)]);
	const [activeTabId, setActiveTabId] = useState<string | undefined>(() => tabs[0]?.id);
	const [reviewOpen, setReviewOpen] = useState(true);
	const nextShellNumber = useRef(2);

	const handleNewShell = () => {
		const tab = newShellTab(nextShellNumber.current);
		nextShellNumber.current += 1;
		setTabs((current) => [...current, tab]);
		setActiveTabId(tab.id);
	};

	const handleCloseShell = (tabId: string) => {
		const tabIndex = tabs.findIndex((tab) => tab.id === tabId);
		const remaining = tabs.filter((tab) => tab.id !== tabId);
		setTabs(remaining);
		if (activeTabId === tabId) {
			setActiveTabId(remaining[Math.max(0, tabIndex - 1)]?.id);
		}
	};

	return (
		<section className="project-workspace" hidden={!active} aria-label={`${project.name} workspace`}>
			<header className="workspace-header">
				<div className="workspace-identity">
					<strong>{project.name}</strong>
					<span>{project.path}</span>
				</div>
				<div className="shell-tabs" aria-label="Shells">
					{tabs.map((tab) => (
						<div className={`shell-tab ${activeTabId === tab.id ? "active" : ""}`} key={tab.id}>
							<button type="button" aria-pressed={activeTabId === tab.id} onClick={() => setActiveTabId(tab.id)}>
								<span className="shell-status" />
								{tab.label}
							</button>
							<button
								type="button"
								className="close-tab"
								onClick={() => handleCloseShell(tab.id)}
								aria-label={`Close ${tab.label}`}
							>
								×
							</button>
						</div>
					))}
					<button type="button" className="new-tab" onClick={handleNewShell} aria-label="New shell">
						+
					</button>
				</div>
				<div className="workspace-actions">
					<button
						type="button"
						className={reviewOpen ? "toolbar-button active" : "toolbar-button"}
						aria-expanded={reviewOpen}
						aria-pressed={reviewOpen}
						onClick={() => setReviewOpen((current) => !current)}
					>
						<ViewColumnsIcon />
						Sample review
					</button>
				</div>
			</header>

			<div className="workspace-body">
				<div className="terminal-stage">
					{tabs.length === 0 && (
						<div className="empty-shell">
							<div className="empty-shell-mark">›_</div>
							<h2>No open shells</h2>
							<p>Start a shell in {project.name} to continue.</p>
							<button type="button" onClick={handleNewShell}>New shell</button>
						</div>
					)}
					{tabs.map((tab) => (
						<div className="terminal-slot" hidden={tab.id !== activeTabId} key={tab.id}>
							<TerminalPane projectId={project.id} />
						</div>
					))}
					<footer className="terminal-statusbar">
						<span className="status-spacer" />
						<span>UTF-8</span>
						</footer>
				</div>
				{reviewOpen && <ReviewPanel onClose={() => setReviewOpen(false)} />}
			</div>
		</section>
	);
}

function newShellTab(index: number): ShellTab {
	return { id: crypto.randomUUID(), label: `Shell ${index}` };
}
