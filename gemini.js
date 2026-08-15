/**
 * gemini.js — AI food-estimation feature (LOCAL KIOSK MODE).
 *
 * The app runs on one laptop in the hall, so the Gemini API key simply lives
 * in this file. Paste your key from https://aistudio.google.com/app/apikey
 * between the quotes below and the "Ask AI" button works immediately.
 *
 * IMPORTANT: because the key is in the code, only run this locally / on the
 * school laptop. Do NOT publish these files to a public website.
 */

/* ⬇⬇⬇  PASTE YOUR GEMINI API KEY HERE  ⬇⬇⬇ */
const GEMINI_API_KEY= "AQ.Ab8RN6KoDKHYZ7lFFJ6fCPFfpOSDeI15C_ruEyh16E53YdpDTg"
/* ⬆⬆⬆ ------------------------------------- */

/* Tried in order — if one model isn't available for your key, the next is used. */
const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest", "gemini-1.5-flash"];

/** Last technical error, shown in the UI to make debugging easy. */
export let lastAiError = "";

export const AI_CONFIG = {
  /** Optional: only used if you ever deploy the proxy in server-example/. */
  endpoint: (typeof window !== "undefined" && window.TIFFIN_AI_ENDPOINT) || null,
};

/** Optional runtime key (typed into the app) — used if the file key is blank. */
let runtimeKey = "";
export function setApiKey(key) {
  runtimeKey = String(key || "").trim();
}

export function getApiKey() {
  const key = String(GEMINI_API_KEY || "").trim().replace(/^["']|["']$/g, "");
  if (key && key.length >= 20 && !/PASTE_YOUR_KEY/i.test(key)) return key;
  return runtimeKey.length >= 20 ? runtimeKey : "";
}

export function isAiConfigured() {
  return Boolean(AI_CONFIG.endpoint) || Boolean(getApiKey());
}

export const SYSTEM_PROMPT = `You are a nutrition-data estimation assistant for an educational school application used by middle-school students in India.

Estimate the nutritional composition of the food described by the user.

Return ONLY valid JSON matching this shape:
{
  "foodName": string,
  "quantity": number,
  "servingUnit": string,
  "estimatedWeightGrams": number,
  "calories": number,
  "carbohydratesGrams": number,
  "proteinGrams": number,
  "fatGrams": number,
  "fibreGrams": number,
  "sugarGrams": number,
  "sodiumMg": number,
  "foodGroups": string[],
  "confidence": "high" | "medium" | "low",
  "assumptions": string[]
}

Consider Indian food preparation methods, typical household serving sizes, the quantity and ingredients specified by the user, and the typical edible portion.

foodGroups must be one or more of: grain, protein, vegetable, fruit, dairy, healthy_fat.

Do not give medical advice, weight-loss advice, or calorie-restriction advice. Use confidence and assumptions to make clear the values are estimates.`;

const REQUIRED_NUMBERS = [
  "calories",
  "carbohydratesGrams",
  "proteinGrams",
  "fatGrams",
  "fibreGrams",
];

const VALID_GROUPS = ["grain", "protein", "vegetable", "fruit", "dairy", "healthy_fat"];

/**
 * Estimate the nutrition of a free-text food description.
 * Resolves with a validated object, or throws an Error whose message is a code.
 */
export async function analyzeFood(description, { signal } = {}) {
  const text = String(description || "").trim().slice(0, 300);
  if (!text) throw new Error("BAD_JSON");

  if (AI_CONFIG.endpoint) return validateEstimate(await viaProxy(text, signal));

  const key = getApiKey();
  if (!key) throw new Error("AI_NOT_CONFIGURED");
  return validateEstimate(await viaGemini(text, key, signal));
}

async function viaProxy(description, signal) {
  let response;
  try {
    response = await fetch(AI_CONFIG.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
      signal,
    });
  } catch {
    throw new Error("NETWORK");
  }
  if (!response.ok) throw new Error("SERVER");
  try {
    return await response.json();
  } catch {
    throw new Error("BAD_JSON");
  }
}

/** Direct browser → Gemini call. Local mode only. */
async function viaGemini(description, key, signal) {
  let lastCode = "SERVER";

  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: description }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
        }),
      });
    } catch (err) {
      lastAiError = `Network error: ${err?.message || err}`;
      throw new Error("NETWORK");
    }

    if (!response.ok) {
      let detail = "";
      try {
        detail = (await response.clone().json())?.error?.message || "";
      } catch {
        detail = await response.text().catch(() => "");
      }
      lastAiError = `${model} → HTTP ${response.status}: ${detail}`.slice(0, 400);

      // Model unknown / unsupported for this key → try the next one.
      if (response.status === 404 || /not found|not supported/i.test(detail)) {
        lastCode = "SERVER";
        continue;
      }
      if (response.status === 401 || response.status === 403 || /API key/i.test(detail)) {
        throw new Error("BAD_KEY");
      }
      if (response.status === 429) throw new Error("RATE_LIMIT");
      if (response.status === 400) throw new Error("BAD_KEY");
      throw new Error("SERVER");
    }

    let data;
    try {
      data = await response.json();
    } catch {
      lastAiError = `${model} → response was not JSON`;
      throw new Error("BAD_JSON");
    }

    const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
    if (!raw) {
      lastAiError = `${model} → empty response (${JSON.stringify(data).slice(0, 200)})`;
      throw new Error("BAD_JSON");
    }
    lastAiError = "";
    return parseJsonLoose(raw);
  }

  throw new Error(lastCode);
}

