# Tiffin Tracker — Indian School Sohar

A calm, modern nutrition-education web app for middle-school students. Students log the foods
they brought in their school tiffin, see an estimated nutrition profile, and — most importantly —
get **context-aware guidance on how balanced and varied the meal is**.

The app is not a calorie counter. It answers: *what does this meal already provide, what is
missing, and what could I add to make it more balanced?*

## Features

- Home dashboard: today's estimated nutrition, macro bars, micronutrient chips
- Today's Tiffin list with edit quantity / change food / remove
- Fast food picker: instant search, categories, 50+ common Indian foods
- Portion selection (pieces, cups, ml) and base/ingredient selection (wheat / ragi / jowar / bajra…)
- **Meal-balance engine**: deterministic, offline food-group analysis with prioritised suggestions
- Daily view, session insights (tiffin breakdown, variety, educational cards)
- AI estimation for unknown foods (Gemini key pasted directly in gemini.js — local laptop use only)
- Kiosk mode: nothing is saved to disk; "New student" clears the screen for the next person

## Technology

Vanilla JavaScript (ES modules), **p5.js** (progress-ring rendering), HTML, CSS. No frontend
framework. Deployable as a static site.

## Project structure

```
nutrition-tracker/
├── index.html              App shell, header, screens, bottom nav
├── style.css               Design system (colour tokens, cards, components)
├── app.js                  State, screens, modals, events
├── sketch.js               p5.js progress ring (instance mode)
├── foodDatabase.js         Loads foods.json + custom foods, search helpers
├── nutrition.js            All nutrition maths and formatting
├── balance.js              Food-group / meal-balance engine + suggestion database
├── storage.js              in-memory session state (no localStorage)
├── gemini.js               Client for the AI proxy (validation + friendly errors)
├── data/foods.json         Food database
├── assets/foods/           Food images (optional; emoji fallback if absent)
└── server-example/analyze-food.worker.js   Deployable Gemini proxy
```

## Run locally

Because the app uses ES modules and `fetch`, serve it over HTTP (not `file://`):

```bash
cd nutrition-tracker
python3 -m http.server 5173
# open http://localhost:5173
```

## Deploy to GitHub Pages

1. Push the `nutrition-tracker` folder contents to a repository.
2. Settings → Pages → Deploy from branch → `main` / root.
3. The app works at `https://username.github.io/repository-name/` because every asset path is
   **relative** (`./data/foods.json`, `./assets/foods/idli.png`).

## Gemini AI helper (local laptop setup)

This build is meant to run on one school laptop, so the key simply lives in the code:

1. Get a free key at https://aistudio.google.com/app/apikey
2. Open `gemini.js` and paste it into `GEMINI_API_KEY`
3. Refresh the page — "Ask AI" now estimates any food a student describes

Because the key is in the file, keep these files on the laptop. Do **not** publish them to a
public website. If you ever need a public deployment, deploy
`server-example/analyze-food.worker.js` (key stays server-side) and set
`window.TIFFIN_AI_ENDPOINT` in `index.html` before `app.js` loads — proxy mode takes priority.

If the endpoint is not configured, the app stays fully usable: all local foods, nutrition
calculations and the balance engine work offline. The AI panel simply explains that the helper
has not been connected yet.

## Adding a new food

Append an object to `data/foods.json`:

```json
{
  "id": "thepla",
  "name": "Thepla",
  "category": "Breads",
  "servingUnit": "piece",
  "servingNote": "1 thepla ≈ 45 g",
  "defaultServing": 2,
  "foodGroups": ["grain", "vegetable"],
  "nutritionPerServing": { "calories": 120, "carbs": 17, "protein": 3, "fat": 4, "fibre": 2 },
  "emoji": "🫓"
}
```

`foodGroups` is required for the balance engine. Optional keys: `bases` (ingredient variants with
a `multiplier`), `amountOptions` (cup/ml choices), `image`.

## Adding a food image

Drop a square image at `assets/foods/<id>.png` and add `"image": "./assets/foods/<id>.png"` to the
food. If the file is missing, the app falls back to the food's emoji automatically. Only use
original, generated or appropriately licensed images.

## How nutrition is calculated

`nutrition consumed = nutritionPerServing × quantity × base multiplier` — implemented once in
`nutrition.js` and used everywhere. Values are rounded for display (179.7 → 180 kcal).

## How the balance engine works

1. Collect the food-group tags of every logged item (`grain`, `protein`, `vegetable`, `fruit`,
   `dairy`, `healthy_fat`).
2. Compare against the four core tiffin groups (grain, protein, vegetable, fruit).
3. If none are missing → celebrate the variety and suggest nothing.
4. Otherwise pick **one** priority gap (protein → vegetable → fruit → grain) and offer 2–4
   realistic additions from the local suggestion database.
5. Detect when ~70%+ of the meal's energy comes from a single group, and phrase the message
   accordingly — always as an addition, never "eat less".

It is fully deterministic and works offline. Gemini is used only to estimate nutrition for foods
that are not in the database.

## Privacy

Nothing is stored at all: name, grade and foods live in memory until reset or refresh. No accounts, no servers,
no weight, measurements, BMI or medical information. Students can clear everything from Profile.

## Educational and safety notes

Nutrition values are estimates. The app avoids restrictive language, never labels foods as bad or
junk, never displays calorie limits, and frames every suggestion as an optional addition.
