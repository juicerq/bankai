import { useRef } from "react";
import type { FileChange } from "@core/review/FileChange";

export function useHeldWhileLoading(files: FileChange[], loading: boolean) {
	const held = useRef(files);

	if (!loading) {
		held.current = files;
	}

	return held.current;
}
