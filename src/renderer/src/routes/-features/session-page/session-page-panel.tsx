import {
	ArrowLeftIcon,
	ArrowPathIcon,
	ArrowRightIcon,
	ArrowTopRightOnSquareIcon,
	ArrowsPointingInIcon,
	ArrowsPointingOutIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { type ReactNode, useCallback, useRef, useState, useSyncExternalStore } from "react";
import { streamStatus } from "@renderer/lib/stream/status";
import { ProjectRailReveal } from "@renderer/routes/-features/workspace/layout/project-rail-reveal";
import { SessionPageAddress } from "@renderer/routes/-features/session-page/session-page-address";
import type { SessionPageRegistryValue } from "@renderer/routes/-features/session-page/session-page-registry";

const THAW_DELAY = 150;

export function SessionPagePanel({
	registry,
	shellId,
	obscured,
	coverable,
	expanded,
	onToggleExpanded,
	onClose,
	onRestoreTerminalFocus,
}: {
	registry: SessionPageRegistryValue;
	shellId: string;
	obscured: boolean;
	coverable: boolean;
	expanded: boolean;
	onToggleExpanded: () => void;
	onClose?: () => void;
	onRestoreTerminalFocus: () => void;
}) {
	useSyncExternalStore((listener) => registry.subscribe(listener), () => registry.getSnapshot());
	const stream = useSyncExternalStore(streamStatus.subscribe, streamStatus.get);
	const covered = useSyncExternalStore(ProjectRailReveal.subscribe, () => coverable && ProjectRailReveal.get());
	const entry = registry.get(shellId);
	const entryRef = useRef(entry);
	entryRef.current = entry;
	const [frozen, setFrozen] = useState<string | null>(null);
	const coveredRef = useRef(covered);
	coveredRef.current = covered;
	const schedulePresentation = useRef<(() => void) | null>(null);
	const thaw = useRef<ReturnType<typeof setTimeout> | null>(null);
	const state = entry?.state?.shellId === shellId ? entry.state : undefined;
	const streamBlocked = stream === "reconnecting" || stream === "outdated";
	const shouldPresent = !obscured && !streamBlocked && !(covered && !!frozen);
	const shouldPresentRef = useRef(shouldPresent);
	shouldPresentRef.current = shouldPresent;
	const restoreFocus = useRef(onRestoreTerminalFocus);
	restoreFocus.current = onRestoreTerminalFocus;
	const registerNativeSlot = useCallback((element: HTMLDivElement | null) => {
		if (!element || !entryRef.current?.url) {
			return;
		}

		const bridge = window.bankaiSessionPage;
		if (!bridge) {
			return;
		}

		let frame: number | undefined;
		const present = () => {
			frame = undefined;
			const bounds = element.getBoundingClientRect();
			const target = entryRef.current;

			if (!target?.url || !shouldPresentRef.current || bounds.width <= 0 || bounds.height <= 0) {
				bridge.present(null).catch(() => {});
				return;
			}

			bridge.present({
				shellId,
				url: target.url,
				navigation: target.navigation,
				bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
			}).catch(() => {});
		};
		const schedule = () => {
			if (frame !== undefined) {
				cancelAnimationFrame(frame);
			}

			frame = requestAnimationFrame(present);
		};
		const observer = new ResizeObserver(schedule);
		const unsubscribeState = bridge.onState((nextState) => registry.update(nextState));
		schedulePresentation.current = schedule;
		observer.observe(element);
		window.addEventListener("resize", schedule);
		schedule();

		return () => {
			if (frame !== undefined) {
				cancelAnimationFrame(frame);
			}
			if (thaw.current) {
				clearTimeout(thaw.current);
				thaw.current = null;
			}
			observer.disconnect();
			window.removeEventListener("resize", schedule);
			unsubscribeState();
			if (schedulePresentation.current === schedule) {
				schedulePresentation.current = null;
			}
			bridge.present(null).catch(() => {});
			if (shouldPresentRef.current) {
				restoreFocus.current();
			}
		};
	}, [registry, shellId]);
	const registerPresentation = useCallback((element: HTMLSpanElement | null) => {
		if (element) {
			schedulePresentation.current?.();
		}
	}, []);
	const registerCover = useCallback((element: HTMLSpanElement | null) => {
		if (!element) {
			return;
		}

		if (thaw.current) {
			clearTimeout(thaw.current);
			thaw.current = null;
		}

		if (!coveredRef.current) {
			thaw.current = setTimeout(() => {
				thaw.current = null;
				setFrozen(null);
			}, THAW_DELAY);
			return;
		}

		window.bankaiSessionPage?.snapshot().then(async (image) => {
			if (!image || !coveredRef.current) {
				return;
			}

			const decoded = new Image();
			decoded.src = image;
			const painted = await decoded.decode().then(() => true).catch(() => false);

			if (painted && coveredRef.current) {
				setFrozen(image);
			}
		}).catch(() => {});
	}, []);

	if (!entry) {
		return null;
	}

	const blank = !entry.url;

	return (
		<section data-component="session-page-panel" className="flex size-full min-w-0 flex-col bg-surface-raised">
			<span key={`present-${entry.navigation}-${shouldPresent}`} ref={registerPresentation} hidden />
			<span key={`cover-${covered}`} ref={registerCover} hidden />
			<div className="flex h-header shrink-0 items-center border-outline border-b bg-surface-raised">
				<span className="mx-3 size-1.5 shrink-0 rounded-full bg-tertiary" aria-hidden="true" />
				<SessionPageAddress
					url={registry.displayUrl(shellId)}
					autoFocus={blank}
					onNavigate={(url) => registry.open(shellId, url)}
				/>
				{state?.loading && <span className="pending-pulse mr-2 size-1.5 bg-secondary" aria-label="Page loading" />}
				<SessionPageAction label="Go back" disabled={!state?.canGoBack} onClick={() => window.bankaiSessionPage?.goBack()}>
					<ArrowLeftIcon className="size-4" />
				</SessionPageAction>
				<SessionPageAction label="Go forward" disabled={!state?.canGoForward} onClick={() => window.bankaiSessionPage?.goForward()}>
					<ArrowRightIcon className="size-4" />
				</SessionPageAction>
				<SessionPageAction label="Reload page" disabled={blank} onClick={() => window.bankaiSessionPage?.reload()}>
					<ArrowPathIcon className="size-4" />
				</SessionPageAction>
				<SessionPageAction label="Open page externally" disabled={blank} onClick={() => window.bankaiSessionPage?.openExternal()}>
					<ArrowTopRightOnSquareIcon className="size-4" />
				</SessionPageAction>
				<SessionPageAction label={expanded ? "Dock page" : "Expand page"} pressed={expanded} onClick={onToggleExpanded}>
					{expanded ? <ArrowsPointingInIcon className="size-4" /> : <ArrowsPointingOutIcon className="size-4" />}
				</SessionPageAction>
				<SessionPageAction label="Close page" onClick={onClose}>
					<XMarkIcon className="size-4" />
				</SessionPageAction>
			</div>
			<div className="relative min-h-0 flex-1 bg-surface-sunken">
				{blank
					? (
						<p data-slot="blank" className="absolute inset-0 flex items-center justify-center px-6 text-center text-support text-tertiary">
							Type an address above to open a page here
						</p>
					)
					: <div data-slot="native" ref={registerNativeSlot} className="absolute inset-0" />}
				{frozen && <img data-slot="frozen" src={frozen} alt="" className="absolute inset-0 size-full" />}
				{state?.failure && (
					<div
						data-component="session-page-failure"
						className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-surface-sunken px-6 text-center"
					>
						<span className="text-title text-primary">Page unavailable</span>
						<span className="max-w-lg text-support text-secondary">{state.failure}</span>
						<div className="flex gap-2">
							<button
								type="button"
								data-slot="retry"
								className="border border-outline-strong bg-primary px-3 py-2 text-label text-surface hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
								onClick={() => window.bankaiSessionPage?.reload()}
							>
								Try again
							</button>
							<button
								type="button"
								data-slot="external"
								className="border border-outline-strong px-3 py-2 text-label text-secondary hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
								onClick={() => window.bankaiSessionPage?.openExternal()}
							>
								Open externally
							</button>
						</div>
					</div>
				)}
			</div>
		</section>
	);
}

function SessionPageAction({
	label,
	disabled,
	pressed,
	onClick,
	children,
}: {
	label: string;
	disabled?: boolean;
	pressed?: boolean;
	onClick?: () => void | Promise<void>;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			className={`flex size-header shrink-0 items-center justify-center border-outline border-l focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default disabled:text-outline-strong ${
				pressed ? "bg-surface-active text-primary" : "text-secondary enabled:hover:bg-surface-hover enabled:hover:text-primary"
			}`}
			aria-label={label}
			title={label}
			aria-pressed={pressed}
			disabled={disabled}
			onClick={onClick}
		>
			{children}
		</button>
	);
}
