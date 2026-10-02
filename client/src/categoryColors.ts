import type { CSSProperties } from "react";

// Colour per drawer compartment. Claude names categories freely, so each
// colour also covers close synonyms ("groceries" is still shopping blue).
// Anything not listed keeps the default black.

export interface CategoryColor {
  bg: string;
  /** Text colour that reads on `bg`. */
  fg: string;
}

const WHITE = "#ffffff";
const BLACK = "#000000";

const PALETTE: [RegExp, CategoryColor][] = [
  [/^(health|fitness|medical|doctor|wellbeing|wellness|sport|exercise)$/, { bg: "#e5262a", fg: WHITE }], // red
  [/^(shopping|groceries|grocery|buy|to buy|shops?)$/, { bg: "#1f5fff", fg: WHITE }], // blue
  [/^(travel|trips?|holidays?|vacation)$/, { bg: "#7b2ff7", fg: WHITE }], // purple
  [/^(home|house|household|chores|garden)$/, { bg: "#ff7a00", fg: BLACK }], // orange
  [/^(work|job|office|career|projects?)$/, { bg: "#7a4a22", fg: WHITE }], // brown
  [/^(ideas?|thoughts|inspiration)$/, { bg: "#ffd400", fg: BLACK }], // yellow
  [/^(errands?|priorit(y|ies)|urgent|important)$/, { bg: "#14a44d", fg: WHITE }], // green
];

export function categoryColor(category: string): CategoryColor | null {
  const c = category.trim().toLowerCase();
  for (const [re, color] of PALETTE) if (re.test(c)) return color;
  return null;
}

/** CSS variables `--cat` / `--cat-fg` for an element; empty for uncoloured categories. */
export function categoryStyle(category: string): CSSProperties {
  const color = categoryColor(category);
  return color ? ({ "--cat": color.bg, "--cat-fg": color.fg } as CSSProperties) : {};
}
