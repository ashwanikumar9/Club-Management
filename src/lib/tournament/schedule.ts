import { MutationError, newId } from "../rally/mutations";
import type { Match, MatchFormat } from "../rally/types";
import type { Tie } from "../tie/types";
import { fixtureOutcome, isByeFixture, resolveSides, type Data } from "./engine";
import type { Entry, EntryPlayer, Fixture, Schedule, Tournament } from "./types";

// ---------------------------------------------------------------------------------------------------------
// Times

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Sort key: scheduled fixtures by date, time, court; unscheduled last. */
export function scheduleKey(s?: Schedule): string {
  if (!s?.date && !s?.time) return "~";
  return `${s.date ?? "9999-99-99"} ${s.time ?? "99:99"} ${s.court ?? ""}`;
}

export function formatSchedule(s?: Schedule): string {
  if (!s || (!s.date && !s.time && !s.court)) return "";
  const parts: string[] = [];
  if (s.date) {
    const d = new Date(`${s.date}T00:00:00Z`);
    parts.push(d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }));
  }
  if (s.time) parts.push(s.time);
  if (s.court) parts.push(s.court);
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------------------------------------
// Auto-scheduler

export interface AutoScheduleOptions {
  /** First day, YYYY-MM-DD. */
  date: string;
  /** First match time and the latest start time each day, HH:MM. */
  startTime: string;
  endTime: string;
  /** Minutes from one match start to the next on a court (play + changeover). */
  minutesPerMatch: number;
  courts: string[];
  /** Time slots a player rests between matches (1 = at least one slot off). */
  restSlots: number;
  /** Keep fixtures that already have a time and only fill the rest. */
  onlyUnscheduled: boolean;
}

/** Order to play fixtures: group rounds interleaved across groups, then knockout rounds (third place before final). */
function playOrder(t: Tournament): Fixture[] {
  const groupOrder = new Map([...t.groups, ...(t.stages ?? []).flatMap((s) => s.groups)].map((g, i) => [g.id, i]));
  const stageOrder = new Map((t.stages ?? []).map((s, i) => [s.id, i + 1]));
  const rank = (f: Fixture) => [
    f.stageId ? (stageOrder.get(f.stageId) ?? 99) : 0,
    f.stage === "group" ? 0 : 1,
    f.round,
    f.third ? 0 : 1,
    f.stage === "group" ? (groupOrder.get(f.groupId ?? "") ?? 0) : 0,
    f.index,
  ];
  return [...t.fixtures].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return 0;
  });
}

/**
 * Gives every playable fixture a date, time and court: courts are filled slot by slot, nobody plays twice
 * in the same slot or without the required rest, and a knockout match is never placed before the matches
 * that decide its players. Days run from `startTime` to `endTime`, then continue the next day.
 */
