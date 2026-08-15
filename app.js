/**
 * app.js — application state, screen rendering and interactions.
 *
 * Structure:
 *   1. State + persistence
 *   2. Small UI component helpers (card, macro bar, food row, toast…)
 *   3. Screens (Home / History / Insights / Profile)
 *   4. Modals (food picker, portion picker, AI estimate, day detail)
 *   5. Events + bootstrap
 */

import {
  initFoodDatabase,
  refreshCustomFoods,
  allFoods,
  getFood,
  searchFoods,
  CATEGORIES,
  GROUP_LABELS,
  FOOD_GROUPS,
} from "./foodDatabase.js";
import {
  scaleNutrition,
  sumNutrition,
  round,
  formatKcal,
  quantityLabel,
  emptyTotals,
} from "./nutrition.js";
import { analyseMeal, varietyLabel } from "./balance.js";
import { gradeGuide, breakStatus, breakEnergyNote, SCHOOL } from "./gradeGuide.js";
import { analyzeFood, isAiConfigured, describeError, setApiKey } from "./gemini.js";
import { mountProgressRing, destroyRings } from "./sketch.js";
import * as store from "./storage.js";

/* ============================================================
   1. STATE
   ============================================================ */

/** Guidance for the current student's class (grade-based, break-sized). */
function guide() {
  return gradeGuide(state.profile.grade);
}

const state = {
  screen: "home",
  profile: store.loadProfile(),
  ready: false,
};

/** Foods this student has entered in the current session (memory only). */
function todayEntries() {
  return store.loadEntries();
}

function setEntries(entries) {
  store.saveEntries(entries);
  render();
}

/** Build a log entry from a food + chosen quantity/base. */
function buildEntry(food, quantity, baseId) {
  const base = (food.bases || []).find((b) => b.id === baseId);
  const nutrition = scaleNutrition(food.nutritionPerServing, quantity, base?.multiplier || 1);
  return {
    id: `${food.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    foodId: food.id,
    name: food.name,
    emoji: food.emoji,
    image: food.image || null,
    baseId: baseId || null,
    baseLabel: base?.label || null,
    servingUnit: food.servingUnit,
    quantity,
    foodGroups: [...new Set([...(food.foodGroups || []), ...(base?.extraGroups || [])])],
    nutrition,
  };
}

/* ============================================================
   2. UI HELPERS
   ============================================================ */

const $ = (sel, root = document) => root.querySelector(sel);
const el = (html) => {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function toast(message) {
  const stack = $("#toast-stack");
  const node = el(`<div class="toast" role="status">${esc(message)}</div>`);
  stack.append(node);
  setTimeout(() => {
    node.style.opacity = "0";
    setTimeout(() => node.remove(), 250);
  }, 2600);
}

function thumb(item, big = false) {
  const cls = big ? "food-thumb" : "food-thumb";
  if (item.image) {
    return `<div class="${cls}"><img src="${esc(item.image)}" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('${esc(item.emoji || "🍽️")}'))"></div>`;
  }
  return `<div class="${cls}" aria-hidden="true">${esc(item.emoji || "🍽️")}</div>`;
}

function macroBar(label, value, unit, colorVar, ratio) {
  return `
    <div class="macro">
      <div class="macro__label">${label}</div>
      <div class="macro__value">${round(value, label.toLowerCase())} ${unit}</div>
      <div class="bar"><i style="width:${Math.min(100, ratio * 100).toFixed(0)}%;background:var(${colorVar})"></i></div>
    </div>`;
}

function groupPills(present) {
  return FOOD_GROUPS.map((g) => {
    const on = present.includes(g);
    return `<span class="group-pill ${on ? "is-present" : ""}">
        <span class="mark" aria-hidden="true">${on ? "✓" : "○"}</span>
        ${GROUP_LABELS[g]}<span class="sr-only">${on ? " included" : " not included"}</span>
      </span>`;
  }).join("");
}

const DISCLAIMER = `
  <p class="disclaimer">
    Nutrition values shown in this app are estimates based on typical serving sizes and
    preparation methods. Actual nutrition may vary with ingredients, quantities and cooking
    methods. This app is designed for nutrition education and is not intended to diagnose,
    treat or manage medical conditions.
  </p>`;

/* ============================================================
   3. SCREENS
   ============================================================ */

