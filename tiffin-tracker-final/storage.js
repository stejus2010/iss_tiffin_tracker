/**
 * storage.js — KIOSK MODE (session only).
 *
 * This app runs on a shared laptop in the hall: one student at a time walks up,
 * enters their tiffin, gets feedback and walks away. Nothing is written to disk
 * or to localStorage — everything lives in memory and disappears when the
 * session is reset ("New student") or the page is refreshed.
 */

export const DEFAULT_PROFILE = {
  name: "Student",
  grade: "Grade 7",
  section: "A",
  school: "Indian School Sohar",
};

/** In-memory session state. Cleared by resetAll(). */
let session = {
  profile: { ...DEFAULT_PROFILE },
  entries: [],
  customFoods: [],
};

export function loadProfile() {
  return { ...session.profile };
}

export function saveProfile(profile) {
  session.profile = { ...DEFAULT_PROFILE, ...profile };
}

/** Foods entered in the current session. */
export function loadEntries() {
  return session.entries;
}

export function saveEntries(entries) {
  session.entries = entries;
}

/** AI-estimated foods stay available for the rest of this session only. */
export function loadCustomFoods() {
  return session.customFoods;
}

export function saveCustomFood(food) {
  session.customFoods = session.customFoods
    .filter((f) => f.id !== food.id)
    .concat({ ...food, isCustom: true });
}

/** Wipe everything so the next student starts clean. */
export function resetAll() {
  session = { profile: { ...DEFAULT_PROFILE }, entries: [], customFoods: [] };
}
