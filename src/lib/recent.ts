"use client";

/** Tournaments and meets this browser opened recently, newest first (for "Your events" on the home page). */
const KEY = "cm.recent.v1";
const MAX = 20;

export interface RecentItem {
  kind: "tournament" | "meet";
  id: string;
  at: string;
}

export function readRecent(): RecentItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as RecentItem[];
  } catch {
    return [];
  }
}

export function rememberVisit(kind: RecentItem["kind"], id: string) {
  try {
    const list = readRecent().filter((r) => !(r.kind === kind && r.id === id));
    localStorage.setItem(KEY, JSON.stringify([{ kind, id, at: new Date().toISOString() }, ...list].slice(0, MAX)));
  } catch {
    // storage blocked: nothing to remember
  }
}

const CITY_KEY = "cm.city.v1";

/** The city the person chose for "Near you". */
export function readCity(): string {
  try {
    return localStorage.getItem(CITY_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveCity(city: string) {
  try {
    if (city.trim()) localStorage.setItem(CITY_KEY, city.trim());
    else localStorage.removeItem(CITY_KEY);
  } catch {
    // ignore
  }
}
