import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The linked-bank cards on Home. The design draws them 326×200 on a 390 pt
 * phone — 20 pt from the left edge, 32 pt of the next card peeking in on the
 * right. A fixed 326 on the customer's wider Android phone (about 508 pt)
 * showed most of the "Link bank account" card beside the first one, and
 * scaling the height fully with it made the card too tall. The width follows
 * the screen with the design's margins; the height grows only a little.
 */

const SRC = readFileSync(join(__dirname, "..", "mobile-app", "src", "components", "home", "BankCarousel.tsx"), "utf8");

/** The same arithmetic as useCardSize, checked against its source below. */
function size(screen: number) {
  const width = Math.round(Math.min(Math.max(screen - 64, 260), 460));
  const height = Math.round(width < 326 ? (width * 200) / 326 : 200 + (width - 326) * 0.3);
  return { width, height, peek: screen - 20 - width - 12 };
}

describe("bank card carousel", () => {
  it("sizes cards from the screen, not from the design's phone", () => {
    expect(SRC).not.toMatch(/CARD_WIDTH\s*=\s*326/);
    expect(SRC).toMatch(/Math\.round\(Math\.min\(Math\.max\(screen - 64, 260\), 460\)\)/);
    expect(SRC).toMatch(/width < 326 \? \(width \* 200\) \/ 326 : 200 \+ \(width - 326\) \* 0\.3/);
    // Every card and the link card use the measured size.
    expect(SRC).toMatch(/width=\{cardWidth\}/);
    expect(SRC).toMatch(/width: cardWidth,\s+height: cardHeight/);
  });

  it("is exactly the design on the design's phone", () => {
    expect(size(390)).toEqual({ width: 326, height: 200, peek: 32 });
  });

  it("on the customer's wider phone: the same peek, and not too tall", () => {
    const wide = size(508);
    expect(wide.peek).toBe(32);
    expect(wide.height).toBe(235);
    expect(wide.height).toBeLessThan(Math.round((wide.width * 200) / 326));
  });

  it("on a narrow phone it keeps the design's shape", () => {
    expect(size(360)).toEqual({ width: 296, height: 182, peek: 32 });
  });
});
