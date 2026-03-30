"use client";

import { usePathname } from "next/navigation";

export default function ThemeShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");

  return <div className={isAdmin ? "admin-theme" : ""}>{children}</div>;
}