function render() {
  destroyRings();
  const host = $(`#screen-${state.screen}`);
  if (state.screen === "home") host.innerHTML = homeScreen();
  
  if (state.screen === "insights") host.innerHTML = insightsScreen();
  if (state.screen === "profile") host.innerHTML = profileScreen();

  $("#student-name").textContent = state.profile.name;
  $("#greeting").textContent = greetingText();

  // Mount p5 rings after the markup is in the DOM.
  host.querySelectorAll("[data-ring]").forEach((node) => {
    mountProgressRing(node, Number(node.dataset.ring));
  });
}

function greetingText() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning,";
  if (h < 17) return "Good Afternoon,";
  return "Good Evening,";
}

/* ---------- Home ---------- */

function homeScreen() {
  const entries = todayEntries();
  const totals = entries.length ? sumNutrition(entries) : emptyTotals();
  const g = guide();
  const analysis = analyseMeal(entries, g);
  const progress = Math.min(1, totals.calories / g.kcal[1]);

  return `
    <div class="home-grid">
      <div class="col">
        ${breakCard(totals, g)}
        ${nutritionCard(totals, progress)}
        ${tiffinCard(entries)}
      </div>
      <div class="col">
        ${balanceCard(analysis)}
      </div>
    </div>
    ${DISCLAIMER}
  `;
}

function breakCard(totals, g) {
  const status = breakStatus();
  return `
  <section class="card card--flat" aria-labelledby="break-title">
    <div class="card-head">
      <h2 class="card-title" id="break-title">Short break · ${SCHOOL.breakStartLabel}–${SCHOOL.breakEndLabel}</h2>
      <span class="chip">${esc(g.label)}</span>
    </div>
    <p class="tiny muted" style="margin:0 0 6px">${esc(status.text)} School runs ${SCHOOL.startLabel}–${SCHOOL.endLabel}.</p>
    <p class="tiny" style="margin:0">${esc(breakEnergyNote(totals.calories, g))}</p>
  </section>`;
}

function nutritionCard(totals, progress) {
  return `
  <section class="card" aria-labelledby="nut-title">
    <div class="nutrition-top">
      <div>
        <h2 class="card-title" id="nut-title">Tiffin Box Nutrition</h2>
        <div class="kcal">${formatKcal(totals.calories)} kcal</div>
        <p class="muted tiny" style="margin:4px 0 0">Estimated from your tiffin · shown against a ${guide().label} break tiffin</p>
      </div>
      <div class="ring-wrap" data-ring="${progress.toFixed(3)}">
        <div class="ring-label"><b>${Math.round(progress * 100)}%</b><span>of break tiffin</span></div>
      </div>
    </div>

    <div class="macros">
      ${macroBar("Carbs", totals.carbs, "g", "--carbs", totals.carbs / ((guide().kcalMid * 0.55) / 4))}
      ${macroBar("Protein", totals.protein, "g", "--protein", totals.protein / guide().protein)}
      ${macroBar("Fat", totals.fat, "g", "--fat", totals.fat / ((guide().kcalMid * 0.3) / 9))}
      ${macroBar("Fibre", totals.fibre, "g", "--fibre", totals.fibre / 6)}
    </div>

    <div class="micro-row">
      <span class="chip">Sugar ${round(totals.sugar, "sugar")} g</span>
      <span class="chip">Sodium ${round(totals.sodium, "sodium")} mg</span>
      <span class="chip">Calcium ${round(totals.calcium, "calcium")} mg</span>
      <span class="chip">Iron ${round(totals.iron, "iron")} mg</span>
    </div>
  </section>`;
}

function tiffinCard(entries) {
  if (!entries.length) {
    return `
    <section class="card">
      <div class="empty">
        <div class="empty__emoji" aria-hidden="true">🌱</div>
        <h2 class="empty__title">Your tiffin is waiting</h2>
        <p class="empty__text">Add the foods in the tiffin box you brought for the 10:30–10:50 break.</p>
        <button class="btn btn--primary" style="max-width:240px;margin:0 auto" data-action="open-picker">+ Add Food</button>
      </div>
    </section>`;
  }

  const shown = entries.slice(0, 4);
  return `
  <section class="card" aria-labelledby="tiffin-title">
    <div class="card-head">
      <h2 class="card-title" id="tiffin-title">Tiffin Box</h2>
      <button class="link-button" data-action="view-all">View All</button>
    </div>
    ${shown.map(foodRow).join("")}
    ${entries.length > shown.length ? `<p class="tiny muted" style="margin:10px 0 0">+ ${entries.length - shown.length} more item(s)</p>` : ""}
    <div style="margin-top:16px">
      <button class="btn btn--primary" data-action="open-picker">+ Add Food Item</button>
    </div>
  </section>`;
}

