"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Séance du jour" },
  { href: "/journal", label: "Journal" },
  { href: "/regles", label: "Règles" },
  { href: "/parametres", label: "Paramètres" },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Sections">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" || path.startsWith("/seance") : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
