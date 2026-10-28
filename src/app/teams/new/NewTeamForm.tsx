"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SportPicker } from "@/components/SportPicker";
import { ActionBar } from "@/components/Wizard";
import { MutationError } from "@/lib/rally/mutations";
import type { SportKey } from "@/lib/rally/types";
import { createTeam } from "@/lib/teams/teams";
import { saveTeam, useTeams, useUser } from "@/lib/store";

/** Name, sport and city; players are added on the team's page. */
export function NewTeamForm() {
  const router = useRouter();
  const user = useUser();
  const teams = useTeams();
  const [sport, setSport] = useState<SportKey>("badminton");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!user) return <p className="py-10 text-center text-muted">Sign in first (top right). You manage the teams you create.</p>;

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const team = createTeam({ name, sport, city, by: user }, Object.values(teams ?? {}));
          await saveTeam(team);
          router.push(`/teams/${team.id}`);
        } catch (err) {
          if (err instanceof MutationError) setError(err.message);
          else throw err;
        }
      }}
    >
      <h1 className="text-xl font-bold">New team</h1>
      <SportPicker value={sport} onChange={setSport} />
      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Team name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Smashers BC" autoFocus />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">City</span>
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Patna" />
        </label>
        <p className="text-xs text-muted">Next you add players: one by one, by pasting a list, or by sharing an invite link.</p>
      </section>
      {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <ActionBar>
        <button type="submit" className="btn-grad w-full rounded-xl py-3 font-semibold">
          Create team
        </button>
      </ActionBar>
    </form>
  );
}
