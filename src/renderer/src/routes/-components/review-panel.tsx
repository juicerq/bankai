import { XMarkIcon } from "@heroicons/react/24/outline";
import { useState } from "react";

const DIFF_LINES = [
	{ number: 42, kind: "context", code: "export function createSession(project: Project) {" },
	{ number: 43, kind: "remove", code: "  return sessions.push(project.path)" },
	{ number: 43, kind: "add", code: "  const session = Session.open(project)" },
	{ number: 44, kind: "add", code: "  sessions.set(session.id, session)" },
	{ number: 45, kind: "add", code: "  return session" },
	{ number: 46, kind: "context", code: "}" },
] as const;

export function ReviewPanel({ onClose }: { onClose: () => void }) {
	const [reviewed, setReviewed] = useState(false);
	const progressWidth = reviewed ? "100%" : "92.8%";

	return (
		<aside className="review-panel" aria-label="Sample review">
			<header className="review-header">
				<div>
					<div className="eyebrow">Live review</div>
					<h2>Turn 14</h2>
				</div>
				<button type="button" className="icon-button" onClick={onClose} aria-label="Close review">
					<XMarkIcon />
				</button>
			</header>

			<div className="review-limit">Sample data · interactions validate the UI only. No repository changes are applied.</div>

			<div className="review-meta">
				<span className="eyebrow">Sample diff</span>
				<div className="diff-stat" aria-label="18 additions, 4 removals">
					<span className="added">+18</span>
					<span className="removed">-4</span>
				</div>
			</div>

			<div className="turn-summary">
				<div className="turn-author"><span className="agent-dot" /> Claude Code</div>
				<p>Refactored terminal session ownership and removed the duplicate process state.</p>
				<span className="turn-time">2 minutes ago · 1 file</span>
			</div>

			<section className="diff-card" aria-label="Session diff">
				<header className="diff-file-header">
					<div>
						<span className="file-status">M</span>
						<span>src/core/session.ts</span>
					</div>
					<span className="diff-stat"><span className="added">+3</span> <span className="removed">−1</span></span>
				</header>
				<div className="diff-code">
					{DIFF_LINES.map((line, index) => (
						<div className={`diff-line ${line.kind}`} key={`${line.number}-${index}`}>
							<span className="line-number">{line.number}</span>
							<code>{diffMarker(line.kind)} {line.code}</code>
						</div>
					))}
				</div>
			</section>

			<footer className="review-footer">
				<div className="review-progress">
					<span>{reviewed && "14 of 14 reviewed"}{!reviewed && "13 of 14 reviewed"}</span>
					<div><span style={{ width: progressWidth }} /></div>
				</div>
				<button
					type="button"
					className="review-action"
					disabled={reviewed}
					onClick={() => setReviewed(true)}
				>
					{reviewed && "Reviewed"}{!reviewed && "Mark reviewed"}
				</button>
			</footer>
		</aside>
	);
}

function diffMarker(kind: (typeof DIFF_LINES)[number]["kind"]): string {
	if (kind === "add") {
		return "+";
	}
	if (kind === "remove") {
		return "−";
	}
	return " ";
}
