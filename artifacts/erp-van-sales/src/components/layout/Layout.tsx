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

  // EXPOSURE: the shell's own background alpha is the single mechanism that
  // dims the Operations Center. On the dashboard it's fully transparent (the OC
  // is the bright, visible environment); on work pages it drops to a HEAVILY
  // TINTED but still translucent background (~85%) so the room stays faintly
  // present everywhere — one continuous space — while data/forms/tables (which
  // sit on their own opaque cards) stay fully readable. NOT fully opaque: an
  // opaque shell would COVER the OC and break the "one environment" identity.
  // The 500ms colour transition makes navigating in/out of the dashboard feel
  // like the room's lights dimming/rising — no scene swap.
  return (
    <div className={cn("flex min-h-screen w-full flex-col transition-colors duration-500 ease-out", commandCenter ? "bg-background/0" : "bg-background/85")}>
      <CommandBar />
      <SectionSubnav />
      <main className="flex-1 overflow-auto p-4 lg:p-6">{children}</main>
    </div>
  );
}