export function planSchedule(t: Tournament, data: Data, options: AutoScheduleOptions): Map<string, Schedule> {
  const courts = options.courts.map((c) => c.trim()).filter(Boolean);
  if (courts.length === 0) throw new MutationError("Add at least one court.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.date)) throw new MutationError("Choose the first day.");
  if (!/^\d{2}:\d{2}$/.test(options.startTime) || !/^\d{2}:\d{2}$/.test(options.endTime)) throw new MutationError("Enter start and end times.");
  if (!Number.isInteger(options.minutesPerMatch) || options.minutesPerMatch < 5) throw new MutationError("Allow at least 5 minutes per match.");
  const start = toMinutes(options.startTime);
  const end = toMinutes(options.endTime);
  if (end < start) throw new MutationError("The last start time must be after the first.");
  const perDay = Math.floor((end - start) / options.minutesPerMatch) + 1;

  const slotOf = (s: Schedule): number | null => {
    if (!s.date || !s.time) return null;
    const day = Math.round((Date.parse(`${s.date}T00:00:00Z`) - Date.parse(`${options.date}T00:00:00Z`)) / 86_400_000);
    return day * perDay + Math.round((toMinutes(s.time) - start) / options.minutesPerMatch);
  };
  const scheduleOf = (slot: number, court: string): Schedule => ({
    date: addDays(options.date, Math.floor(slot / perDay)),
    time: fromMinutes(start + (slot % perDay) * options.minutesPerMatch),
    court,
  });

  const courtBusy = new Map<number, Set<string>>();
  const playerBusy = new Map<number, Set<string>>();
  const fixtureSlot = new Map<string, number>();
  const mark = (slot: number, court: string, entries: string[]) => {
    if (!courtBusy.has(slot)) courtBusy.set(slot, new Set());
    courtBusy.get(slot)!.add(court);
    if (!playerBusy.has(slot)) playerBusy.set(slot, new Set());
    for (const e of entries) playerBusy.get(slot)!.add(e);
  };

  const done = (f: Fixture) => {
    const outcome = fixtureOutcome(f, data);
    return outcome.status === "live" || outcome.status === "closed";
  };
  const knownEntries = (f: Fixture) => {
    const { a, b } = resolveSides(f, t.fixtures, data);
    return [a, b].filter((x): x is string => !!x);
  };

  const result = new Map<string, Schedule>();
  const order = playOrder(t).filter((f) => !isByeFixture(f));

  // Keep what is already fixed: fixtures being played or finished, and (optionally) already scheduled ones.
  for (const f of order) {
    const keep = done(f) || (options.onlyUnscheduled && f.schedule?.date && f.schedule?.time);
    const slot = keep && f.schedule ? slotOf(f.schedule) : null;
    if (keep && slot !== null) {
      fixtureSlot.set(f.id, slot);
      mark(slot, f.schedule!.court ?? "", knownEntries(f));
    }
  }

  for (const f of order) {
    if (fixtureSlot.has(f.id) || done(f)) continue;
    const entries = knownEntries(f);
    // A knockout match comes after the matches that feed it.
    let earliest = 0;
    for (const source of [f.a, f.b]) {
      if (source.type !== "winner" && source.type !== "loser") continue;
      const feeder = t.fixtures.find((x) => x.id === source.fixtureId);
      if (feeder && !isByeFixture(feeder)) {
        const feederSlot = fixtureSlot.get(feeder.id);
        if (feederSlot !== undefined) earliest = Math.max(earliest, feederSlot + 1 + options.restSlots);
      }
    }
    for (let slot = earliest; ; slot++) {
      const busyCourts = courtBusy.get(slot) ?? new Set();
      const court = courts.find((c) => !busyCourts.has(c));
      if (!court) continue;
      const clash = entries.some((e) => {
        for (let s = slot - options.restSlots; s <= slot + options.restSlots; s++) if (playerBusy.get(s)?.has(e)) return true;
        return false;
      });
      if (clash) continue;
      fixtureSlot.set(f.id, slot);
      mark(slot, court, entries);
      result.set(f.id, scheduleOf(slot, court));
      break;
    }
  }
  return result;
}

/** Applies schedules to fixtures and copies them onto their matches / ties that haven't finished. */
export function applySchedules(
  t: Tournament,
  data: Data,
  schedules: Map<string, Schedule | undefined>,
): { tournament: Tournament; matches: Match[]; ties: Tie[] } {
  const fixtures = t.fixtures.map((f) => (schedules.has(f.id) ? { ...f, schedule: schedules.get(f.id) } : f));
  const matches: Match[] = [];
  const ties: Tie[] = [];
  for (const f of fixtures) {
    if (!schedules.has(f.id)) continue;
    if (f.matchId) {
      const m = data.matches[f.matchId];
      if (m && m.status !== "closed") matches.push({ ...m, schedule: f.schedule });
    }
    if (f.tieId) {
      const x = data.ties[f.tieId];
      if (x) ties.push({ ...x, schedule: f.schedule });
    }
  }
  return { tournament: { ...t, fixtures }, matches, ties };
}

function requireOrganiser(t: Tournament, by: string) {
  if (t.organiser !== by) throw new MutationError("Only the organiser can change the schedule.");
}

export function autoSchedule(t: Tournament, by: string, data: Data, options: AutoScheduleOptions) {
  requireOrganiser(t, by);
  if (t.fixtures.length === 0) throw new MutationError("Generate fixtures first.");
  const plan = planSchedule(t, data, options);
  const result = applySchedules(t, data, plan);
  return { ...result, tournament: { ...result.tournament, courts: options.courts.map((c) => c.trim()).filter(Boolean) } };
}

export function setFixtureSchedule(t: Tournament, by: string, data: Data, fixtureId: string, schedule: Schedule) {
  requireOrganiser(t, by);
  if (!t.fixtures.some((f) => f.id === fixtureId)) throw new MutationError("Fixture not found.");
  if (schedule.time && !/^\d{2}:\d{2}$/.test(schedule.time)) throw new MutationError("Time must be HH:MM.");
  const clean: Schedule = {
    date: schedule.date || undefined,
    time: schedule.time || undefined,
    court: schedule.court?.trim() || undefined,
  };
  const result = applySchedules(t, data, new Map([[fixtureId, clean.date || clean.time || clean.court ? clean : undefined]]));
  const courts = clean.court && !t.courts.includes(clean.court) ? [...t.courts, clean.court] : t.courts;
  return { ...result, tournament: { ...result.tournament, courts } };
}

export function setCourts(t: Tournament, by: string, courts: string[]): Tournament {
  requireOrganiser(t, by);
  const clean = [...new Set(courts.map((c) => c.trim()).filter(Boolean))];
  if (clean.length === 0) throw new MutationError("Add at least one court.");
  return { ...t, courts: clean };
}

// ---------------------------------------------------------------------------------------------------------
// Bulk entries: paste a list (from a spreadsheet, WhatsApp, …), one entry per line

export interface ParsedEntry {
  name: string;
  players: EntryPlayer[];
  seed?: number;
}

function parsePlayer(text: string): EntryPlayer {
  const m = text.trim().match(/^#\s*(\w+)\s+(.+)$/);
  return m ? { jersey: m[1], name: m[2].trim() } : { name: text.trim() };
}

/**
 * One entry per line, optionally ending with "| seed":
 * - singles: `Riya Sharma`
 * - doubles: `Meera / Karan` or `Pair name: Meera / Karan`
 * - team: `Eagles: #7 Kiran, Arjun, Vikram` (players separated by commas; "#7" is a jersey number)
 * Spreadsheet rows (tab separated) work too: first column the name, then players.
 */
export function parseBulkEntries(format: MatchFormat, text: string): { entries: ParsedEntry[]; errors: string[] } {
  const entries: ParsedEntry[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    let line = raw.trim();
    if (!line) return;
    let seed: number | undefined;
    const seedMatch = line.match(/\|\s*(\d+)\s*$/);
    if (seedMatch) {
      seed = Number(seedMatch[1]);
      line = line.slice(0, seedMatch.index).trim();
    }
    if (line.includes("\t")) {
      const [name, ...rest] = line.split("\t").map((c) => c.trim()).filter(Boolean);
      line = format === "singles" ? name : `${name}: ${rest.join(format === "doubles" ? " / " : ", ")}`;
    }
    const [head, tail] = line.includes(":") ? [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 1)] : ["", line];
    let players: EntryPlayer[];
    if (format === "singles") players = [parsePlayer(line)];
    else if (format === "doubles") players = tail.split(/\s*[/&]\s*|\s*,\s*/).filter(Boolean).map(parsePlayer);
    else players = tail.split(",").map((p) => p.trim()).filter(Boolean).map(parsePlayer);
    const name = format === "singles" ? players[0].name : head.trim() || players.map((p) => p.name).join(" / ");
    if (format === "doubles" && players.length !== 2) {
      errors.push(`Line ${i + 1}: a pair needs two players ("Name / Name").`);
      return;
    }
    if (format === "team" && !head.trim()) {
      errors.push(`Line ${i + 1}: start with the team name, then a colon ("Eagles: Kiran, Arjun").`);
      return;
    }
    entries.push({ name, players: format === "team" && players.length === 0 ? [] : players, seed });
  });
  return { entries, errors };
}

