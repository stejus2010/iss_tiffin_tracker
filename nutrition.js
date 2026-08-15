/**
 * nutrition.js — the single place where nutrition maths happens.
 * UI code never multiplies nutrition values itself.
 */

const NUTRIENTS = [
  "calories",
  "carbs",
  "protein",
  "fat",
  "fibre",
  "sugar",
  "sodium",
  "calcium",
  "iron",
];

export const emptyTotals = () => Object.fromEntries(NUTRIENTS.map((n) => [n, 0]));

/**
 * nutrition consumed = nutrition per serving × quantity × base multiplier
 */
export function scaleNutrition(perServing, quantity, multiplier = 1) {
  const out = emptyTotals();
  for (const key of NUTRIENTS) {
    out[key] = (perServing[key] || 0) * quantity * multiplier;
  }
  return out;
}

export function sumNutrition(entries) {
  const total = emptyTotals();
  for (const entry of entries) {
    for (const key of NUTRIENTS) total[key] += entry.nutrition[key] || 0;
  }
  return total;
}

/** Sensible rounding: whole numbers for kcal/sodium, 1 decimal for small macros. */
export function round(value, nutrient = "calories") {
  if (value == null || Number.isNaN(value)) return 0;
  if (nutrient === "calories" || nutrient === "sodium" || nutrient === "calcium") {
    return Math.round(value);
  }
  if (value >= 10) return Math.round(value);
  return Math.round(value * 10) / 10;
}

export function formatKcal(value) {
  return Math.round(value).toLocaleString("en-IN");
}

/** Human label for a logged quantity, e.g. "2 pieces" or "1½ cups". */
export function quantityLabel(quantity, unit) {
  const fractions = { 0.25: "¼", 0.5: "½", 0.75: "¾" };
  const whole = Math.floor(quantity);
  const frac = quantity - whole;
  let num;
  if (fractions[frac]) num = (whole ? whole : "") + fractions[frac];
  else num = String(Math.round(quantity * 100) / 100);

  const plural = quantity > 1 && !unit.endsWith("s") && unit !== "ml" ? unit + "s" : unit;
  return `${num} ${plural}`;
}
