import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { SyncNotice, UserMenu } from "@/components/UserMenu";
import "./globals.css";

/** The database settings are built into the app, so this reflects the deployed version. */
const DATABASE = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const metadata: Metadata = {
  title: "Rally Scorer",
  description: "Live point-by-point scoring for badminton, table tennis and volleyball.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1014" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              Rally Scorer{" "}
              {DATABASE ? (
                <span className="ml-1 rounded bg-accent/15 px-1.5 py-0.5 text-xs font-medium text-accent" title="Connected to the database">
                  ● live
                </span>
              ) : (
                <span className="ml-1 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-normal text-muted" title="No database: data stays in this browser">
                  prototype
                </span>
              )}
            </Link>
            <UserMenu />
          </div>
          <nav className="mx-auto flex max-w-3xl gap-4 px-4 pb-2 text-sm font-medium text-muted">
            <Link href="/">Matches</Link>
            <Link href="/players">Players</Link>
            <Link href="/me">🪪 My card</Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">{children}</main>
        <SyncNotice />
      </body>
    </html>
  );
}
