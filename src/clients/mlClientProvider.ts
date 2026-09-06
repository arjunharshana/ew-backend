/**
 * The single switch between the mock ML client (for local dev before the
 * ML team's API exists) and the real one. Everything else in the app
 * imports `mlClient` from here, never mlApiClient/mockMlApiClient directly.
 *
 * Flip by setting USE_MOCK_ML=true in .env. Defaults to mock so a fresh
 * clone runs out of the box without the ML team's service running.
 */

import { mlApiClient } from "./mlApiClient";
import { mockMlApiClient } from "./mockMlApiClient";

const useMock = (process.env.USE_MOCK_ML ?? "true").toLowerCase() === "true";

export const mlClient = useMock ? mockMlApiClient : mlApiClient;

if (useMock) {
  // eslint-disable-next-line no-console
  console.warn(
    "[mlClientProvider] Using MOCK ML client. Set USE_MOCK_ML=false once the ML team's API is ready."
  );
}
