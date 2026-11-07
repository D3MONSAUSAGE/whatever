import { describe, expect, it } from "vitest";
import { convertPdf } from "@/lib/server/pdf";

function page(text: string, width: number, height: number, id: number, contentId: number) {
  const stream = `BT /F1 24 Tf 72 120 Td (${text}) Tj ET`;
  return {
    page: `${id} 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${width} ${height}]/Contents ${contentId} 0 R/Resources<</Font<</F1 9 0 R>>>>>>endobj`,
    content: `${contentId} 0 obj<</Length ${stream.length}>>stream\n${stream}\nendstream\nendobj`,
  };
}

function pdf(pages: { text: string; width: number; height: number }[]) {
  const kids = pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ");
  const objects = [
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    `2 0 obj<</Type/Pages/Count ${pages.length}/Kids[${kids}]>>endobj`,
  ];
  pages.forEach((entry, index) => {
    const built = page(entry.text, entry.width, entry.height, 3 + index * 2, 4 + index * 2);
    objects.push(built.page, built.content);
  });
  objects.push("9 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj");
  const body = objects.join("\n");
  return new Uint8Array(Buffer.from(`%PDF-1.4\n${body}\ntrailer<</Size 10/Root 1 0 R>>\nstartxref\n0\n%%EOF`));
}

describe("PDF rendering", () => {
  it("renders a multipage PDF and keeps portrait and landscape pages", async () => {
    const rendered = await convertPdf(pdf([
      { text: "Portrait page", width: 612, height: 792 },
      { text: "Landscape page", width: 792, height: 612 },
    ]));
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;
    expect(rendered.slides).toHaveLength(2);
    expect(rendered.slides[0].height).toBeGreaterThan(rendered.slides[0].width);
    expect(rendered.slides[1].width).toBeGreaterThan(rendered.slides[1].height);
    expect(rendered.slides[0].png[0]).toBe(0x89);
  }, 30_000);

  it("renders a single page and rejects a truncated file", async () => {
    const one = await convertPdf(pdf([{ text: "Only", width: 800, height: 450 }]));
    expect(one.ok && one.slides).toHaveLength(1);
    const broken = await convertPdf(new Uint8Array(Buffer.from("%PDF-1.4\nthis is not a pdf")));
    expect(broken.ok).toBe(false);
  }, 30_000);
});
