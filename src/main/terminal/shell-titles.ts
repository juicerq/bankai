// eslint-disable-next-line no-control-regex
const OSC_TITLE = /\u001b\][02];([^\u0007\u001b]*)(?:\u0007|\u001b\\)/g;

const TITLE_TAIL = 256;

const tails = new Map<string, string>();
const titles = new Map<string, string>();

function noteShellTitle(shellId: string, data: string): void {
	const combined = (tails.get(shellId) ?? "") + data;
	const latest = [...combined.matchAll(OSC_TITLE)].at(-1)?.[1]?.trim();

	if (latest) {
		titles.set(shellId, latest);
	}

	tails.set(shellId, combined.slice(-TITLE_TAIL));
}

const shellTitles: ReadonlyMap<string, string> = titles;

function forgetShellTitle(shellId: string): void {
	titles.delete(shellId);
	tails.delete(shellId);
}

export const ShellTitles = {
	note: noteShellTitle,
	byShell: shellTitles,
	forget: forgetShellTitle,
};
