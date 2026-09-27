import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/shell/app-shell";
import { ReviewProvider } from "@/components/workbench/review-store";
import "./globals.css";

// Every page reads the working store, which moves while a run does. Nothing here may be
// prerendered, or the interface would serve whatever the build machine happened to see.
export const dynamic = "force-dynamic";

// Vendored rather than fetched. `next/font/google` self-hosts the file it serves, but it downloads
// it from Google at build time, so a clean machine that cannot reach fonts.googleapis.com fails the
// build -- and "a competent programmer reaches a working system on a clean machine in under 30
// minutes" is criterion C4a, tested literally. One variable file covers 400 to 700.
// SIL Open Font License 1.1; the text is beside it in fonts/OFL.txt.
const sans = localFont({
  src: "./fonts/hanken-grotesk-latin.woff2",
  variable: "--font-sans",
  weight: "400 700",
  display: "swap",
  fallback: ["system-ui", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: "LexDroid",
  description:
    "Evidence discovery and regulatory mapping against the ESCAP Regulatory Digital Trade Integration Index.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} h-full antialiased`}>
      <body className="min-h-full">
        <TooltipProvider delayDuration={200}>
          <ReviewProvider>
            <AppShell>{children}</AppShell>
          </ReviewProvider>
        </TooltipProvider>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
