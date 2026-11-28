import { PeekServer } from "@/components/peek/server";

/** The guest menu designer is the product, so it uses the web app's (Peek) look, like the sign-in pages. */
export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return <PeekServer>{children}</PeekServer>;
}
