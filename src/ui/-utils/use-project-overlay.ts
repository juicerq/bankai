import { homedir } from "node:os";
import { useRef, useState } from "react";
import { type DirEntry, listDirs } from "@core/fs/listDirs";
import { Logger } from "@core/logger";

const HOME = homedir();

type Overlay =
	| { kind: "rename" }
	| { kind: "picker"; state: "loading" }
	| { kind: "picker"; state: "error"; message: string }
	| { kind: "picker"; state: "ready"; entries: DirEntry[] }
	| null;

export function useProjectOverlay() {
	const [overlay, setOverlay] = useState<Overlay>(null);
	const pickerRequest = useRef(0);

	const close = () => {
		pickerRequest.current++;
		setOverlay(null);
	};

	return {
		home: HOME,
		overlay,
		close,

		openRename() {
			pickerRequest.current++;
			setOverlay({ kind: "rename" });
		},

		openPicker() {
			const request = ++pickerRequest.current;
			setOverlay({ kind: "picker", state: "loading" });

			listDirs(HOME)
				.then((entries) => {
					if (pickerRequest.current === request) {
						setOverlay({ kind: "picker", state: "ready", entries });
					}
				})
				.catch((err) => {
					if (pickerRequest.current === request) {
						setOverlay({
							kind: "picker",
							state: "error",
							message: err instanceof Error ? err.message : "unable to list home directory",
						});
					}

					Logger.error("picker:open-failed", String(err));
				});
		},
	};
}
