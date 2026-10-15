// Architecture fixture — NEVER compiled (lives under testdata/, not src/).
// These are exactly the dependency directions the settings package is allowed:
// a node builtin, the settings port contract, and a sibling settings module.
// The boundary scanner must report ZERO violations for this file.
import path from "node:path";
import type { SettingsPort } from "../ports/settings.js";
import { PACKAGED_DEFAULTS } from "../settings/schema.js";

export const allowed = [path, PACKAGED_DEFAULTS];
export type Allowed = SettingsPort;
