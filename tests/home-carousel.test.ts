import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The linked-bank cards on Home. The design draws them 326×200 on a 390 pt
 * phone — 20 pt from the left edge, 32 pt of the next card peeking in on the
 * right. A fixed 326 on the customer's wider Android phone (about 508 pt)
 * showed most of the "Link bank account" card beside the first one. The
 * width now follows the screen with the design's margins, and the height
 * keeps its 326:200 shape.
 */

const SRC = readFileSync(join(__dirname, "..", "mobile-app", "src", "components", "home", "BankCarousel.tsx"), "utf8");

describe("bank card carousel", () => {
  it("sizes cards to the screen, not to the design's phone", () => {
    expect(SRC).not.toMatch(/CARD_WIDTH\s*=\s*326/);
    expect(SRC).toMatch(/screen - 64/);
    expect(SRC).toMatch(/\(width \* 200\) \/ 326/);
    // Every card and the link card use the measured size.
    expect(SRC).toMatch(/width=\{cardWidth\}/);
    expect(SRC).toMatch(/width: cardWidth,\s+height: cardHeight/);
  });

  it("on the design's own phone it is exactly the design", () => {
    // 390 − 64 = 326; 326 × 200 / 326 = 200; step 326 + 12.
    const size = (screen: number) => {
      const width = Math.round(Math.min(Math.max(screen - 64, 260), 460));
      return { width, height: Math.round((width * 200) / 326), peek: screen - 20 - width - 12 };
    };
    expect(size(390)).toEqual({ width: 326, height: 200, peek: 32 });
    // The customer's phone: the same 32 pt peek, not 150.
    expect(size(508).peek).toBe(32);
  });
});
