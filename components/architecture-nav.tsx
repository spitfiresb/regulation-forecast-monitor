"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Database, Workflow } from "lucide-react";

export function ArchitectureNav() {
  const pathname = usePathname();
  return (
    <nav className="architecture-nav" aria-label="Architecture views">
      {[
        { href: "/architecture", label: "System flow", icon: Workflow },
        {
          href: "/architecture/data-model",
          label: "Data model",
          icon: Database,
        },
      ].map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href ? "page" : undefined}
        >
          <Icon size={18} aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
