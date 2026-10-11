/* Flexbox playground CSS builder. Pure and asserted: the snippet the learner
   sees is generated from the same options object that styles the demo, so the
   two can never disagree. */

export interface FlexOpts {
  direction: "row" | "row-reverse" | "column" | "column-reverse";
  justify: "flex-start" | "flex-end" | "center" | "space-between" | "space-around" | "space-evenly";
  align: "stretch" | "flex-start" | "flex-end" | "center" | "baseline";
  wrap: "nowrap" | "wrap" | "wrap-reverse";
  gap: number;
  items: number;
}

export const FLEX_DEFAULTS: FlexOpts = {
  direction: "row",
  justify: "flex-start",
  align: "stretch",
  wrap: "nowrap",
  gap: 12,
  items: 5,
};

export function flexCss(o: FlexOpts): string {
  return [
    ".container {",
    "  display: flex;",
    `  flex-direction: ${o.direction};`,
    `  justify-content: ${o.justify};`,
    `  align-items: ${o.align};`,
    `  flex-wrap: ${o.wrap};`,
    `  gap: ${o.gap}px;`,
    "}",
  ].join("\n");
}
