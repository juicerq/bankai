import "./register-dom";
import { SERVER_DEFAULT_PORT } from "@shared/server";

export const TEST_AUTH_TOKEN = "test-token";

window.bankaiAuth = {
	getToken: () => Promise.resolve({ port: SERVER_DEFAULT_PORT, token: TEST_AUTH_TOKEN }),
};
