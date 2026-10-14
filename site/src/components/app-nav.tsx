import { Menu, X } from "lucide-react";
import { Link } from "@/lib/nav";
import { usePathname } from "@/lib/nav";
import { useState } from "react";

const LINKS = [
  { href: "/", label: "Map" },
  { href: "/dashboard", label: "Overview" },
  { href: "/trips", label: "My Trips" },
  { href: "/cities", label: "Cities" },
  { href: "/places", label: "Places" },
  { href: "/albums", label: "Photo Albums" },
  { href: "/journal", label: "Travel Journal" },
  { href: "/wishlist", label: "Wishlist" },
];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" || path.startsWith("/states") : path.startsWith(href));

export function AppNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [seenPath, setSeenPath] = useState(path);
  if (seenPath !== path) {
    setSeenPath(path);
    setOpen(false);
  }

  return (
    <header className="sticky top-0 z-40 bg-paper/90 backdrop-blur border-b border-line">
      <div className="h-14 px-4 sm:px-6 flex items-center gap-6">
        <Link href="/" className="font-display text-[1.35rem] tracking-tight shrink-0">
          Travel Atlas
        </Link>
        <nav className="hidden lg:flex items-center gap-1 text-sm" aria-label="Main">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(path, l.href) ? "page" : undefined}
              className="px-3 py-1.5 rounded-full text-ink-soft hover:text-ink hover:bg-fog aria-[current=page]:bg-ink aria-[current=page]:text-white"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden lg:flex items-center gap-1 text-sm">
          <Link
            href="/settings"
            className="px-3 py-1.5 rounded-full text-ink-soft hover:bg-fog hover:text-ink aria-[current=page]:bg-ink aria-[current=page]:text-white"
            aria-current={path.startsWith("/settings") ? "page" : undefined}
          >
            Backup
          </Link>
        </div>
        <button
          className="ml-auto lg:hidden btn btn-ghost btn-icon"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open && (
        <nav className="lg:hidden border-t border-line bg-paper px-4 py-3 grid gap-1" aria-label="Main">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(path, l.href) ? "page" : undefined}
              className="px-3 py-2.5 rounded-lg text-ink-soft aria-[current=page]:bg-fog aria-[current=page]:text-ink"
            >
              {l.label}
            </Link>
          ))}
          <div className="border-t border-line mt-2 pt-2 flex items-center justify-between">
            <Link href="/settings" className="px-3 py-2.5 text-ink-soft">Backup and settings</Link>
          </div>
        </nav>
      )}
    </header>
  );
}
