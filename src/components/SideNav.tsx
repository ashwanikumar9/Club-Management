"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { pendingFor } from "@/lib/meet/registration";
import { useMeets, useRegistrations, useUser } from "@/lib/store";

/** Requests waiting for this person's decision, across every meet they run. */
export function usePendingRequests() {
  const user = useUser();
  const meets = useMeets();
  const regs = useRegistrations();
  return meets ? pendingFor(Object.values(meets), regs, user) : [];
}

const LINKS: { href: string; label: string; icon: string; hint?: string }[] = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/matches/new", label: "Create a match", icon: "＋", hint: "One match, scored live" },
  { href: "/tournaments/new", label: "Create a tournament", icon: "🏆", hint: "League, knockout or groups" },
  { href: "/meets/new", label: "Create a sports meet", icon: "🏅", hint: "Several sports, team registration" },
  { href: "/teams/new", label: "Create a team", icon: "🛡️", hint: "Squad with name + mobile, invite link" },
  { href: "/ties/new", label: "Team tie", icon: "⇄", hint: "Badminton / table tennis team match" },
  { href: "/teams", label: "Teams", icon: "🎽" },
  { href: "/players", label: "Players", icon: "👥" },
  { href: "/me", label: "My card", icon: "🪪" },
];

/** ☰ button in the header and the slide-in menu it opens. */
export function SideNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // The longest link the current page sits under, so /teams/new lights up "Create a team" and not "Teams" too.
  const current = LINKS.map((l) => l.href)
    .filter((h) => (h === "/" ? pathname === "/" : pathname === h || pathname.startsWith(`${h}/`)))
    .sort((a, b) => b.length - a.length)[0];
  const pending = usePendingRequests();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={pending.length ? `Menu, ${pending.length} registration requests waiting` : "Menu"}
        aria-expanded={open}
        className="relative -ml-1 grid h-9 w-9 place-items-center rounded-lg text-xl hover:bg-surface-2"
      >
        ☰
        {pending.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-live px-1 text-[10px] font-bold text-white">
            {pending.length}
          </span>
        )}
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Menu">
            <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <nav className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-surface p-3 shadow-xl">
              <div className="mb-2 flex items-center justify-between px-2 py-1">
                <span className="font-semibold">Rally Scorer</span>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-surface-2">
                  ✕
                </button>
              </div>
              {pending.length > 0 && (
                <Link href={`/meets/${pending[0].meetId}#requests`} onClick={() => setOpen(false)} className="mb-2 rounded-xl bg-live/10 px-3 py-2.5 text-sm font-semibold text-live">
                  🔔 {pending.length} registration request{pending.length > 1 ? "s" : ""} waiting
                </Link>
              )}
              <ul className="space-y-0.5">
                {LINKS.map((l) => {
                  const active = l.href === current;
                  return (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        onClick={() => setOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${active ? "bg-surface-2 font-semibold" : "hover:bg-surface-2"}`}
                      >
                        <span className="w-6 text-center text-lg" aria-hidden>
                          {l.icon}
                        </span>
                        <span className="min-w-0">
                          <span className="block">{l.label}</span>
                          {l.hint && <span className="block text-xs text-muted">{l.hint}</span>}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>,
          document.body,
        )}
    </>
  );
}
