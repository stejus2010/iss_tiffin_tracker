/**
 * Example serverless proxy — Cloudflare Workers / Vercel Edge compatible.
 *
 * Deploy this separately from GitHub Pages (GitHub Pages is static only) and
 * point the frontend at its URL via `window.TIFFIN_AI_ENDPOINT`.
 *
 * Required environment variable (set in the hosting dashboard, NEVER in code):
 *   GEMINI_API_KEY
 */

const MODEL = "gemini-2.5-flash";

const SYSTEM_PROMPT = `You are a nutrition-data estimation assistant for an educational school application used by middle-school students in India.

Estimate the nutritional composition of the food described by the user.

Return ONLY valid JSON.

Consider: Indian food preparation methods, typical household serving sizes, the quantity specified by the user, the ingredients specified by the user, and the typical edible portion.

Return the fields: foodName, quantity, servingUnit, estimatedWeightGrams, calories, carbohydratesGrams, proteinGrams, fatGrams, fibreGrams, sugarGrams, sodiumMg, foodGroups, confidence, assumptions.

For foodGroups, classify the food into one or more of: grain, protein, vegetable, fruit, dairy, healthy_fat.

Do not provide medical advice. Do not provide weight-loss advice. Do not recommend calorie restriction. Make clear through the confidence and assumptions fields that values are estimates.`;

const CORS = {
  "Access-Control-Allow-Origin": "*", // tighten to your GitHub Pages origin in production
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid request" }, 400);
    }

    const description = String(body?.description || "").trim().slice(0, 300);
    if (!description) return json({ error: "Missing description" }, 400);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;

    const upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: description }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
    });

    if (!upstream.ok) return json({ error: "Upstream error" }, 502);

    const data = await upstream.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return json({ error: "Malformed estimate" }, 502);
    }

    // Validate on the server too — the frontend validates again defensively.
    const required = ["foodName", "calories", "carbohydratesGrams", "proteinGrams", "fatGrams", "fibreGrams"];
    for (const key of required) {
      if (parsed[key] === undefined) return json({ error: "Incomplete estimate" }, 502);
    }

    return json(parsed, 200);
  },
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}
