import { ErrorView } from "@/components/error-view";

export default function NotFound() {
  return <ErrorView title="Page not found" body="That page doesn't exist, or it moved." />;
}
