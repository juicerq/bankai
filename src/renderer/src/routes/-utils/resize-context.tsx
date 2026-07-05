import { createContext, useContext } from "react";
import type { ReactNode } from "react";

type ResizeState = {
	resizingFor: string | null;
	resizingAll: boolean;
	beginResize: (nodeId: string) => void;
	endResize: (nodeId: string) => void;
};

const ResizeContext = createContext<ResizeState>({
	resizingFor: null,
	resizingAll: false,
	beginResize: () => {},
	endResize: () => {},
});

export const useResizing = (nodeId: string) => {
	const ctx = useContext(ResizeContext);
	return { resizing: ctx.resizingFor === nodeId || ctx.resizingAll, ctx };
};

export function ResizeProvider({
	altKey,
	resizingId,
	beginResize,
	endResize,
	children,
}: {
	altKey: boolean;
	resizingId: string | null;
	beginResize: (nodeId: string) => void;
	endResize: (nodeId: string) => void;
	children: ReactNode;
}) {
	const resizingAll = !resizingId && altKey;
	return (
		<ResizeContext.Provider
			value={{ resizingFor: resizingId, resizingAll, beginResize, endResize }}
		>
			{children}
		</ResizeContext.Provider>
	);
}
