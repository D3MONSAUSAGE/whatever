"use client";
import { DashboardShell } from "@/components/shell";
import { ChunkReloadGuard } from "@/components/chunk-reload-guard";

export default function DashboardLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ChunkReloadGuard />
      <DashboardShell>{children}</DashboardShell>
    </>
  );
}
