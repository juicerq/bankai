import type { HarnessReading, HarnessTrace } from "@main/activity/Harness";
import { type SpoolEvent, spoolTrace } from "@main/activity/claudeHookTrace";
import { transcriptTrace } from "@main/activity/claudeTrace";

export function fresherReading(event: SpoolEvent | null, transcript: HarnessTrace | null): HarnessReading {
	if (!event || event.at < (transcript?.since ?? 0)) {
		return { trace: transcript };
	}
	if (event.trace) {
		return { trace: event.trace };
	}

	return { trace: null, endedAt: event.at };
}

export async function claudeRead(ref: { sessionId: string; cwd: string }): Promise<HarnessReading> {
	const [event, transcript] = await Promise.all([spoolTrace(ref), transcriptTrace(ref)]);

	return fresherReading(event, transcript);
}
