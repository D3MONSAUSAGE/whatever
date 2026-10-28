"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApi, type DisplayItem, type MediaItem } from "@/lib/api";
import { Status, Tv } from "@/components/tv";

export default function Overview() {
  const displays = useApi<DisplayItem[]>("/api/displays", 10_000);
  const media = useApi<MediaItem[]>("/api/media");
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(location.origin), []);

  if (!displays.data || !media.data) {
    return <p className="text-muted">{displays.error || media.error || "Loading…"}</p>;
  }
  const online = displays.data.filter((d) => d.online).length;

  if (displays.data.length === 0) {
    return (
      <section className="max-w-xl">
        <h1 className="text-2xl font-semibold tracking-tight mb-2">Connect your first TV</h1>
        <p className="text-muted mb-6">It takes about a minute.</p>
        <ol className="space-y-4">
          <Step n={1}>On the TV, open the web browser and go to <strong className="break-all">{origin}/player</strong></Step>
          <Step n={2}>A 6-digit code appears. Enter it under <Link className="underline" href="/dashboard/displays">Displays</Link>.</Step>
          <Step n={3}>Upload an image in <Link className="underline" href="/dashboard/media">Media</Link> and publish it to the TV.</Step>
        </ol>
      </section>
    );
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Your TVs</h1>
      <p className="text-muted mt-1 mb-6">
        {online} of {displays.data.length} online, {media.data.length} {media.data.length === 1 ? "image" : "images"} in your library
      </p>
      <div className="grid gap-6 sm:grid-cols-2">
        {displays.data.map((d) => (
          <Link key={d.id} href="/dashboard/displays" className="block">
            <Tv display={d} />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="font-medium truncate">{d.name}</span>
              <Status display={d} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="size-8 shrink-0 rounded-full bg-ink text-white grid place-items-center font-semibold">{n}</span>
      <span className="pt-1">{children}</span>
    </li>
  );
}