function foodRow(entry) {
  return `
  <div class="food-row" data-entry="${entry.id}">
    ${thumb(entry)}
    <div class="food-main">
      <div class="food-name">${esc(quantityLabel(entry.quantity, entry.servingUnit))} ${esc(entry.name)}</div>
      <div class="food-sub">${esc(entry.baseLabel || "In the tiffin box")}</div>
    </div>
    <div class="food-kcal">${formatKcal(entry.nutrition.calories)} kcal</div>
    <button class="dots" data-action="row-menu" data-id="${entry.id}"
      aria-label="Options for ${esc(entry.name)}">•••</button>
  </div>`;
}

function balanceCard(a) {
  const meterWidth = (a.varietyScore / 5) * 100;
  return `
  <section class="card balance-card" aria-labelledby="balance-title">
    <div class="balance-head" id="balance-title">${esc(a.headline)}</div>
    <p class="balance-body">${esc(a.message)}</p>

    <div class="variety-meter">
      <span>${esc(varietyLabel(a.varietyScore))}</span>
      <span class="bar"><i style="width:${Math.min(100, meterWidth)}%;background:var(--green)"></i></span>
      <span>${a.varietyScore}/5</span>
    </div>

    <div class="group-grid">${groupPills(a.present)}</div>

    ${
      a.suggestions.length
        ? `<p class="tiny muted" style="margin:0 0 8px">Try adding:</p>
           <div class="suggest-list">
             ${a.suggestions
               .map(
                 (s) =>
                   `<button class="suggest-chip" data-action="suggest" data-name="${esc(s)}">${esc(s)}</button>`,
               )
               .join("")}
           </div>`
        : ""
    }
  </section>`;
}

/* ---------- Insights (this session only) ---------- */

function insightsScreen() {
  const entries = todayEntries();
  const groupCounts = {};
  for (const e of entries) {
    for (const g of e.foodGroups || []) groupCounts[g] = (groupCounts[g] || 0) + 1;
  }

  return `
    <h2 class="section-title">Insights</h2>

    <section class="card" style="margin-bottom:16px">
      <div class="card-head"><h3 class="card-title">What's in the tiffin box</h3></div>
      ${
        entries.length
          ? entries
              .map(
                (e) =>
                  `<div class="stat-row"><span>${esc(quantityLabel(e.quantity, e.servingUnit))} ${esc(e.name)}</span>
                   <span class="muted">${formatKcal(e.nutrition.calories)} kcal</span></div>`,
              )
              .join("")
          : `<p class="muted tiny" style="margin:0">Add a few foods and your tiffin breakdown will show up here.</p>`
      }
    </section>

    <section class="card" style="margin-bottom:16px">
      <div class="card-head"><h3 class="card-title">Nutrition variety</h3></div>
      ${FOOD_GROUPS.map((g) => {
        const n = groupCounts[g] || 0;
        const mark = n >= 2 ? "✓" : n > 0 ? "→" : "○";
        return `<div class="stat-row"><span>${GROUP_LABELS[g]}</span>
          <span class="muted">${mark} <span class="tiny">${n} item${n === 1 ? "" : "s"}</span></span></div>`;
      }).join("")}
    </section>

    <section class="card" style="margin-bottom:16px">
      <div class="card-head"><h3 class="card-title">For your class (${esc(state.profile.grade)} · ${esc(guide().label)})</h3></div>
      <div class="stat-row"><span>Age band</span><span class="muted">${esc(guide().ages)}</span></div>
      <div class="stat-row"><span>Usual break tiffin</span><span class="muted">${guide().kcal[0]}–${guide().kcal[1]} kcal</span></div>
      <div class="stat-row"><span>Protein to aim for at break</span><span class="muted">about ${guide().protein} g</span></div>
      <p class="tiny muted" style="margin:12px 0 0">${esc(guide().eatingTip)}</p>
      <p class="tiny muted" style="margin:8px 0 0">Quick picks that fit a ${SCHOOL.breakMinutes}-minute break: ${guide().picks.map(esc).join(", ")}.</p>
    </section>

    <h3 class="section-title" style="font-size:18px">Learn</h3>
    <div class="edu-grid">
      ${eduCard("Why protein matters", "Protein helps your body grow and repair tissues. Dal, curd, eggs, paneer and sprouts are everyday sources.")}
      ${eduCard("Why fibre matters", "Fibre supports healthy digestion. Fruits, vegetables, whole grains and pulses all provide it.")}
      ${eduCard("Why variety matters", "Different foods provide different nutrients, so a mixed tiffin usually covers more of what your body needs.")}
      ${eduCard("Why calcium matters", "Calcium supports strong bones and teeth while you are growing. Milk, curd and paneer are good sources.")}
    </div>
    ${DISCLAIMER}`;
}

