import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SideNav } from "@/components/SideNav";
import { SyncNotice, UserMenu } from "@/components/UserMenu";
import "./globals.css";

/** The database settings are built into the app, so this reflects the deployed version. */
const DATABASE =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

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
          <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2.5">
            {/* The menu reads the current address, which is only known at request time. */}
            <Suspense fallback={<span className="grid h-9 w-9 place-items-center text-xl">☰</span>}>
              <SideNav />
            </Suspense>
            <Link href="/" className="mr-auto truncate font-semibold tracking-tight">
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
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">{children}</main>
        <SyncNotice />
      </body>
    </html>
  );
}
