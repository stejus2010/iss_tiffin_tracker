/**
 * balance.js — the meal-balance / food-group analysis engine.
 *
 * Fully deterministic and fully offline: it uses the food-group tags stored on
 * every food (local or AI-generated). It never judges the student, never talks
 * about calorie limits, and prefers additions over removals.
 */

import { FOOD_GROUPS, GROUP_LABELS } from "./foodDatabase.js";

/** Local suggestion database — practical school-tiffin friendly options. */
export const SUGGESTIONS = {
  protein: ["Curd", "Dal", "Sprouts", "Paneer", "Boiled egg", "Chickpeas"],
  vegetable: ["Cucumber", "Carrot", "Beans", "Peas", "Vegetable sabzi"],
  fruit: ["Banana", "Apple", "Orange", "Guava", "Grapes"],
  grain: ["Chapati", "Rice", "Idli", "Dosa"],
  dairy: ["Curd", "Milk", "Buttermilk", "Paneer"],
  healthy_fat: ["Almonds", "Peanuts", "Coconut chutney"],
};

/** Groups we actively look for in a school tiffin (dairy & fat are bonuses). */
const CORE_GROUPS = ["grain", "protein", "vegetable", "fruit"];

/**
 * Analyse a list of log entries.
 * @returns {{present:string[], missing:string[], varietyScore:number,
 *            tone:'balanced'|'good'|'improve'|'empty', headline:string,
 *            message:string, focus:string|null, suggestions:string[],
 *            dominant:string|null}}
 */
export function analyseMeal(entries, guide = null) {
  const present = new Set();
  for (const entry of entries) (entry.foodGroups || []).forEach((g) => present.add(g));

  const presentList = FOOD_GROUPS.filter((g) => present.has(g));

  if (!entries.length) {
    return {
      present: [],
      missing: CORE_GROUPS,
      varietyScore: 0,
      tone: "empty",
      headline: "🌱 Your tiffin is waiting",
      message: guide
        ? `Add what you brought in your tiffin. For ${guide.label}, a 20-minute break tiffin usually gives about ${guide.kcal[0]}–${guide.kcal[1]} kcal.`
        : "Add the foods you brought today and we'll show what your meal already provides.",
      focus: null,
      suggestions: [],
      dominant: null,
    };
  }

  const missingCore = CORE_GROUPS.filter((g) => !present.has(g));
  const varietyScore = presentList.length; // out of 6 possible groups
  const dominant = findDominantGroup(entries, presentList);

  // Everything important is covered → celebrate, do not push more food.
  if (missingCore.length === 0) {
    return {
      present: presentList,
      missing: [],
      varietyScore,
      tone: "balanced",
      headline: "✨ Nice balance!",
      message: `Your tiffin includes ${listGroups(presentList)}. That's a good variety of food groups${guide ? ` for ${guide.label}` : ""} — easy to finish in the 20-minute break too.`,
      focus: null,
      suggestions: [],
      dominant,
    };
  }

  // Only one core group missing and at least two others present → gentle nudge.
  const focus = prioritise(missingCore, present);
  const tone = missingCore.length === 1 && presentList.length >= 3 ? "good" : "improve";

  return {
    present: presentList,
    missing: missingCore,
    varietyScore,
    tone,
    headline: tone === "good" ? "🌱 One simple addition" : "🌱 Make it more balanced",
    message: buildMessage(presentList, focus, dominant, guide),
    focus,
    suggestions: pickSuggestions(focus, guide),
    dominant,
  };
}

/** Priority order: protein first, then vegetable/fruit, then grain. */
function prioritise(missing, present) {
  const order = ["protein", "vegetable", "fruit", "grain"];
  // If dairy already supplies protein-ish variety, deprioritise nothing —
  // dairy foods are tagged with "protein" too, so this stays consistent.
  for (const group of order) {
    if (missing.includes(group)) return group;
  }
  return missing[0];
}

/**
 * Detect whether one group clearly dominates the meal's energy contribution.
 * Used only to phrase the message, never to tell a student to eat less.
 */
function findDominantGroup(entries, presentList) {
  if (presentList.length <= 1) return presentList[0] || null;
  const byGroup = {};
  let total = 0;
  for (const entry of entries) {
    const kcal = entry.nutrition?.calories || 0;
    total += kcal;
    const groups = entry.foodGroups?.length ? entry.foodGroups : ["other"];
    for (const g of groups) byGroup[g] = (byGroup[g] || 0) + kcal / groups.length;
  }
  if (!total) return null;
  const [top, share] = Object.entries(byGroup).sort((a, b) => b[1] - a[1])[0] || [];
  return share / total >= 0.7 ? top : null;
}

function listGroups(groups) {
  const labels = groups.map((g) => GROUP_LABELS[g].toLowerCase());
  if (labels.length === 1) return `a ${labels[0]} food`;
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** Grade-aware suggestion list: prefer quick, break-friendly picks. */
function pickSuggestions(focus, guide) {
  const base = SUGGESTIONS[focus] ? SUGGESTIONS[focus].slice() : [];
  if (!guide) return base.slice(0, 4);
  const quick = guide.picks.filter((p) =>
    base.some((b) => p.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(p.toLowerCase())),
  );
  return [...new Set([...quick, ...base])].slice(0, 4);
}

function buildMessage(present, focus, dominant, guide) {
  const have = present.length
    ? `Your tiffin already has ${listGroups(present)}.`
    : "You've started logging your tiffin.";

  const focusLine = {
    protein: "Adding a protein-rich food would round it out nicely.",
    vegetable: "A vegetable would add fibre and colour to the meal.",
    fruit: "A fruit would add fibre and natural sweetness.",
    grain: "A grain or starchy food would give the meal steady energy.",
    dairy: "A dairy food could add calcium.",
    healthy_fat: "A small serving of nuts or seeds could add healthy fats.",
  }[focus];

  const dominantLine =
    dominant && dominant !== focus && (dominant === "grain" || dominant === "vegetable")
      ? " Most of the meal's energy is coming from one food group right now."
      : "";

  const gradeLine = guide ? ` ${guide.eatingTip}` : "";
  return `${have}${dominantLine} ${focusLine}${gradeLine}`;
}

/** Short label for the variety meter, e.g. "Good variety". */
export function varietyLabel(score) {
  if (score >= 4) return "Great variety";
  if (score === 3) return "Good variety";
  if (score === 2) return "Building variety";
  if (score === 1) return "Getting started";
  return "Nothing logged yet";
}
