import { PeekServer } from "@/components/peek/server";
import DashboardLayoutClient from "./layout-client";

/** Server wrapper: reads the Peek cookie so the first HTML is already the right design (no flash). The shell itself is the client layout. */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <PeekServer>
      <DashboardLayoutClient>{children}</DashboardLayoutClient>
    </PeekServer>
  );
}
