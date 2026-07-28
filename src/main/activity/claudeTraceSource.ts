import type { HarnessReading, HarnessTrace } from "@main/activity/Harness";
import { readSpool, type SpoolReading } from "@main/activity/claudeHookTrace";
import { transcriptTrace } from "@main/activity/claudeTrace";

function tracedReading(event: SpoolReading["event"], transcript: HarnessTrace | null): HarnessReading {
	if (!event || event.at < (transcript?.since ?? 0)) {
		return { trace: transcript };
	}
	if (event.trace) {
		return { trace: event.trace };
	}

	return { trace: null, endedAt: event.at };
}

export function fresherReading(spool: SpoolReading, transcript: HarnessTrace | null): HarnessReading {
	const reading = tracedReading(spool.event, transcript);
	if (!spool.attention) {
		return reading;
	}

	return { ...reading, attention: spool.attention };
}

export async function claudeRead(ref: { sessionId: string; cwd: string }): Promise<HarnessReading> {
	const [spool, transcript] = await Promise.all([readSpool(ref), transcriptTrace(ref)]);

	return fresherReading(spool, transcript);
}
