import type { Metadata } from "next";
import "./globals.css";
import { ProgressProvider } from "@/lib/store";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "NEXORA — From the basics to building for real",
  description:
    "A personalized, gamified programming education platform built around an interactive roadmap.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-graphite text-ink antialiased">
        <ProgressProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-mint focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-graphite"
          >
            Skip to main content
          </a>
          <Header />
          <main id="main">{children}</main>
        </ProgressProvider>
      </body>
    </html>
  );
}
