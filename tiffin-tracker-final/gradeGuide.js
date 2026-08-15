/**
 * gradeGuide.js — class-aware (grade-based) guidance for the 20-minute
 * short break at Indian School Sohar.
 *
 * School day : 07:40 → 14:10
 * Short break: 10:30 → 10:50 (20 minutes)
 *
 * The tiffin eaten in that break is a *snack-sized* meal, not a full lunch.
 * These references describe roughly how much energy a break-time tiffin
 * usually provides for each age band — they are teaching aids, never targets
 * or limits, and no weight/health data is ever collected.
 */

export const SCHOOL = {
  startLabel: "7:40 AM",
  endLabel: "2:10 PM",
  breakStartLabel: "10:30 AM",
  breakEndLabel: "10:50 AM",
  breakMinutes: 20,
  start: 7 * 60 + 40,
  end: 14 * 60 + 10,
  breakStart: 10 * 60 + 30,
  breakEnd: 10 * 60 + 50,
};

/** Age bands used for break-time guidance. */
const BANDS = [
  {
    id: "early",
    grades: ["LKG", "UKG", "Grade 1", "Grade 2"],
    label: "LKG–Grade 2",
    ages: "4–8 years",
    kcal: [200, 300],
    protein: 6,
    eatingTip:
      "20 minutes is short for little hands — soft, bite-sized foods like idli, cut fruit or curd are easiest to finish.",
    picks: ["Idli", "Banana", "Curd", "Cucumber sticks"],
  },
  {
    id: "primary",
    grades: ["Grade 3", "Grade 4", "Grade 5"],
    label: "Grades 3–5",
    ages: "8–11 years",
    kcal: [250, 350],
    protein: 8,
    eatingTip:
      "Pack food that can be eaten with one hand — rolled chapati, idli or fruit slices — so the whole break isn't spent unwrapping.",
    picks: ["Chapati roll", "Boiled egg", "Apple", "Carrot sticks"],
  },
  {
    id: "middle",
    grades: ["Grade 6", "Grade 7", "Grade 8"],
    label: "Grades 6–8",
    ages: "11–14 years",
    kcal: [300, 450],
    protein: 10,
    eatingTip:
      "This is a growth-spurt age, so the break tiffin does real work — pair a grain with a protein so energy lasts until 2:10 PM.",
    picks: ["Paneer wrap", "Sprouts", "Curd", "Orange"],
  },
  {
    id: "senior",
    grades: ["Grade 9", "Grade 10", "Grade 11", "Grade 12"],
    label: "Grades 9–12",
    ages: "14–18 years",
    kcal: [350, 500],
    protein: 12,
    eatingTip:
      "With longer school hours and exams, a protein + fibre tiffin keeps concentration steadier through the afternoon periods.",
    picks: ["Chickpea salad", "Paneer", "Peanuts", "Banana"],
  },
];

/** @returns the band object for a grade string (defaults to middle school). */
export function gradeGuide(grade) {
  const band = BANDS.find((b) => b.grades.includes(grade)) || BANDS[2];
  return {
    ...band,
    kcalMid: Math.round((band.kcal[0] + band.kcal[1]) / 2),
  };
}

/** Where we are in the school day right now. */
export function breakStatus(date = new Date()) {
  const m = date.getHours() * 60 + date.getMinutes();
  if (m < SCHOOL.breakStart - 60)
    return { phase: "before", text: `Break is at ${SCHOOL.breakStartLabel} — ${SCHOOL.breakMinutes} minutes to eat.` };
  if (m < SCHOOL.breakStart)
    return { phase: "soon", text: `Break starts soon (${SCHOOL.breakStartLabel}).` };
  if (m <= SCHOOL.breakEnd) {
    const left = Math.max(1, SCHOOL.breakEnd - m);
    return { phase: "during", text: `Break is on now — about ${left} min left to eat.` };
  }
  if (m <= SCHOOL.end)
    return { phase: "after", text: `Break is over. School ends at ${SCHOOL.endLabel}.` };
  return { phase: "home", text: `School day ended at ${SCHOOL.endLabel}.` };
}

/**
 * Compare logged energy with the break-time reference for this grade.
 * Wording is descriptive, never restrictive.
 */
export function breakEnergyNote(kcal, guide) {
  const [lo, hi] = guide.kcal;
  if (!kcal) return `A typical break tiffin for ${guide.label} gives about ${lo}–${hi} kcal.`;
  if (kcal < lo * 0.75)
    return `That's a light tiffin for ${guide.label}. A little more — a fruit or curd — helps energy last until ${SCHOOL.endLabel}.`;
  if (kcal <= hi)
    return `That sits in the usual ${lo}–${hi} kcal range for a ${guide.label} break tiffin.`;
  return `That's a hearty tiffin for ${guide.label} (usual range ${lo}–${hi} kcal). Eating part of it at break and the rest later works well in ${SCHOOL.breakMinutes} minutes.`;
}
