"use client";
import { useParams } from "next/navigation";
import { GroupWorkspace } from "@/components/my-screens";

export default function GroupPage() {
  const params = useParams<{ id: string }>();
  return <GroupWorkspace id={params.id} />;
}
