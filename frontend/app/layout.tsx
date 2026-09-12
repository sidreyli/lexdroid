import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/shell/app-shell";
import { ReviewProvider } from "@/components/workbench/review-store";
import "./globals.css";

// Every page reads the working store, which moves while a run does. Nothing here may be
// prerendered, or the interface would serve whatever the build machine happened to see.
export const dynamic = "force-dynamic";

const sans = Hanken_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
