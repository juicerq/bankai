import { activityStream } from "@renderer/lib/stream/activity";
import { streamResync } from "@renderer/lib/stream/resync";
import type { ActivityAttentionEvent } from "@shared/activity";

const DONE_TONES_HZ = [660, 880];
const TONE_SECONDS = 0.14;
const TONE_PEAK = 0.09;

let tones: AudioContext | undefined;

async function playDone(): Promise<void> {
	const audio = (tones ??= new AudioContext());

	if (audio.state === "suspended") {
		await audio.resume();
	}

	for (const [index, hz] of DONE_TONES_HZ.entries()) {
		const startedAt = audio.currentTime + index * TONE_SECONDS;
		const oscillator = audio.createOscillator();
		const gain = audio.createGain();

		oscillator.frequency.value = hz;
		gain.gain.setValueAtTime(0, startedAt);
		gain.gain.linearRampToValueAtTime(TONE_PEAK, startedAt + 0.012);
		gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + TONE_SECONDS);
		oscillator.connect(gain).connect(audio.destination);
		oscillator.start(startedAt);
		oscillator.stop(startedAt + TONE_SECONDS);
	}
}

function announce({ reason, count }: ActivityAttentionEvent): void {
	if (reason === "done") {
		playDone().catch((err) => console.error("done sound failed", err));
	}

	window.bankaiDesktop?.attention(reason, count);
}

function installAttentionAlert(): () => void {
	const stopListening = activityStream.onAttention(announce);
	const stopResync = streamResync.register("watch", () => activityStream.watchAttention());

	activityStream.watchAttention();

	return () => {
		stopListening();
		stopResync();
	};
}

export const AttentionAlert = {
	install: installAttentionAlert,
};