/** Adds many entries at once (with optional seeds). */
export function addEntries(t: Tournament, by: string, parsed: ParsedEntry[]): Tournament {
  if (t.organiser !== by) throw new MutationError("Only the organiser can change the tournament.");
  if (t.phase !== "setup") throw new MutationError("Fixtures have been generated; entries are locked.");
  const names = new Set(t.entries.map((e) => e.name.toLowerCase()));
  const added: Entry[] = [];
  for (const p of parsed) {
    if (names.has(p.name.toLowerCase())) throw new MutationError(`${p.name} is already in the tournament.`);
    names.add(p.name.toLowerCase());
    added.push({ id: newId(), name: p.name, players: p.players });
  }
  let entries = [...t.entries, ...added];
  // Seeds from the list win; anyone already holding that seed loses it.
  added.forEach((entry, i) => {
    const seed = parsed[i].seed;
    if (!seed) return;
    if (seed < 1 || seed > entries.length) throw new MutationError(`Seed ${seed} is out of range (1–${entries.length}).`);
    entries = entries.map((e) => (e.id === entry.id ? { ...e, seed } : e.seed === seed ? { ...e, seed: undefined } : e));
  });
  return { ...t, entries };
}

// ---------------------------------------------------------------------------------------------------------
// Schedule import: paste rows from a spreadsheet, "Team A vs Team B, date, time, court"

