import { streamSocket } from "@renderer/lib/stream/socket";
import { type BankaiServicesApi, servicesChangedEventSchema } from "@shared/services";

export const servicesStream: BankaiServicesApi = {
	subscribe: () => streamSocket.send("services", "subscribe"),
	onChanged: (listener) => streamSocket.on("services", "changed", servicesChangedEventSchema, listener),
};
