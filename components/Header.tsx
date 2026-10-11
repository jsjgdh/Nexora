"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useProgress } from "@/lib/store";
import { ALL_MISSIONS } from "@/lib/missions";
import { COMPETENCIES, STAGES } from "@/lib/curriculum";
import { cn } from "@/lib/format";

const NAV = [
  { href: "/", label: "Roadmap" },
  { href: "/projects", label: "Projects" },
  { href: "/skills", label: "Skills" },
  { href: "/profile", label: "Profile" },
];

interface SearchHit {
  kind: "Mission" | "Skill" | "Stage";
  title: string;
  sub: string;
  href: string;
}

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { state } = useProgress();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const hits: SearchHit[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: SearchHit[] = [];
    for (const m of ALL_MISSIONS) {
      if (
        m.title.toLowerCase().includes(q) ||
        m.tagline.toLowerCase().includes(q) ||
        m.id.replace(/-/g, " ").includes(q)
      ) {
        out.push({
          kind: "Mission",
          title: m.title,
          sub: `Stage 1 · ${m.type}`,
          href: `/mission/${m.id}`,
        });
      }
    }
    for (const c of COMPETENCIES) {
      if (c.name.toLowerCase().includes(q) || c.domain.toLowerCase().includes(q)) {
        out.push({ kind: "Skill", title: c.name, sub: c.domain, href: "/skills" });
      }
    }
    for (const s of STAGES) {
      if (s.title.toLowerCase().includes(q)) {
        out.push({
          kind: "Stage",
          title: `Stage ${s.num} · ${s.title}`,
          sub: s.goal,
          href: "/",
        });
      }
    }
    return out.slice(0, 8);
  }, [query]);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  // Compact chrome inside the workspace to conserve coding space.
  const inWorkspace = pathname.startsWith("/mission/");

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-graphite/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2" aria-label="NEXORA home">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-mint font-mono text-sm font-bold text-graphite"
          >
            N
          </span>
          <span className="text-[15px] font-bold tracking-wide">
            NEXORA
            <span className="ml-2 hidden text-xs font-medium text-muted sm:inline">
              Web Development
            </span>
          </span>
        </Link>

        {!inWorkspace && (
          <nav aria-label="Primary" className="ml-2 hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={pathname === n.href ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-elevated-2 hover:text-ink",
                  pathname === n.href && "bg-elevated-2 text-mint"
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Search: missions, concepts, skills */}
          <div ref={boxRef} className="relative hidden sm:block">
            <label htmlFor="site-search" className="sr-only">
              Search lessons, concepts, and skills
            </label>
            <input
              id="site-search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
                setHighlight(0);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHighlight((h) => Math.min(h + 1, hits.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHighlight((h) => Math.max(h - 1, 0));
                } else if (e.key === "Enter" && hits[highlight]) {
                  router.push(hits[highlight].href);
                  setOpen(false);
                  setQuery("");
                } else if (e.key === "Escape") {
                  setOpen(false);
                }
              }}
              placeholder="Search lessons…"
              role="combobox"
              aria-expanded={open && hits.length > 0}
              aria-controls="search-results"
              aria-activedescendant={hits[highlight] ? `hit-${highlight}` : undefined}
              className="w-44 rounded-lg border border-line bg-elevated px-3 py-1.5 text-sm text-ink placeholder:text-muted/70 focus:border-mint focus:outline-none lg:w-56"
            />
            {open && hits.length > 0 && (
              <ul
                id="search-results"
                role="listbox"
                aria-label="Search results"
                className="absolute right-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-lg border border-line bg-elevated shadow-xl"
              >
                {hits.map((h, i) => (
                  <li key={`${h.kind}-${h.title}`} id={`hit-${i}`} role="option" aria-selected={i === highlight}>
                    <Link
                      href={h.href}
                      onClick={() => {
                        setOpen(false);
                        setQuery("");
                      }}
                      onMouseEnter={() => setHighlight(i)}
                      className={cn(
                        "block px-3 py-2",
                        i === highlight ? "bg-elevated-2" : ""
                      )}
                    >
                      <span className="text-[10px] font-bold tracking-wider text-muted uppercase">
                        {h.kind}
                      </span>
                      <span className="block truncate text-sm font-medium text-ink">
                        {h.title}
                      </span>
                      <span className="block truncate text-xs text-muted">{h.sub}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <span
            className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-muted lg:inline-flex"
            title="Experience points: earned by completing missions, never a proof of mastery"
          >
            <span aria-hidden="true" className="text-mint">◆</span>
            {state.xp} XP
          </span>
          {state.activeDays.length > 0 && (
            <span
              className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-muted lg:inline-flex"
              title="Active learning days. Breaks never cost progress."
            >
              <span aria-hidden="true">◍</span>
              {state.activeDays.length}d active
            </span>
          )}
          <Link
            href="/profile"
            aria-label="Profile and settings"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-elevated-2 text-sm font-bold text-mint hover:border-mint"
          >
            {(state.profile.name || "?").slice(0, 1).toUpperCase()}
          </Link>
        </div>
      </div>
      {/* Mobile nav row */}
      {!inWorkspace && (
        <nav aria-label="Primary mobile" className="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={pathname === n.href ? "page" : undefined}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted hover:bg-elevated-2 hover:text-ink",
                pathname === n.href && "bg-elevated-2 text-mint"
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
