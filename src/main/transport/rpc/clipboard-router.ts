import { ClipboardImage } from "@main/terminal/clipboard-image";
import { base } from "@main/transport/rpc/rpc-base";

export const clipboardRouter = {
	image: base.handler(() => ClipboardImage.save()),
};
