import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * NativeWind wraps React Native's Pressable to read `className`, and drops a
 * style given as a function — `style={({ pressed }) => …}`. On a real phone
 * that silently undid every row's layout: icon, name and amount stacked
 * instead of side by side, cards without their fill or border, the sheet's
 * close button at the bottom of the sheet. Tap (components/ds/Tap.tsx) keeps
 * such styles; this makes sure nothing goes back to Pressable for them.
 */

const SRC = join(__dirname, "..", "mobile-app", "src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

describe("pressed styles survive NativeWind", () => {
  it("no Pressable is given a style function", () => {
    const offenders: string[] = [];
    for (const file of files(SRC)) {
      if (file.endsWith("Tap.tsx")) continue;
      const src = readFileSync(file, "utf8");
      const re = /style=\{\(\{\s*pressed\s*\}\)\s*=>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const pressable = src.lastIndexOf("<Pressable", m.index);
        const tap = src.lastIndexOf("<Tap", m.index);
        if (pressable > tap) offenders.push(`${file.slice(SRC.length + 1)}:${src.slice(0, m.index).split("\n").length}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("Tap resolves the style itself and hands Pressable a plain one", () => {
    const tap = readFileSync(join(SRC, "components", "ds", "Tap.tsx"), "utf8");
    expect(tap).toMatch(/typeof style === 'function' \? style\(\{ pressed \}\) : style/);
    expect(tap).toMatch(/style=\{resolved\}/);
  });
});
