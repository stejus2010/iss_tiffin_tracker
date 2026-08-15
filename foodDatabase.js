/**
 * foodDatabase.js
 * Loads the local food database (data/foods.json) plus any custom foods the
 * student has saved, and exposes search / lookup helpers.
 *
 * Paths are relative ("./data/foods.json") so the app works when deployed to a
 * GitHub Pages project sub-path such as /username.github.io/repo-name/.
 */

import { loadCustomFoods } from "./storage.js";

export const FOOD_GROUPS = ["grain", "protein", "vegetable", "fruit", "dairy", "healthy_fat"];

export const GROUP_LABELS = {
  grain: "Grain",
  protein: "Protein",
  vegetable: "Vegetable",
  fruit: "Fruit",
  dairy: "Dairy",
  healthy_fat: "Healthy fat",
};

export const CATEGORIES = [
  "All",
  "Breakfast",
  "Rice & Grains",
  "Breads",
  "Dairy",
  "Protein",
  "Fruits",
  "Vegetables",
  "Snacks",
  "Drinks",
  "Other",
];

let catalogue = [];

/** Fetch the JSON database once and merge in locally saved custom foods. */
export async function initFoodDatabase() {
  const url = new URL("./data/foods.json", import.meta.url);
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not load the food database.");
  const json = await res.json();
  catalogue = json.foods.map(normalise);
  refreshCustomFoods();
  return catalogue;
}

/** Re-merge custom foods (called after a new AI food is saved). */
export function refreshCustomFoods() {
  catalogue = catalogue.filter((f) => !f.isCustom).concat(loadCustomFoods().map(normalise));
}

function normalise(food) {
  return {
    category: "Other",
    servingUnit: "serving",
    defaultServing: 1,
    foodGroups: [],
    emoji: "🍽️",
    ...food,
    nutritionPerServing: {
      calories: 0,
      carbs: 0,
      protein: 0,
      fat: 0,
      fibre: 0,
      sugar: 0,
      sodium: 0,
      calcium: 0,
      iron: 0,
      ...(food.nutritionPerServing || {}),
    },
  };
}

export function allFoods() {
  return catalogue;
}

export function getFood(id) {
  return catalogue.find((f) => f.id === id) || null;
}

/**
 * Instant search: matches name, category, ingredients and base variants.
 * Base variants surface as virtual results ("Chapati — Ragi").
 */
export function searchFoods(query, category = "All") {
  const q = query.trim().toLowerCase();
  let list = catalogue;
  if (category !== "All") list = list.filter((f) => f.category === category);
  if (!q) return list;

  const results = [];
  for (const food of list) {
    const haystack = [food.name, food.category, ...(food.ingredients || [])]
      .join(" ")
      .toLowerCase();
    if (haystack.includes(q)) {
      results.push(food);
      continue;
    }
    const base = (food.bases || []).find((b) => b.label.toLowerCase().includes(q));
    if (base) results.push({ ...food, presetBase: base.id });
  }
  return results;
}

/** Expanded suggestions list used by the search "did you mean" rows. */
export function searchVariants(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out = [];
  for (const food of catalogue) {
    if (!food.bases || !food.name.toLowerCase().includes(q)) continue;
    for (const base of food.bases) out.push({ ...food, presetBase: base.id });
  }
  return out;
}
