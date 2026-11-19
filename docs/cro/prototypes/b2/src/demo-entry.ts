/**
 * Live template demo for the Option B prototype. Bundles Pekko's real browser-side menu renderer (the same
 * designSvg the menu designer uses) so a visitor can type a business name, an item and a price and see the actual
 * template output. Build: node docs/cro/prototypes/b2/build-demo.mjs
 */
import { designSvg } from "@/lib/menu-design-svg";
import { designById, designDocument } from "@/lib/menu-designs";

type Input = { title: string; itemName: string; itemPrice: string };

function docFor(id: string, input: Input) {
  const design = designById(id);
  if (!design) throw new Error(`Unknown template ${id}`);
  const doc = designDocument(design);
  const sections = doc.sections.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i })) }));
  if (input.title.trim()) doc.title = input.title.trim().slice(0, 40);
  const first = sections[0]?.items[0];
  if (first && input.itemName.trim()) first.name = input.itemName.trim().slice(0, 40);
  if (first && input.itemPrice.trim()) first.price = input.itemPrice.trim().slice(0, 12);
  return { ...doc, sections };
}

/** Stock photo ids a template needs (board photo and item photos), so the page can load just those. */
function photos(id: string): string[] {
  const doc = docFor(id, { title: "", itemName: "", itemPrice: "" });
  const ids = new Set<string>();
  if (doc.stockPhoto) ids.add(doc.stockPhoto);
  for (const s of doc.sections) for (const i of s.items) if (i.stockPhoto) ids.add(i.stockPhoto);
  return [...ids];
}

function render(id: string, input: Input, hrefs: Record<string, string>): string {
  const doc = docFor(id, input);
  return designSvg(doc, { stockHref: doc.stockPhoto ? hrefs[doc.stockPhoto] ?? null : null, stockHrefs: hrefs });
}

function defaults(id: string): Input {
  const doc = docFor(id, { title: "", itemName: "", itemPrice: "" });
  const first = doc.sections[0]?.items[0];
  return { title: doc.title, itemName: first?.name ?? "", itemPrice: first?.price ?? "" };
}

(window as unknown as { PekkoDemo: unknown }).PekkoDemo = { render, photos, defaults };
