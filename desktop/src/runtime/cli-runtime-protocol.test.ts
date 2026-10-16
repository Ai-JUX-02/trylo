// Trylo Desktop — CLI runtime protocol tests (P08 §4.1 / §3.3).

import { describe, expect, it } from 'vitest';
import {
  CLI_RUNTIME_PROTOCOLS,
  DEFAULT_CLI_RUNTIME_PROTOCOL,
  capabilitiesFor,
  isCliRuntimeProtocol,
  parseCliRuntimeProtocol,
  supportsPrewarm,
  supportsSteering,
  supportsWarmReuse,
} from './cli-runtime-protocol';

describe('CliRuntimeProtocol', () => {
  it('defaults to the new CLI for the public source distribution', () => {
    // Product owner selected the new CLI for public source builds.
    expect(DEFAULT_CLI_RUNTIME_PROTOCOL).toBe('trylo-v1');
  });

  it('parses only the two known values', () => {
    expect(parseCliRuntimeProtocol('legacy-stream-json')).toBe('legacy-stream-json');
    expect(parseCliRuntimeProtocol('trylo-v1')).toBe('trylo-v1');
    expect(parseCliRuntimeProtocol('trylo-v2')).toBeNull();
    expect(parseCliRuntimeProtocol(undefined)).toBeNull();
    expect(parseCliRuntimeProtocol(42)).toBeNull();
    expect(isCliRuntimeProtocol('trylo-v1')).toBe(true);
    expect(isCliRuntimeProtocol('nope')).toBe(false);
  });

  it('lists exactly the two protocols', () => {
    expect(CLI_RUNTIME_PROTOCOLS).toEqual(['legacy-stream-json', 'trylo-v1']);
  });
});

describe('capabilities', () => {
  it('keeps every legacy capability on the legacy protocol', () => {
    // A P08 regression here would silently degrade the shipping path.
    expect(capabilitiesFor('legacy-stream-json')).toEqual({
      warmReuse: true,
      prewarm: true,
      steering: true,
      controlFrames: true,
    });
    expect(supportsWarmReuse('legacy-stream-json')).toBe(true);
    expect(supportsPrewarm('legacy-stream-json')).toBe(true);
    expect(supportsSteering('legacy-stream-json')).toBe(true);
  });

  it('keeps warm processes off while enabling framed v1 guidance', () => {
    // §3.3: "预热、warm reuse、sendPromptToProcess 和 steering 在新运行时
    // 路径上必须关闭或明确报告不支持".
    expect(capabilitiesFor('trylo-v1')).toEqual({
      warmReuse: false,
      prewarm: false,
      steering: true,
      controlFrames: true,
    });
    expect(supportsWarmReuse('trylo-v1')).toBe(false);
    expect(supportsPrewarm('trylo-v1')).toBe(false);
    expect(supportsSteering('trylo-v1')).toBe(true);
  });

  it('supports explicit stdio approvals on v1', () => {
    expect(capabilitiesFor('trylo-v1').controlFrames).toBe(true);
  });
});
