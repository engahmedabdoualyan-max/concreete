/* eslint-disable no-console */
/**
 * Sanity check of the depreciation / renewal-fund math (pure functions, no DB).
 *
 *   npx tsx scripts/depreciation-math-check.ts
 */
import {
  planMonthly,
  suggestedLifeFor,
  defaultRateForLife,
  resolveUsefulLife,
  computeReplacementTarget,
  timelineOf,
} from "../src/lib/services/depreciation.service";

const SAR = (c: number) => (c / 100).toFixed(2);

function check(label: string, cond: boolean, extra = "") {
  console.log(`${cond ? "✅" : "❌"} ${label}${extra ? " — " + extra : ""}`);
  if (!cond) process.exitCode = 1;
}

// ── 1) classic mode: no replacement estimate ────────────────────────────────
const classic = planMonthly({
  asset: { purchaseCostSar: 150_000_00, salvageValueSar: 0, annualRatePct: "10", purchaseDate: "2020-01-15" },
  kind: "MIXER_TRUCK",
  referenceYear: 2020,
  life: 10,
  inflation: 3,
  accumulatedBook: 0,
});
check("classic: monthly = 150000×10%/12", classic.total === 125_000, SAR(classic.total));
check("classic: no fund", classic.fund === 0);
check("classic: no target", classic.target === 0);

// ── 2) mode A — tipper bought used for 50k, new one costs 150k ──────────────
// cost 50k, current worth 50k ⇒ book base 0, all of it goes to the fund
const tipperAsset = {
  purchaseCostSar: 50_000_00,
  assessmentValueSar: 50_000_00,
  salvageValueSar: 0,
  annualRatePct: "10",
  purchaseDate: "2024-01-15",
  replacementCostEstSar: 150_000_00,
};
const tipperTarget = computeReplacementTarget(tipperAsset, 2024, 13, 3);
const tipper = planMonthly({
  asset: { ...tipperAsset, replacementTargetSar: tipperTarget },
  kind: "TIPPER_TRUCK",
  referenceYear: 2024,
  life: 13,
  inflation: 3,
  accumulatedBook: 0,
  accumulatedTotal: 0,
  monthStart: "2026-10-01",
});
check("tipper: book part = 0 (worth == cost)", tipper.book === 0, SAR(tipper.book));
check("tipper: target = 150k inflated", tipper.target > 150_000_00, SAR(tipper.target));
check("tipper: fund carries the whole charge", tipper.fund === tipper.total, SAR(tipper.total));

// ── 3) the frozen target must NOT drift as time passes ──────────────────────
// the target is the price of a NEW unit at the end of life — it is computed
// once and frozen, otherwise the fund would land short of the real price.
{
  const frozen = computeReplacementTarget(tipperAsset, 2024, 13, 3);
  const later = computeReplacementTarget(tipperAsset, 2024, 13, 3);
  check("target is stable for the same inputs", frozen === later, SAR(frozen));

  const tl = timelineOf(tipperAsset, 2024, 13);
  const expected = Math.round(150_000_00 * Math.pow(1.03, tl.yearsToEnd));
  check(
    "target = today's price × (1+inflation)^yearsToEnd",
    Math.abs(frozen - expected) <= 1,
    `${SAR(frozen)} vs ${SAR(expected)} (${tl.yearsToEnd.toFixed(2)} years)`
  );
  check("life ends in 2037-01", String(tl.lifeEndMonth).startsWith("2037-01"), String(tl.lifeEndMonth));
}

// ── 4) a machine whose renewal target must be hit exactly ───────────────────
const machine = {
  purchaseCostSar: 100_000_00,
  salvageValueSar: 10_000_00,
  annualRatePct: "10",
  purchaseDate: "2026-01-01",
  replacementCostEstSar: 150_000_00,
};
const life = 10;
const machineTarget = computeReplacementTarget(machine, 2026, life, 3);
const machineAsset = { ...machine, replacementTargetSar: machineTarget };
let acc3 = 0;
let bk3 = 0;
const rows: number[] = [];
for (let m = 0; m < life * 12; m++) {
  const d = new Date(2026, m, 1);
  const ms = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  const p = planMonthly({
    asset: machineAsset,
    kind: "PUMP",
    referenceYear: 2026,
    life,
    inflation: 3,
    accumulatedBook: bk3,
    accumulatedTotal: acc3,
    monthStart: ms,
  });
  rows.push(p.total);
  acc3 += p.total;
  bk3 += p.book;
}
const finalPlan = planMonthly({
  asset: machineAsset,
  kind: "PUMP",
  referenceYear: 2026,
  life,
  inflation: 3,
  accumulatedBook: bk3,
  accumulatedTotal: acc3,
  monthStart: "2036-01-01",
});
check(
  "machine: accumulated lands on the target",
  Math.abs(acc3 - finalPlan.target) <= finalPlan.total + 1,
  `acc=${SAR(acc3)} target=${SAR(finalPlan.target)}`
);
check("machine: book part stops at the floor", bk3 <= 90_000_00 + 1, SAR(bk3));

// ── 5) tipper: full-life accumulation must land exactly on the target ───────
{
  let a2 = 0;
  let b2 = 0;
  let last: ReturnType<typeof planMonthly> | null = null;
  for (let m = 0; m < 13 * 12; m++) {
    const d = new Date(2024, m, 1);
    const ms = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    last = planMonthly({
      asset: { ...tipperAsset, replacementTargetSar: tipperTarget },
      kind: "TIPPER_TRUCK",
      referenceYear: 2024,
      life: 13,
      inflation: 3,
      accumulatedBook: b2,
      accumulatedTotal: a2,
      monthStart: ms,
    });
    a2 += last.total;
    b2 += last.book;
  }
  check(
    "tipper: accumulated lands on the target",
    last !== null && Math.abs(a2 - last.target) <= last.total + 1,
    `acc=${SAR(a2)} target=${SAR(last?.target ?? 0)}`
  );
}

// ── 6) presets ──────────────────────────────────────────────────────────────
check("preset: mixer 11y", suggestedLifeFor("MIXER_TRUCK") === 11);
check("preset: tipper 13y", suggestedLifeFor("TIPPER_TRUCK") === 13);
check("preset: pump 13y", suggestedLifeFor("CONCRETE_PUMP") === 13);
check("rate for 11y ≈ 9.09%", Math.abs(defaultRateForLife(11) - 9.09) < 0.01);
check("life from manufacture year", resolveUsefulLife({ lifeSource: "manufacture_year" }, "MIXER_TRUCK", new Date().getFullYear() - 3) === 8);
check("life from type default", resolveUsefulLife({ lifeSource: "type_default" }, "TIPPER_TRUCK", 2020) === 13);
check("life manual", resolveUsefulLife({ lifeSource: "manual", usefulLifeYears: 7 }, "TIPPER_TRUCK", 2020) === 7);

console.log("\n--- machine monthly schedule (first 3 / last 3) ---");
console.log(rows.slice(0, 3).map((r) => SAR(r)).join(" | "), "…", rows.slice(-3).map((r) => SAR(r)).join(" | "));
