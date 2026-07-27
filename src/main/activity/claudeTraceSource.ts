import type { HarnessTrace } from "@main/activity/Harness";
import { type SpoolEvent, spoolTrace } from "@main/activity/claudeHookTrace";
import { transcriptTrace } from "@main/activity/claudeTrace";

export function fresherTrace(event: SpoolEvent | null, transcript: HarnessTrace | null): HarnessTrace | null {
	if (event && event.at >= (transcript?.since ?? 0)) {
		return event.trace;
	}

	return transcript;
}

export async function claudeTrace(ref: { sessionId: string; cwd: string }): Promise<HarnessTrace | null> {
	const [event, transcript] = await Promise.all([spoolTrace(ref), transcriptTrace(ref)]);

	return fresherTrace(event, transcript);
}
