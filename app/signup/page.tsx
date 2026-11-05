import { redirect } from "next/navigation";

/** Sign-up lives in /login (mode=up). This keeps a clean public URL for "Start free trial". */
export default function Signup() {
  redirect("/login?mode=up");
}
