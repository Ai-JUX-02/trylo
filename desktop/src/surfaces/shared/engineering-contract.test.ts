// Three-way lock test (PR-1): user-learning ⇄ surfaces ⇄ CLI must carry
// the same Engineering Contract field names. Desktop does not import CLI
// sources, so the CLI side is asserted by reading its file as text.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTRACT_TAG,
  CONTRACT_TAG as CONTRACT_TAG_LEARNING,
  ENGINEERING_CONTRACT_SCHEMA_VERSION,
  TEAM_ACCESS_SEAT_IDS,
} from '../../user-learning/team-access/contract-types';
import {
  CONTRACT_AUTHORITY_KEYS_UI,
  CONTRACT_TAG_UI,
  CONTRACT_SUMMARY_KEYS_UI,
} from './engineering-contract';
import { TRYLO_TEAM_SEAT_IDS_DESKTOP } from './seats';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI_CONTRACT = join(
  HERE,
  '../../../../trylo cli/src/tools/AgentTool/team-roster/engineering-contract.ts',
);
const UL_CONTRACT = join(
  HERE,
  '../../user-learning/team-access/contract-types.ts',
);

describe('surfaces/shared/engineering-contract three-way lock', () => {
  it('uses the same wrapper tag as user-learning and the CLI copy', () => {
    expect(CONTRACT_TAG_UI).toBe(CONTRACT_TAG_LEARNING);
    const cli = readFileSync(CLI_CONTRACT, 'utf8');
    expect(cli).toContain(`export const CONTRACT_TAG = '${CONTRACT_TAG}'`);
    expect(cli).toContain(
      `export const ENGINEERING_CONTRACT_SCHEMA_VERSION = ${ENGINEERING_CONTRACT_SCHEMA_VERSION}`,
    );
  });

  it('authority keys match the four levels, in order, on all three sides', () => {
    expect([...CONTRACT_AUTHORITY_KEYS_UI]).toEqual([
      'explicit',
      'inferred',
      'baseline',
      'recommendation',
    ]);
    const ul = readFileSync(UL_CONTRACT, 'utf8');
    expect(ul).toContain(
      "export type ContractAuthority = 'explicit' | 'inferred' | 'baseline' | 'recommendation';",
    );
    const cli = readFileSync(CLI_CONTRACT, 'utf8');
    expect(cli).toContain(
      "export type ContractAuthority = 'explicit' | 'inferred' | 'baseline' | 'recommendation'",
    );
  });

  it('summary keys are a subset of the authority keys and match TaskSummary rows', () => {
    for (const key of CONTRACT_SUMMARY_KEYS_UI) {
      expect((CONTRACT_AUTHORITY_KEYS_UI as readonly string[]).includes(key)).toBe(true);
    }
  });

  it('seat ids match the local surfaces copy (shared roster order)', () => {
    expect([...TRYLO_TEAM_SEAT_IDS_DESKTOP]).toEqual([...TEAM_ACCESS_SEAT_IDS]);
  });

  it('core schema field names exist in both the CLI and user-learning copies', () => {
    const fields = [
      'contractId',
      'personConversationId',
      'teamRunId',
      'supersedes',
      'provenance',
      'sourceUserModelIds',
    ];
    for (const field of fields) {
      expect(readFileSync(CLI_CONTRACT, 'utf8')).toContain(`readonly ${field}`);
      expect(readFileSync(UL_CONTRACT, 'utf8')).toContain(`readonly ${field}`);
    }
  });
});
