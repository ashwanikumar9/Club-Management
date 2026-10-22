"use client";

import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase connection. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to share data live
 * between devices; without them the app runs in prototype mode on browser storage.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const remoteEnabled = !!url && !!key;

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!remoteEnabled) throw new Error("Supabase is not configured.");
  client ??= createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}

export type CollectionName = "matches" | "tournaments" | "ties";

export interface Row<T> {
  collection: CollectionName;
  id: string;
  data: T;
  version: number;
}

export async function loadCollection<T>(collection: CollectionName): Promise<Row<T>[]> {
  const rows: Row<T>[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase()
      .from("documents")
      .select("collection,id,data,version")
      .eq("collection", collection)
      .range(from, from + page - 1);
    if (error) throw error;
    rows.push(...(data as Row<T>[]));
    if (!data || data.length < page) return rows;
  }
}

export async function fetchRow<T>(collection: CollectionName, id: string): Promise<Row<T> | null> {
  const { data, error } = await supabase()
    .from("documents")
    .select("collection,id,data,version")
    .eq("collection", collection)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as Row<T>) ?? null;
}

export async function insertRows<T>(collection: CollectionName, items: { id: string; version: number; data: T }[]) {
  if (items.length === 0) return;
  const { error } = await supabase()
    .from("documents")
    .upsert(items.map((i) => ({ collection, id: i.id, data: i.data, version: i.version, updated_at: new Date().toISOString() })));
  if (error) throw error;
}

/** Writes `data` only if the stored version is still `expected`. Returns false when it was stale (or not allowed). */
export async function updateRow<T>(collection: CollectionName, id: string, expected: number, data: T, version: number): Promise<boolean> {
  const { data: updated, error } = await supabase()
    .from("documents")
    .update({ data, version, updated_at: new Date().toISOString() })
    .eq("collection", collection)
    .eq("id", id)
    .eq("version", expected)
    .select("id");
  if (error) throw error;
  return (updated ?? []).length > 0;
}

export async function deleteRow(collection: CollectionName, id: string) {
  const { error } = await supabase().from("documents").delete().eq("collection", collection).eq("id", id);
  if (error) throw error;
}

/** Live changes to every document, from any device. */
export function subscribe(onChange: (event: "upsert" | "delete", row: Row<unknown>) => void): RealtimeChannel {
  return supabase()
    .channel("documents")
    .on("postgres_changes", { event: "*", schema: "public", table: "documents" }, (payload) => {
      if (payload.eventType === "DELETE") onChange("delete", payload.old as Row<unknown>);
      else onChange("upsert", payload.new as Row<unknown>);
    })
    .subscribe();
}

/** Identity key for a Supabase user, matching how the app identifies people: lower-case email or +number. */
export function identityOf(user: { email?: string | null; phone?: string | null } | null | undefined): string | null {
  if (!user) return null;
  if (user.email) return user.email.toLowerCase();
  if (user.phone) return `+${user.phone.replace(/^\+/, "")}`;
  return null;
}
