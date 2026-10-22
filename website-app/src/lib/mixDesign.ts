/**
 * Mix and cement-content helpers, shared by the Mix Designer and the Lab
 * test report.
 *
 * WHY THIS EXISTS
 *
 * A ready-mix plant specifies its mixes two ways, and the app has to speak
 * both:
 *
 *   1. by GRADE — "C30", the strength the client ordered;
 *   2. by CEMENT CONTENT — "300 kg/m³", how the plant actually buys and
 *      batches it.
 *
 * The second is the one the batching engineer works in: the silo holds
 * cement, not grades. So the cement content is what the recipes on the
 * mixes page are really made of, and the grade is what that cement content
 * buys in strength.
 *
 * The grade a cement content buys is taken FROM THE PLANT'S OWN RECIPES —
 * not from a textbook — because the plant's aggregates, its admixture and
 * its cement are what determine it. A plant that runs 300 kg/m³ at C25 has
 * told us more about its materials than any table would.
 */

export interface MixRecipe {
  code: string;
  cement: number;
  sand: number;
  gravel: number;
  water: number;
  admixture: number;
}

/** The design strength a grade code stands for ("C30" → 30). 0 when unknown. */
export const parseFc = (code: string): number => {
  const m = /C\s*(\d+)/i.exec(code || '');
  return m ? parseInt(m[1], 10) : 0;
};

/**
 * The cement contents the plant can choose from: the ones its own recipes
 * already use, plus the round numbers a batching engineer would ask for
 * (200 / 250 / 300 / 350 kg/m³) that are not in the recipe list yet.
 */
export function cementContentOptions(
  recipes: MixRecipe[],
  extra: number[] = [200, 250, 300, 350],
): number[] {
  const set = new Set<number>();
  recipes.forEach(r => {
    const c = Number(r.cement);
    if (Number.isFinite(c) && c > 0) set.add(c);
  });
  extra.forEach(c => set.add(c));
  return [...set].sort((a, b) => a - b);
}

/**
 * The grade a cement content buys, read off the plant's own recipes.
 *
 * Interpolates between the two nearest recipes (a recipe is a real, proven
 * point: 320 kg/m³ really did make C25 here). Outside the recipe range the
 * nearest end is held — extrapolating a cement–grade line past the data is
 * how a plant ends up promising a strength its materials cannot make.
 */
export function gradeForCement(recipes: MixRecipe[], cement: number): number {
  const pts = recipes
    .map(r => ({ c: Number(r.cement), fc: parseFc(r.code) }))
    .filter(p => p.fc > 0 && Number.isFinite(p.c) && p.c > 0)
    .sort((a, b) => a.c - b.c);
  if (!pts.length) return 0;
  if (pts.length === 1) return pts[0].fc;
  if (cement <= pts[0].c) return pts[0].fc;
  const last = pts[pts.length - 1];
  if (cement >= last.c) return last.fc;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (cement >= a.c && cement <= b.c) {
      const w = b.c === a.c ? 0 : (cement - a.c) / (b.c - a.c);
      // Half-megapascal steps — the precision a concrete grade is quoted at.
      return Math.round((a.fc + w * (b.fc - a.fc)) * 2) / 2;
    }
  }
  return last.fc;
}

/** The recipe that batches this exact cement content, if the plant has one. */
export function recipeForCement(
  recipes: MixRecipe[],
  cement: number,
): MixRecipe | null {
  return recipes.find(r => Number(r.cement) === Number(cement)) ?? null;
}
