import pg from 'pg';
import fs from 'node:fs';
const DATABASE_URL = fs.readFileSync(process.env.HOME + '/.config/fimto_db_url','utf8').trim();
const pool = new pg.Pool({connectionString: DATABASE_URL, ssl:{rejectUnauthorized:false}});
const tid = 'a95e3113-cc2e-4725-b5aa-568c663c4577';

// Each mix: [design_code, grade_desc, strength, slump, cement, sand, g10, g20, g40, water, plas, ret, fly, silica, product_type]
const mixes = [
  ['C25-S4', 'C25 انحدار 4 سم', 25, 4, 350, 700, 1100, 180, 0, 180, 2.5, 0.5, 0, 0, 'READY_MIX'],
  ['C30-S5', 'C30 انحدار 5 سم', 30, 5, 380, 680, 1050, 170, 0, 175, 2.8, 0.4, 0, 0, 'READY_MIX'],
  ['C35-S6', 'C35 انحدار 6 سم', 35, 6, 410, 650, 1000, 160, 0, 165, 3.0, 0.3, 0, 0, 'READY_MIX'],
  ['C40-S7', 'C40 انحدار 7 سم', 40, 7, 440, 620, 950, 150, 0, 155, 3.2, 0.2, 0, 0, 'READY_MIX'],
];

for (const m of mixes) {
  await pool.query(`
    insert into mix_designs (tenant_id, design_code, grade_description, target_strength_mpa, target_slump_cm,
      cement_kg_per_m3, sand_kg_per_m3, gravel_10mm_kg_per_m3, gravel_20mm_kg_per_m3, gravel_40mm_kg_per_m3,
      water_litres_per_m3, admixture_plasticizer_l_per_m3, admixture_retarder_l_per_m3,
      fly_ash_kg_per_m3, silica_fume_kg_per_m3, product_type)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    on conflict (design_code) do nothing
  `, [tid, ...m]);
}
console.log('Seeded', mixes.length, 'mix designs');
await pool.end();