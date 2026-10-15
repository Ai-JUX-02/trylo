import {
  parseEpisodeArray,
  parseTaskFamily,
  parseTrajectory,
  type ParseResult,
} from "../shared/parse.js";
import type { SkillEpisode } from "./inducer.js";

export function parseSkillEpisode(value: unknown): ParseResult<SkillEpisode> {
  if (!isRecord(value)) {
    return { ok: false, reason: "skill episode is not an object" };
  }
  const id = nonEmpty(value, "id");
  if (!id.ok) {
    return id;
  }
  const family = parseTaskFamily(value.taskFamily);
  if (!family.ok) {
    return family;
  }
  const trajectory = parseTrajectory(value.trajectory);
  if (!trajectory.ok) {
    return trajectory;
  }
  const outcome = value.outcome;
  if (outcome !== "success" && outcome !== "failure") {
    return { ok: false, reason: "outcome must be success or failure" };
  }
  if (!Array.isArray(value.steps) || value.steps.some((item) => typeof item !== "string")) {
    return { ok: false, reason: "steps must be string[]" };
  }
  if (!Array.isArray(value.checks) || value.checks.some((item) => typeof item !== "string")) {
    return { ok: false, reason: "checks must be string[]" };
  }
  const episode: SkillEpisode = {
    id: id.value,
    taskFamily: family.value,
    trajectory: trajectory.value,
    outcome,
    steps: value.steps,
    checks: value.checks,
  };
  if (typeof value.failureMode === "string" && value.failureMode.length > 0) {
    return { ok: true, value: { ...episode, failureMode: value.failureMode } };
  }
  return { ok: true, value: episode };
}

export function parseSkillEpisodeList(text: string): ParseResult<SkillEpisode[]> {
  return parseEpisodeArray(text, parseSkillEpisode);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(
  value: Record<string, unknown>,
  key: string,
): ParseResult<string> {
  const field = value[key];
  if (typeof field !== "string" || field.trim().length === 0) {
    return { ok: false, reason: `${key} must be a non-empty string` };
  }
  return { ok: true, value: field };
}
