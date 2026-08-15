/**
 * sketch.js — p5.js rendering.
 *
 * p5 draws the calorie/logging progress ring on the home screen (and inside the
 * history detail sheet). Instance mode keeps p5 scoped to its own canvas so it
 * can be mounted and unmounted as screens change.
 */

const rings = new Map();

/**
 * Mount (or update) a progress ring inside a container element.
 * @param {HTMLElement} host
 * @param {number} progress 0..1
 */
export function mountProgressRing(host, progress) {
  const key = host.dataset.ringId || String(rings.size + 1);
  host.dataset.ringId = key;

  const existing = rings.get(key);
  if (existing && host.contains(existing.canvasEl)) {
    existing.setTarget(progress);
    return;
  }

  const size = 104;
  let current = 0;
  let target = Math.max(0, Math.min(1, progress));

  const sketch = (p) => {
    p.setup = () => {
      const c = p.createCanvas(size, size);
      c.parent(host);
      p.angleMode(p.DEGREES);
      p.noLoop();
      p.loop();
      rings.get(key).canvasEl = c.elt;
      c.elt.setAttribute("role", "img");
    };

    p.draw = () => {
      p.clear();
      current += (target - current) * 0.12;
      p.translate(size / 2, size / 2);
      p.rotate(-90);
      p.noFill();
      p.strokeCap(p.ROUND);

      // Track
      p.stroke(232, 229, 223);
      p.strokeWeight(9);
      p.arc(0, 0, size - 14, size - 14, 0, 360);

      // Progress
      p.stroke(76, 175, 80);
      p.strokeWeight(9);
      if (current > 0.002) p.arc(0, 0, size - 14, size - 14, 0, Math.max(2, current * 360));

      if (Math.abs(target - current) < 0.002) p.noLoop();
    };
  };

  const entry = {
    canvasEl: null,
    setTarget(value) {
      target = Math.max(0, Math.min(1, value));
      entry.p5.loop();
    },
  };
  rings.set(key, entry);
  entry.p5 = new window.p5(sketch);
}

/** Remove every mounted ring (called before re-rendering a screen). */
export function destroyRings() {
  for (const [, entry] of rings) {
    try {
      entry.p5.remove();
    } catch {
      /* already removed */
    }
  }
  rings.clear();
}
