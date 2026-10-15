import type { Schedule, ScheduleId } from "../ports/schedule.js";

/**
 * Queries over a set of schedules (WP26 / A06).
 *
 * Split out of `schedule.ts` under the file-size gate, and split on a real
 * boundary: that module *decides* (validate, derive due work, settle, lease),
 * while this one *asks about* a collection. Keeping lookups next to the
 * decisions would invite a caller to filter a list here and then act on it
 * there, and the filter would quietly become a policy.
 *
 * Tombstones are visible here on purpose. `liveSchedules` hides them because
 * that is what a person listing their schedules should see; `findSchedule`
 * does not, because "does this id still exist" and "may I still create work for
 * it" are different questions and a lookup that answered the first would make
 * the second unanswerable.
 */

/** Schedules the caller may still see: not tombstoned. */
export function liveSchedules(schedules: ReadonlyArray<Schedule>): ReadonlyArray<Schedule> {
  return schedules.filter((schedule) => schedule.tombstonedAtMs === undefined);
}

/** Look one schedule up by id, including tombstoned ones. */
export function findSchedule(
  schedules: ReadonlyArray<Schedule>,
  scheduleId: ScheduleId,
): Schedule | undefined {
  return schedules.find((schedule) => schedule.id === scheduleId);
}

/**
 * Tombstoned schedules, which a caller prunes from its own record but must not
 * report as deleted-before-they-were.
 *
 * Kept as a separate question because the retention decision belongs to the
 * host: how long a tombstone survives is a storage policy, and this module only
 * says which ones have one.
 */
export function tombstonedSchedules(schedules: ReadonlyArray<Schedule>): ReadonlyArray<Schedule> {
  return schedules.filter((schedule) => schedule.tombstonedAtMs !== undefined);
}
