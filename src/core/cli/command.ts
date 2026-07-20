import { setupPi } from "@core/setup/pi";

export async function runCommand(argv: string[]): Promise<boolean> {
	if (argv.length === 0) {
		return false;
	}
	if (argv.length === 2 && argv[0] === "setup" && argv[1] === "pi") {
		const destination = await setupPi();
		console.log(`Pi companion installed: ${destination}`);
		return true;
	}

	throw new Error("usage: bankai [setup pi]");
}
