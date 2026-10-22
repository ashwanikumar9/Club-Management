import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { RoleSwitch } from "@/components/RoleSwitch";
import "./globals.css";

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
              Rally Scorer <span className="ml-1 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-normal text-muted">prototype</span>
            </Link>
            <RoleSwitch />
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">{children}</main>
      </body>
    </html>
  );
}
