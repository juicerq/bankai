export const SHELL = process.platform === "win32"
	? process.env.ComSpec || "cmd.exe"
	: process.env.SHELL || "/bin/sh";
