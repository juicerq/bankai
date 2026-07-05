import { Panel, useReactFlow } from "@xyflow/react";
import { ChevronLeft, ChevronRight, Maximize, Plus, ZoomIn, ZoomOut } from "lucide-react";
import { useState } from "react";
import type { FlowNode } from "../-utils/flow-nodes";

export function CanvasToolbar({
	onNewSession,
	creating,
}: {
	onNewSession: () => void;
	creating: boolean;
}) {
	const rf = useReactFlow<FlowNode>();
	const [collapsed, setCollapsed] = useState(false);

	const railButton =
		"flex size-9 items-center justify-center rounded-lg font-mono text-sm text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink active:scale-95 focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none";

	if (collapsed) {
		return (
			<Panel position="top-left">
				<button
					type="button"
					onClick={() => setCollapsed(false)}
					aria-label="mostrar menu"
					title="mostrar menu"
					className="flex size-9 items-center justify-center rounded-xl border border-ink/10 bg-panel/85 font-mono text-sm text-ink-muted shadow-lg shadow-ink/10 backdrop-blur transition-colors hover:text-ink active:scale-95 focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none"
				>
					<ChevronRight size={16} strokeWidth={2} />
				</button>
			</Panel>
		);
	}

	return (
		<Panel
			position="top-left"
			className="flex flex-col items-center gap-1 rounded-xl border border-ink/10 bg-panel/85 p-1.5 shadow-lg shadow-ink/10 backdrop-blur"
		>
			<button
				type="button"
				onClick={onNewSession}
				disabled={creating}
				aria-label="Nova sessão"
				title="Nova sessão"
				className="flex size-9 items-center justify-center rounded-lg bg-slime font-mono text-base text-paper transition-colors hover:bg-olive active:scale-95 focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none disabled:opacity-60"
			>
				<Plus size={16} strokeWidth={2.25} />
			</button>

			<div className="h-px w-5 bg-ink/10" />

			<button
				type="button"
				onClick={() => rf.zoomIn()}
				aria-label="Aumentar zoom"
				title="aumentar zoom"
				className={railButton}
			>
				<ZoomIn size={16} strokeWidth={2} />
			</button>
			<button
				type="button"
				onClick={() => rf.zoomOut()}
				aria-label="Diminuir zoom"
				title="diminuir zoom"
				className={railButton}
			>
				<ZoomOut size={16} strokeWidth={2} />
			</button>
			<button
				type="button"
				onClick={() => rf.fitView({ padding: 0.2, duration: 200 })}
				aria-label="Ajustar à tela"
				title="ajustar à tela"
				className={railButton}
			>
				<Maximize size={16} strokeWidth={2} />
			</button>

			<div className="h-px w-5 bg-ink/10" />

			<button
				type="button"
				onClick={() => setCollapsed(true)}
				aria-label="esconder menu"
				title="esconder menu"
				className={railButton}
			>
				<ChevronLeft size={16} strokeWidth={2} />
			</button>
		</Panel>
	);
}
