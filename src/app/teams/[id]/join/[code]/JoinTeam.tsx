"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { TeamCard } from "@/components/TeamBits";
import { identityKind } from "@/lib/identity";
import { joinTeamByLink, usePlayerContacts, usePlayers, useTeam, useUser } from "@/lib/store";
import type { Team } from "@/lib/teams/teams";

export function JoinTeam({ params }: { params: Promise<{ id: string; code: string }> }) {
  const { id, code } = use(params);
  const team = useTeam(id);
  if (team === undefined) return <p className="py-10 text-center text-muted">Loading…</p>;
  if (team === null) return <p className="py-10 text-center text-muted">This team does not exist.</p>;
  return <Join team={team} code={code} />;
}

function Join({ team, code }: { team: Team; code: string }) {
  const router = useRouter();
  const user = useUser();
  const contacts = usePlayerContacts();
  const cards = usePlayers();
  const myCard = user ? contacts.find((c) => c.contact === user)?.playerId : undefined;
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shownName = name || (myCard && cards?.[myCard]?.name) || "";

  if (myCard && team.players.some((p) => p.cardId === myCard)) {
    return (
      <div className="space-y-4 py-4">
        <TeamCard team={team} />
        <p className="rounded-2xl border-2 border-accent bg-accent/10 p-4 text-center font-semibold">You&rsquo;re in this team.</p>
        <Link href={`/teams/${team.id}`} className="btn-grad block rounded-xl py-3 text-center font-semibold">
          See the team
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-4">
      <h1 className="text-xl font-bold">Join a team</h1>
      <TeamCard team={team} href={null} />
      {code !== team.inviteCode ? (
        <p className="rounded-2xl border border-border bg-surface p-4 text-sm">This invite link is no longer valid. Ask the captain for a new one.</p>
      ) : !user || identityKind(user) === "username" ? (
        <p className="rounded-2xl border border-border bg-surface p-4 text-sm">
          Sign in (top right) with your mobile number first. It&rsquo;s your player ID: your results for {team.name} go to the player card linked to it.
        </p>
      ) : (
        <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm text-muted">Joining as {user}</p>
          <input value={shownName} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name" autoComplete="name" />
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!shownName.trim()) return setError("Enter your name.");
              setBusy(true);
              void joinTeamByLink(team, code, shownName, user).then((err) => {
                setBusy(false);
                if (err) setError(err);
                else router.push(`/teams/${team.id}`);
              });
            }}
            className="btn-grad w-full rounded-xl py-3 font-semibold disabled:opacity-60"
          >
            {busy ? "Joining…" : `Join ${team.name}`}
          </button>
        </div>
      )}
    </div>
  );
}