/**
 * Matches each row to a fixture between those two entries (either order; the first one without a time
 * when the pair meets more than once) and sets its date, time and court. Dates as YYYY-MM-DD or DD/MM/YYYY,
 * times as HH:MM (24h) or h:mm am/pm.
 */
export function parseScheduleImport(t: Tournament, data: Data, text: string): { schedules: Map<string, Schedule>; errors: string[] } {
  const schedules = new Map<string, Schedule>();
  const errors: string[] = [];
  const byName = new Map(t.entries.map((e) => [e.name.toLowerCase(), e.id]));
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const cells = line.split(/\t|,(?![^()]*\))/).map((c) => c.trim());
    const vs = cells[0].split(/\s+(?:vs\.?|v)\s+/i);
    let [aName, bName] = vs;
    let rest = cells.slice(1);
    if (vs.length !== 2) {
      [aName, bName] = cells;
      rest = cells.slice(2);
    }
    const a = byName.get((aName ?? "").toLowerCase());
    const b = byName.get((bName ?? "").toLowerCase());
    if (!a || !b) {
      errors.push(`Line ${i + 1}: couldn't find ${!a ? `"${aName}"` : `"${bName}"`} in the entries.`);
      return;
    }
    const candidates = t.fixtures.filter((f) => {
      const { a: x, b: y } = resolveSides(f, t.fixtures, data);
      return (x === a && y === b) || (x === b && y === a);
    });
    const fixture = candidates.find((f) => !schedules.has(f.id) && !f.schedule?.time) ?? candidates.find((f) => !schedules.has(f.id));
    if (!fixture) {
      errors.push(`Line ${i + 1}: no fixture between ${aName} and ${bName}.`);
      return;
    }
    const [dateText = "", timeText = "", court = ""] = rest;
    const date = parseDate(dateText);
    const time = parseTime(timeText);
    if (dateText && !date) errors.push(`Line ${i + 1}: date "${dateText}" not understood (use YYYY-MM-DD or DD/MM/YYYY).`);
    if (timeText && !time) errors.push(`Line ${i + 1}: time "${timeText}" not understood (use 14:30 or 2:30 pm).`);
    schedules.set(fixture.id, { date: date ?? undefined, time: time ?? undefined, court: court || undefined });
  });
  return { schedules, errors };
}

function parseDate(text: string): string | null {
  let iso: string | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) iso = text;
  const m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) iso = `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  // Reject impossible dates such as 31/02 or month 13.
  const time = iso ? Date.parse(`${iso}T00:00:00Z`) : Number.NaN;
  if (!iso || Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

function parseTime(text: string): string | null {
  const m = text.toLowerCase().replace(/\s+/g, "").match(/^(\d{1,2})[:.](\d{2})(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3] === "pm" && h < 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  if (h > 23 || Number(m[2]) > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

export function importSchedule(t: Tournament, by: string, data: Data, text: string) {
  requireOrganiser(t, by);
  const { schedules, errors } = parseScheduleImport(t, data, text);
  if (errors.length) throw new MutationError(errors.join(" "));
  if (schedules.size === 0) throw new MutationError("Paste at least one row.");
  const result = applySchedules(t, data, schedules);
  const courts = [...new Set([...t.courts, ...[...schedules.values()].map((s) => s.court).filter((c): c is string => !!c)])];
  return { ...result, tournament: { ...result.tournament, courts } };
}

/** The schedule as plain text (e.g. to share on WhatsApp). */
export function scheduleText(t: Tournament, data: Data, name: (id?: string) => string | undefined): string {
  const rows = playOrder(t)
    .filter((f) => !isByeFixture(f))
    .sort((a, b) => scheduleKey(a.schedule).localeCompare(scheduleKey(b.schedule)));
  const lines = [t.name];
  let day = "";
  for (const f of rows) {
    const { a, b } = resolveSides(f, t.fixtures, data);
    const when = f.schedule?.date ?? "Not scheduled";
    if (when !== day) {
      day = when;
      lines.push("", f.schedule?.date ? formatSchedule({ date: f.schedule.date }) : "Not scheduled");
    }
    const time = [f.schedule?.time, f.schedule?.court].filter(Boolean).join(" · ");
    lines.push(`${time ? `${time}  ` : ""}${name(a) ?? "TBD"} vs ${name(b) ?? "TBD"}`);
  }
  return lines.join("\n");
}
