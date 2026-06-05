/**
 * Backfill session_strokes from existing strokes_json data.
 *
 * Run AFTER creating the table:
 *   node scripts/backfill-strokes.mjs
 *
 * Safe to re-run — uses ON CONFLICT DO NOTHING.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const envPath = resolve(root, ".env.local");
  if (!existsSync(envPath)) { console.error("Missing .env.local"); process.exit(1); }
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    env[key] = val;
  }
  return env;
}

const env = loadEnv();
const BASE = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const KEY  = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;

if (!BASE || !KEY) { console.error("Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
};

async function get(path) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function post(path, body) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    method: "POST",
    headers: { ...HEADERS, Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${await res.text()}`);
}

// Normalize the segmentation_style / predicted_stroke_type to a clean stroke name
const STROKE_MAP = {
  freestyle: "Freestyle", butterfly: "Butterfly",
  breast: "Breaststroke", breaststroke: "Breaststroke",
  backstroke: "Backstroke", im: "IM",
};
function normalizeStroke(raw) {
  if (!raw) return "Freestyle";
  const lower = String(raw).toLowerCase().replace(/-/g, "_").replace(/ /g, "_");
  for (const [key, val] of Object.entries(STROKE_MAP)) {
    if (lower.startsWith(key) || lower.includes(`_${key}_`) || lower.endsWith(`_${key}`)) return val;
  }
  return "Freestyle";
}

async function main() {
  console.log("\n=== Backfill session_strokes ===\n");

  // Fetch all session_analysis rows that have strokes_json
  let page = 0;
  const PAGE_SIZE = 50;
  let totalSessions = 0, totalStrokes = 0, skipped = 0;

  while (true) {
    const rows = await get(
      `session_analysis?select=session_id,strokes_json&order=created_at.asc&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`
    );
    if (!rows.length) break;
    page++;

    for (const row of rows) {
      const strokes = Array.isArray(row.strokes_json) ? row.strokes_json : [];
      if (strokes.length === 0) { skipped++; continue; }

      // Build rows for session_strokes
      const strokeRows = strokes.map((s, i) => ({
        session_id:            row.session_id,
        stroke_index:          typeof s.stroke_index === "number" ? s.stroke_index : i + 1,
        stroke_type:           normalizeStroke(s.segmentation_style ?? s.predicted_stroke_type),
        quality_tier:          typeof s.quality_tier === "string" ? s.quality_tier : null,
        quality_label:         typeof s.predicted_quality === "string" ? s.predicted_quality : null,
        confidence:            typeof s.confidence === "number" ? s.confidence : null,
        start_time:            typeof s.start_time === "number" ? s.start_time : null,
        peak_time:             typeof s.peak_time === "number" ? s.peak_time : null,
        end_time:              typeof s.end_time === "number" ? s.end_time : null,
        predicted_stroke_type: typeof s.predicted_stroke_type === "string" ? s.predicted_stroke_type : null,
      }));

      try {
        await post("session_strokes", strokeRows);
        totalSessions++;
        totalStrokes += strokeRows.length;
        process.stdout.write(`  ✓ session ${row.session_id.slice(0, 8)}…  ${strokeRows.length} strokes\n`);
      } catch (err) {
        console.error(`  ✗ session ${row.session_id}: ${err.message}`);
      }
    }

    if (rows.length < PAGE_SIZE) break;
  }

  console.log(`\n  Sessions processed : ${totalSessions}`);
  console.log(`  Sessions skipped   : ${skipped} (no strokes_json)`);
  console.log(`  Total strokes rows : ${totalStrokes}`);
  console.log("\n=== Done ===\n");
}

main().catch(e => { console.error(e); process.exit(1); });