function eduCard(title, body) {
  return `<section class="card card--flat"><h4 class="card-title" style="margin:0 0 6px">${esc(title)}</h4>
    <p class="tiny muted" style="margin:0">${esc(body)}</p></section>`;
}

/* ---------- Profile ---------- */

function profileScreen() {
  const grades = ["LKG", "UKG", ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`)];
  const sections = ["A", "B", "C", "D", "E", "F", "G", "H"];
  return `
    <h2 class="section-title">Student Profile</h2>
    <section class="card" style="margin-bottom:16px">
      <label class="field-label" for="p-name">Name</label>
      <input class="input" id="p-name" value="${esc(state.profile.name)}" maxlength="40" autocomplete="off" />

      <label class="field-label" for="p-grade">Grade</label>
      <select class="input" id="p-grade">
        ${grades.map((g) => `<option ${g === state.profile.grade ? "selected" : ""}>${g}</option>`).join("")}
      </select>

      <label class="field-label" for="p-section">Section</label>
      <select class="input" id="p-section">
        ${sections.map((s) => `<option ${s === state.profile.section ? "selected" : ""}>${s}</option>`).join("")}
      </select>

      <div style="margin-top:18px"><button class="btn btn--green btn--block" data-action="save-profile">Save for this session</button></div>
      <p class="tiny muted" style="margin:14px 0 0">
        Indian School Sohar · Nothing is saved on this Device. Your name and foods stay on screen
        only until the next student starts. No weight, measurements or health information is collected.
      </p>
    </section>

    <section class="card">
      <h3 class="card-title" style="margin:0 0 8px">Finished?</h3>
      <p class="tiny muted" style="margin:0 0 14px">Clear the screen so the next student can start fresh.</p>
      <button class="btn btn--ghost btn--block" data-action="reset-data">Start new student</button>
    </section>
    ${DISCLAIMER}`;
}

/* ============================================================
   4. MODALS
   ============================================================ */

const modalLayer = () => $("#modal-layer");
let lastFocused = null;

function openModal(html) {
  lastFocused = document.activeElement;
  $("#modal").innerHTML = html;
  modalLayer().hidden = false;
  document.body.style.overflow = "hidden";
  const focusable = $("#modal").querySelector("input, button, select, textarea");
  focusable?.focus();
}

function closeModal() {
  modalLayer().hidden = true;
  $("#modal").innerHTML = "";
  document.body.style.overflow = "";
  lastFocused?.focus();
}

/* ---------- Food picker ---------- */

const picker = { query: "", category: "All" };

function openPicker() {
  picker.query = "";
  picker.category = "All";
  openModal(`
    <div class="modal-head">
      <h2 class="modal-title" id="modal-title">Add Food Item</h2>
      <button class="close-btn" data-action="close-modal" aria-label="Close">✕</button>
    </div>
    <div class="search-bar">
      <span aria-hidden="true">🔍</span>
      <label class="sr-only" for="food-search">Search foods</label>
      <input id="food-search" type="search" placeholder="Search foods..." autocomplete="off" />
    </div>
    <div class="cat-row" role="tablist" aria-label="Food categories">
      ${CATEGORIES.map(
        (c) =>
          `<button class="cat ${c === "All" ? "is-active" : ""}" data-action="set-cat" data-cat="${esc(c)}">${esc(c)}</button>`,
      ).join("")}
    </div>
    <div id="picker-results"></div>
  `);
  renderPickerResults();
  $("#food-search").addEventListener("input", (e) => {
    picker.query = e.target.value;
    renderPickerResults();
  });
}

function renderPickerResults() {
  const host = $("#picker-results");
  if (!host) return;
  const results = searchFoods(picker.query, picker.category);

  if (!results.length) {
    host.innerHTML = `
      <div class="empty">
        <div class="empty__emoji" aria-hidden="true">🔎</div>
        <h3 class="empty__title">No food found</h3>
        <p class="empty__text">Can't find your food? Describe it and our AI helper can estimate its nutrition.</p>
        <button class="btn btn--green" data-action="open-ai" data-q="${esc(picker.query)}">Ask AI to analyze it</button>
      </div>`;
    return;
  }

  host.innerHTML = `
    <div class="food-grid">
      ${results
        .map(
          (f) => `
        <button class="food-card" data-action="pick-food" data-id="${esc(f.id)}" data-base="${esc(f.presetBase || "")}">
          ${thumb(f)}
          <span class="food-card__name">${esc(f.name)}${f.presetBase ? ` — ${esc((f.bases || []).find((b) => b.id === f.presetBase)?.label || "")}` : ""}</span>
          <span class="food-card__meta">${esc(f.category)} · ${round(f.nutritionPerServing.calories)} kcal / ${esc(f.servingUnit)}</span>
        </button>`,
        )
        .join("")}
    </div>
    <div style="margin-top:16px">
      <button class="btn btn--ghost btn--block" data-action="open-ai" data-q="${esc(picker.query)}">Can't find your food? Ask AI</button>
    </div>`;
}

/* ---------- Portion picker ---------- */

const portion = { food: null, quantity: 1, baseId: null, editingId: null };

function openPortion(food, { baseId = null, editingId = null, quantity = null } = {}) {
  portion.food = food;
  portion.baseId = baseId || food.bases?.[0]?.id || null;
  portion.quantity = quantity ?? food.defaultServing ?? 1;
  portion.editingId = editingId;
  renderPortion();
}

function renderPortion() {
  const f = portion.food;
  const useOptions = Array.isArray(f.amountOptions);
  const base = (f.bases || []).find((b) => b.id === portion.baseId);
  const preview = scaleNutrition(f.nutritionPerServing, portion.quantity, base?.multiplier || 1);

  openModal(`
    <div class="modal-head">
      <h2 class="modal-title" id="modal-title">${esc(f.name)}</h2>
      <button class="close-btn" data-action="close-modal" aria-label="Close">✕</button>
    </div>

    <div style="display:flex;align-items:center;gap:14px;margin-bottom:6px">
      ${thumb(f)}
      <p class="tiny muted" style="margin:0">${esc(f.servingNote || `1 ${f.servingUnit}`)}</p>
    </div>

    ${
      f.bases
        ? `<div class="field-label" id="base-label">What is it made from?</div>
           <div class="option-row" role="group" aria-labelledby="base-label">
             ${f.bases
               .map(
                 (b) =>
                   `<button class="option ${b.id === portion.baseId ? "is-active" : ""}" data-action="set-base" data-base="${esc(b.id)}"
                     aria-pressed="${b.id === portion.baseId}">${esc(b.label)}</button>`,
               )
               .join("")}
           </div>`
        : ""
    }

    <div class="field-label" id="qty-label">${useOptions ? "Amount" : "How many?"}</div>
    ${
      useOptions
        ? `<div class="option-row" role="group" aria-labelledby="qty-label">
             ${f.amountOptions
               .map(
                 (v) =>
                   `<button class="option ${v === portion.quantity ? "is-active" : ""}" data-action="set-qty" data-qty="${v}"
                     aria-pressed="${v === portion.quantity}">${esc(quantityLabel(v, f.amountUnitLabel || f.servingUnit))}</button>`,
               )
               .join("")}
           </div>`
        : `<div class="stepper">
             <button data-action="qty-minus" aria-label="Decrease quantity">−</button>
             <output aria-live="polite">${portion.quantity}</output>
             <button data-action="qty-plus" aria-label="Increase quantity">+</button>
           </div>`
    }

    <div class="preview-strip" aria-live="polite">
      <div><b>${formatKcal(preview.calories)}</b><span>kcal</span></div>
      <div><b>${round(preview.carbs, "carbs")} g</b><span>Carbs</span></div>
      <div><b>${round(preview.protein, "protein")} g</b><span>Protein</span></div>
      <div><b>${round(preview.fibre, "fibre")} g</b><span>Fibre</span></div>
    </div>

    <button class="btn btn--green btn--block" data-action="confirm-portion">
      ${portion.editingId ? "Save changes" : "Add to Tiffin"}
    </button>
  `);
}

function confirmPortion() {
  const entry = buildEntry(portion.food, portion.quantity, portion.baseId);
  const entries = todayEntries().slice();
  if (portion.editingId) {
    const idx = entries.findIndex((e) => e.id === portion.editingId);
    if (idx > -1) entries[idx] = { ...entry, id: portion.editingId };
    toast(`${entry.name} updated`);
  } else {
    entries.push(entry);
    toast(`${entry.name} added to your tiffin`);
  }
  closeModal();
  setEntries(entries);
}

/* ---------- AI estimate ---------- */

function openAiModal(prefill = "") {
  const ready = isAiConfigured();
  openModal(`
    <div class="modal-head">
      <h2 class="modal-title" id="modal-title">Ask AI about a food</h2>
      <button class="close-btn" data-action="close-modal" aria-label="Close">✕</button>
    </div>
    <p class="tiny muted" style="margin:0 0 12px">
      Describe what you brought, for example: “2 homemade ragi dosa with a little oil”.
    </p>
    <label class="sr-only" for="ai-input">Describe your food</label>
    <textarea class="input" id="ai-input" placeholder="Describe your food...">${esc(prefill)}</textarea>
    ${
      ready
        ? ""
        : `<div class="notice" style="margin-top:14px">
             <b>AI helper not set up</b>
             <p class="tiny" style="margin:6px 0 0">
               Open <code>gemini.js</code> and paste a Gemini API key from
               <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">Google AI Studio</a>
               into <code>GEMINI_API_KEY</code>, then refresh this page — or paste it below to use it for this session.
             </p>
             <label class="sr-only" for="ai-key">Gemini API key</label>
             <input class="input" id="ai-key" type="password" placeholder="Paste Gemini API key" autocomplete="off" style="margin-top:10px" />
             <button class="btn btn--ghost btn--block" data-action="use-ai-key" style="margin-top:8px">Use this key</button>
           </div>`
    }
    <div style="margin-top:16px">
      <button class="btn btn--green btn--block" data-action="run-ai" ${ready ? "" : "disabled"}>
        Estimate nutrition
      </button>
    </div>
    <div id="ai-output"></div>
  `);
  const input = $("#ai-input");
  if (input) input.focus();
}


async function runAi() {
  const description = $("#ai-input").value.trim();
  if (!description) return;
  const out = $("#ai-output");
  out.innerHTML = `<div class="loading"><span class="spinner"></span>
    <span><b>Analyzing your food...</b><br><span class="tiny">Estimating nutrition</span></span></div>`;

  try {
    const est = await analyzeFood(description);
    renderAiResult(est);
  } catch (err) {
    out.innerHTML = `
      <div class="notice" style="margin-top:14px">
        <b>We couldn't estimate that food right now.</b>
        <p style="margin:6px 0 0">${esc(describeError(err.message))}</p>
        <ul class="tiny" style="margin:8px 0 0 16px;padding:0">
          <li>Try describing the food differently</li>
          <li>Check your internet connection</li>
          <li>Add a similar food from the list</li>
        </ul>
      </div>
      <div style="margin-top:12px"><button class="btn btn--ghost btn--block" data-action="run-ai">Try again</button></div>`;
  }
}

/** Convert a validated AI estimate into a food object the rest of the app understands. */
function aiEstimateToFood(est) {
  const qty = est.quantity || 1;
  return {
    id: `ai-${est.foodName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name: est.foodName,
    category: "Other",
    servingUnit: est.servingUnit || "serving",
    servingNote: est.estimatedWeightGrams
      ? `1 ${est.servingUnit || "serving"} ≈ ${Math.round(est.estimatedWeightGrams / qty)} g (AI estimate)`
      : "AI estimate",
    defaultServing: qty,
    foodGroups: est.foodGroups,
    emoji: "✨",
    isCustom: true,
    nutritionPerServing: {
      calories: est.calories / qty,
      carbs: est.carbohydratesGrams / qty,
      protein: est.proteinGrams / qty,
      fat: est.fatGrams / qty,
      fibre: est.fibreGrams / qty,
      sugar: est.sugarGrams / qty,
      sodium: est.sodiumMg / qty,
      calcium: 0,
      iron: 0,
    },
  };
}

let pendingAiFood = null;

function renderAiResult(est) {
  pendingAiFood = aiEstimateToFood(est);
  const confidenceCopy = { high: "High confidence", medium: "Medium confidence", low: "Low confidence" };

  $("#ai-output").innerHTML = `
    <section class="card" style="margin-top:16px">
      <h3 class="card-title" style="margin:0 0 2px">AI Nutrition Estimate</h3>
      <p class="tiny muted" style="margin:0 0 10px">${esc(est.foodName)} · ${esc(quantityLabel(est.quantity, est.servingUnit))}</p>
      <div class="kcal">~${formatKcal(est.calories)} kcal</div>
      <div class="preview-strip" style="margin-top:14px">
        <div><b>${round(est.carbohydratesGrams, "carbs")} g</b><span>Carbs</span></div>
        <div><b>${round(est.proteinGrams, "protein")} g</b><span>Protein</span></div>
        <div><b>${round(est.fatGrams, "fat")} g</b><span>Fat</span></div>
        <div><b>${round(est.fibreGrams, "fibre")} g</b><span>Fibre</span></div>
      </div>
      <p class="tiny muted" style="margin:0 0 6px"><b>Based on your description</b></p>
      <p class="tiny muted" style="margin:0 0 4px">✓ Estimate generated · ~ ${esc(confidenceCopy[est.confidence])}</p>
      <div class="group-grid" style="margin-top:10px">${groupPills(est.foodGroups)}</div>
      ${
        est.assumptions.length
          ? `<p class="tiny muted" style="margin:0 0 4px"><b>Assumptions</b></p>
             <ul class="tiny muted" style="margin:0 0 12px 16px;padding:0">${est.assumptions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>`
          : ""
      }
      <label class="tiny muted" style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
        <input type="checkbox" id="ai-save" checked /> Save this food for later
      </label>
      <div style="display:grid;gap:8px">
        <button class="btn btn--green btn--block" data-action="add-ai">Add to Tiffin</button>
        <button class="btn btn--ghost btn--block" data-action="edit-ai">Edit quantity</button>
      </div>
      <p class="tiny muted" style="margin:12px 0 0">These AI values are estimates, not laboratory measurements.</p>
    </section>`;
}

function commitAiFood({ openEditor = false } = {}) {
  if (!pendingAiFood) return;
  if ($("#ai-save")?.checked) {
    store.saveCustomFood(pendingAiFood);
    refreshCustomFoods();
  }
  if (openEditor) {
    openPortion(pendingAiFood);
    return;
  }
  const entries = todayEntries().slice();
  entries.push(buildEntry(pendingAiFood, pendingAiFood.defaultServing, null));
  closeModal();
  setEntries(entries);
  toast(`${pendingAiFood.name} added to your tiffin`);
}

/* ---------- View all / day detail ---------- */

function openViewAll() {
  const entries = todayEntries();
  openModal(`
    <div class="modal-head">
      <h2 class="modal-title" id="modal-title">Tiffin Box</h2>
      <button class="close-btn" data-action="close-modal" aria-label="Close">✕</button>
    </div>
    <section class="card">${entries.map(foodRow).join("") || `<p class="muted tiny">Nothing logged yet.</p>`}</section>
    <div style="margin-top:14px"><button class="btn btn--primary" data-action="open-picker">+ Add Food Item</button></div>
  `);
}


/* ---------- Row menu ---------- */

function openRowMenu(button, entryId) {
  document.querySelectorAll(".row-menu").forEach((m) => m.remove());
  const row = button.closest(".food-row");
  const menu = el(`
    <div class="row-menu" role="menu">
      <button role="menuitem" data-action="edit-entry" data-id="${entryId}">Edit quantity</button>
      <button role="menuitem" data-action="change-entry" data-id="${entryId}">Change food</button>
      <button role="menuitem" data-action="remove-entry" data-id="${entryId}">Remove</button>
    </div>`);
  row.append(menu);
  menu.querySelector("button").focus();
}

/* ============================================================
   5. EVENTS + BOOTSTRAP
   ============================================================ */

document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-action], [data-nav]");

  if (!event.target.closest(".row-menu") && !event.target.closest('[data-action="row-menu"]')) {
    document.querySelectorAll(".row-menu").forEach((m) => m.remove());
  }
  if (!trigger) return;

  const { action, nav, id, cat, base, qty, date, name, q } = trigger.dataset;

  if (nav) return switchScreen(nav);

  switch (action) {
    case "close-modal":
      return closeModal();

    case "open-picker":
      return openPicker();

    case "set-cat": {
      picker.category = cat;
      document.querySelectorAll(".cat").forEach((c) => c.classList.toggle("is-active", c.dataset.cat === cat));
      return renderPickerResults();
    }

    case "pick-food": {
      const food = getFood(id);
      if (food) openPortion(food, { baseId: base || null });
      return;
    }

    case "set-base":
      portion.baseId = base;
      return renderPortion();

    case "set-qty":
      portion.quantity = Number(qty);
      return renderPortion();

    case "qty-plus":
      portion.quantity = Math.min(20, portion.quantity + 1);
      return renderPortion();

    case "qty-minus":
      portion.quantity = Math.max(1, portion.quantity - 1);
      return renderPortion();

    case "confirm-portion":
      return confirmPortion();

    case "view-all":
      return openViewAll();


    case "row-menu":
      return openRowMenu(trigger, id);

    case "edit-entry": {
      const entry = todayEntries().find((e) => e.id === id);
      const food = entry && (getFood(entry.foodId) || entryToFood(entry));
      if (food) openPortion(food, { baseId: entry.baseId, editingId: entry.id, quantity: entry.quantity });
      return;
    }

    case "change-entry": {
      removeEntry(id, { silent: true });
      return openPicker();
    }

    case "remove-entry":
      return removeEntry(id);

    case "suggest": {
      picker.query = name;
      picker.category = "All";
      openPicker();
      const input = $("#food-search");
      if (input) {
        input.value = name;
        renderPickerResults();
      }
      return;
    }

    case "open-ai":
      return openAiModal(q || "");


    case "use-ai-key": {


      const field = $("#ai-key");


      const value = field ? field.value.trim() : "";


      if (value.length < 20) return toast("That key looks too short");


      setApiKey(value);


      toast("AI key set for this session");


      return openAiModal($("#ai-input")?.value || "");


    }


    case "run-ai":
      return runAi();


    case "add-ai":
      return commitAiFood();

    case "edit-ai":
      return commitAiFood({ openEditor: true });

    case "save-profile": {
      state.profile = {
        ...state.profile,
        name: $("#p-name").value.trim() || "Student",
        grade: $("#p-grade").value,
        section: $("#p-section").value,
      };
      store.saveProfile(state.profile);
      render();
      return toast("Profile saved");
    }

    case "reset-data": {
      store.resetAll();
      refreshCustomFoods();
      state.profile = store.loadProfile();
      switchScreen("home");
      return toast("Ready for the next student");
    }

    default:
      return undefined;
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modalLayer().hidden) closeModal();
});

