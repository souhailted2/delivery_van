import { ReactNode } from "react";
import { useLocation } from "wouter";
import { cn } from "../../lib/utils";
import { CommandBar } from "./CommandBar";
import { SectionSubnav } from "./SectionSubnav";

// ALLAL Command Center shell.
//   Brand → Command Bar → Environment → Dashboard.
// The top Command Bar replaces the vertical sidebar; on the dashboard the shell
// is transparent so the persistent Operations Center scene (ExperienceBackground)
// is the visible environment the UI lives inside.
export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const commandCenter = location === "/";

  return (
    <div className={cn("flex min-h-screen w-full flex-col", commandCenter ? "bg-transparent" : "bg-background")}>
      <CommandBar />
      <SectionSubnav />
      <main className="flex-1 overflow-auto p-4 lg:p-6">{children}</main>
    </div>
  );
}