/** Models occasionally wrap JSON in prose or code fences — recover from that. */
function parseJsonLoose(raw) {
  const text = String(raw).replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new Error("BAD_JSON");
  }
}

/** Defensive validation — the UI never renders raw model output. */
export function validateEstimate(data) {
  if (!data || typeof data !== "object") throw new Error("BAD_JSON");
  const name = typeof data.foodName === "string" ? data.foodName.trim() : "";
  if (!name) throw new Error("BAD_JSON");

  for (const key of REQUIRED_NUMBERS) {
    if (typeof data[key] !== "number" || !Number.isFinite(data[key]) || data[key] < 0) {
      throw new Error("BAD_JSON");
    }
  }

  const groups = Array.isArray(data.foodGroups)
    ? data.foodGroups.filter((g) => VALID_GROUPS.includes(g))
    : [];

  return {
    foodName: name.slice(0, 60),
    quantity: clampNumber(data.quantity, 1, 0.25, 50),
    servingUnit: typeof data.servingUnit === "string" ? data.servingUnit.slice(0, 20) : "serving",
    estimatedWeightGrams: clampNumber(data.estimatedWeightGrams, 0, 0, 5000),
    calories: clampNumber(data.calories, 0, 0, 5000),
    carbohydratesGrams: clampNumber(data.carbohydratesGrams, 0, 0, 500),
    proteinGrams: clampNumber(data.proteinGrams, 0, 0, 300),
    fatGrams: clampNumber(data.fatGrams, 0, 0, 300),
    fibreGrams: clampNumber(data.fibreGrams, 0, 0, 200),
    sugarGrams: clampNumber(data.sugarGrams, 0, 0, 300),
    sodiumMg: clampNumber(data.sodiumMg, 0, 0, 10000),
    foodGroups: groups.length ? groups : ["grain"],
    confidence: ["high", "medium", "low"].includes(data.confidence) ? data.confidence : "medium",
    assumptions: Array.isArray(data.assumptions)
      ? data.assumptions.filter((a) => typeof a === "string").slice(0, 5)
      : [],
  };
}

function clampNumber(value, fallback, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

/** Friendly, non-technical error copy for the UI. */
export function describeError(code) {
  switch (code) {
    case "AI_NOT_CONFIGURED":
      return "The AI helper isn't set up on this laptop yet (no API key in gemini.js). You can still add foods from the list.";
    case "BAD_KEY":
      return `That API key was rejected. ${lastAiError || "Check you copied the whole key from Google AI Studio."}`;
    case "RATE_LIMIT":
      return "The AI helper is busy (rate limit reached). Wait a few seconds and try again.";
    case "NETWORK":
      return "We couldn't reach the AI helper. Check your internet connection and try again.";
    case "BAD_JSON":
      return "We couldn't understand the estimate that came back. Try describing the food differently.";
    case "SERVER":
      return `The AI service returned an error. ${lastAiError || "Try again in a moment."}`;
    default:
      return "We couldn't estimate that food right now. You can try again, or add a similar food from the list.";
  }
}