function entryToFood(entry) {
  // Rebuild a food-like object for custom/AI foods no longer in the catalogue.
  const perServing = {};
  for (const [k, v] of Object.entries(entry.nutrition)) perServing[k] = v / entry.quantity;
  return {
    id: entry.foodId,
    name: entry.name,
    emoji: entry.emoji,
    servingUnit: entry.servingUnit,
    defaultServing: entry.quantity,
    foodGroups: entry.foodGroups,
    nutritionPerServing: perServing,
  };
}

function removeEntry(id, { silent = false } = {}) {
  const entries = todayEntries().filter((e) => e.id !== id);
  setEntries(entries);
  if (!silent) toast("Item removed");
}

function switchScreen(next) {
  state.screen = next;
  document.querySelectorAll(".screen").forEach((s) => {
    s.hidden = s.dataset.screen !== next;
  });
  document.querySelectorAll(".nav-item").forEach((b) => {
    const active = b.dataset.nav === next;
    b.classList.toggle("is-active", active);
    if (active) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  render();
  $(`#screen-${next}`).focus();
}

async function bootstrap() {
  try {
    await initFoodDatabase();
  } catch {
    $("#screen-home").innerHTML = `<section class="card"><div class="notice">
      We couldn't load the food list. Please refresh the page.</div></section>`;
    return;
  }
  state.ready = true;
  render();
}

bootstrap();
