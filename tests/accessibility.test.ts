import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Accessibility rules for the customer app (redesign phase 8), checked over
 * every screen and component so a new one cannot quietly break them.
 *
 *   - Every tappable tells a screen reader what it is (accessibilityRole).
 *   - One with no words in it (an icon button) also says what it does
 *     (accessibilityLabel).
 *   - The shared buttons, chips and boxes grow with the phone's larger text
 *     setting instead of cutting their words off.
 */

const SRC = join(__dirname, "..", "mobile-app", "src");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

/** Index of the `>` that closes a JSX opening tag, skipping `=>` inside `{…}`. */
function tagEnd(s: string, i: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === quote && s[i - 1] !== "\\") quote = null;
      continue;
    }
    if ((depth > 0 && (ch === '"' || ch === "'" || ch === "`")) || (depth === 0 && ch === '"')) {
      quote = ch;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0) return i;
  }
  return -1;
}

function tappableProblems(): string[] {
  const problems: string[] = [];
  for (const file of tsxFiles(SRC)) {
    if (file.endsWith(join("ds", "Tap.tsx"))) continue; // the wrapper itself
    const s = readFileSync(file, "utf8");
    const re = /<(Tap|PressScale|Pressable|TouchableOpacity)\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const end = tagEnd(s, m.index + 1);
      const attrs = s.slice(m.index, end);
      if (/accessible=\{false\}/.test(attrs)) continue;
      const close = attrs.trimEnd().endsWith("/") ? -1 : s.indexOf(`</${m[1]}>`, end);
      const children = close > 0 ? s.slice(end + 1, close) : "";
      const where = `${file.slice(SRC.length + 1)}:${s.slice(0, m.index).split("\n").length}`;
      if (!/accessibilityRole=/.test(attrs)) problems.push(`${where} has no accessibilityRole`);
      if (!/accessibilityLabel=/.test(attrs) && !/<Text\b/.test(children)) problems.push(`${where} is icon-only with no label`);
    }
  }
  return problems;
}

describe("screen readers", () => {
  it("every tappable has a role, and icon-only ones a label", () => {
    expect(tappableProblems()).toEqual([]);
  });

  it("the scan itself catches a missing role (so a pass means something)", () => {
    const sample = `<Tap onPress={() => go()} style={{ a: 1 }}><Icon /></Tap>`;
    const end = tagEnd(sample, 1);
    expect(sample.slice(0, end)).toContain("style={{ a: 1 }}");
    expect(/accessibilityRole=/.test(sample.slice(0, end))).toBe(false);
  });
});

describe("large text", () => {
  const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

  it("buttons, chips and boxes have a minimum height, not a fixed one", () => {
    expect(read("components/ds/Button.tsx")).toMatch(/minHeight: height,/);
    expect(read("components/ds/Chips.tsx")).toMatch(/minHeight: 34/);
    expect(read("components/ds/Form.tsx")).toMatch(/minHeight: height,/);
    expect(read("components/onboarding/OnbParts.tsx")).toMatch(/minHeight: 56,/);
  });
});

describe("readable text colours", () => {
  // WCAG contrast ratio between two #RRGGBB colours.
  const luminance = (hex: string) => {
    const h = hex.replace("#", "");
    const [r, g, b] = [0, 2, 4]
      .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [x, y] = [luminance(a), luminance(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };

  it("text, muted, faint and brand text pass 4.5:1 on the page, cards and chips, in both themes", async () => {
    const { themeColors } = await import("../mobile-app/src/theme/tokens");
    const failures: string[] = [];
    for (const [theme, t] of Object.entries(themeColors)) {
      for (const fg of ["text", "muted", "faint", "brandText"] as const) {
        for (const bg of ["bg", "card", "chip"] as const) {
          const ratio = contrast((t as any)[fg], (t as any)[bg]);
          if (ratio < 4.5) failures.push(`${theme} ${fg} on ${bg}: ${ratio.toFixed(2)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("the CSS variables say the same as the tokens", () => {
    const css = readFileSync(join(SRC, "..", "global.css"), "utf8");
    expect(css).toMatch(/--mp-faint: #64716C;/);
    expect(css).toMatch(/--mp-faint: #648E7F;/);
  });
});
