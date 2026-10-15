/**
 * Scanner fixture: must trigger every forbidden segment plus a bare package.
 * This file is never compiled into the product; it exists only so the boundary
 * test can prove its detector is discriminating.
 */

import assert from "node:assert/strict";
import { join } from "node:path";
import "../../../src/internal/surface/cli/projection.js";
import "../../../src/internal/cmd/trylo/main.js";
import "../../../src/internal/loop/runner.js";
import "../../../src/internal/adapters/provider/openai-compatible.js";
import "../../../src/internal/compaction/service.js";
import "../../../src/internal/adapters/session-store/journal.js";
import "../../../src/internal/settings/merge.js";
import "../../../src/internal/config/layers.js";
import "../../../src/internal/mcp/registry.js";
import "../../../src/internal/learning/control/board.js";
import "left-pad";

export const fixture = { assert, join };
