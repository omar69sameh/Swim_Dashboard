/**
 * Inspect a single session's per-stroke breakdown from Supabase.
 *
 * Usage:
 *   node scripts/inspect-session.mjs                   ← picks the latest analysed session
 *   node scripts/inspect-session.mjs <session_id>      ← specific session UUID
 *
 * Requires .env.local with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const envPath = resolve(root, ".env.local");
  if (!existsSync(envPath)) {
    console.error("Missing .env.local");
    process.exit(1);
  }
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const env = loadEnv();
const BASE_URL = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;

if (!BASE_URL || !KEY) {
  console.error("Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

async function query(table, params = "") {
  const res = await fetch(`${BASE_URL}/rest/v1/${table}?${params}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

// ─── tier → human label ────────────────────────────────────────────────────
const TIER_LABEL = {
  low:           "✅ Low Risk      (Good Form)",
  good:          "✅ Low Risk      (Good Form)",
  moderate:      "🟡 Moderate Risk",
  moderate_high: "🟠 Moderate-High Risk",
  high:          "🔴 High Risk     (Needs Work)",
  bad:           "🔴 High Risk     (Needs Work)",
  risk:          "🔴 High Risk     (Needs Work)",
};

function tierLabel(tier) {
  if (!tier) return "— (not stored)";
  const key = tier.toLowerCase().replace(/-/g, "_");
  return TIER_LABEL[key] ?? tier;
}

// ─── main ─────────────────────────────────────────────────────────────────
async function main() {
  const targetId = process.argv[2] ?? null;

  let analysis;

  if (targetId) {
    const rows = await query("session_analysis", `session_id=eq.${targetId}&select=*`);
    if (!rows.length) {
      console.error(`No analysis found for session_id: ${targetId}`);
      process.exit(1);
    }
    analysis = rows[0];
  } else {
    // Pick latest completed session that has strokes_json
    const rows = await query(
      "session_analysis",
      "select=*&order=created_at.desc&limit=20"
    );
    analysis = rows.find(
      (r) => Array.isArray(r.strokes_json) && r.strokes_json.length > 0
    );
    if (!analysis) {
      console.error("No analysed sessions with strokes_json found.");
      process.exit(1);
    }
  }

  const strokes = Array.isArray(analysis.strokes_json) ? analysis.strokes_json : [];

  // ── Session summary ──────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════");
  console.log("  SESSION ANALYSIS");
  console.log("════════════════════════════════════════════════════════");
  console.log(`  session_id     : ${analysis.session_id}`);
  console.log(`  primary_stroke : ${analysis.primary_stroke}`);
  console.log(`  quality_score  : ${analysis.quality_score ?? "—"} / 100`);
  console.log(`  quality_tier   : ${tierLabel(analysis.quality_tier)}  [session-level majority vote]`);
  console.log(`  quality_label  : ${analysis.quality_label ?? "—"}`);
  console.log(`  num_strokes    : ${analysis.num_strokes ?? strokes.length}`);
  console.log(`  stroke_conf    : ${analysis.stroke_confidence != null ? (analysis.stroke_confidence * 100).toFixed(1) + "%" : "—"}`);
  console.log(`  pipeline_ver   : ${analysis.pipeline_version}`);
  console.log(`  analysed_at    : ${analysis.created_at ?? "—"}`);

  if (strokes.length === 0) {
    console.log("\n  ⚠️  strokes_json is empty — pipeline may have stored no per-stroke data.");
    console.log("════════════════════════════════════════════════════════\n");
    return;
  }

  // ── What fields does the first stroke have? ──────────────────────────────
  const allKeys = [...new Set(strokes.flatMap(Object.keys))];
  const hasPerStrokeQuality = allKeys.includes("quality_tier");
  const hasPerStrokeLabel   = allKeys.includes("predicted_quality");
  const hasTiming           = allKeys.includes("start_time");

  console.log(`\n  strokes stored : ${strokes.length}`);
  console.log(`  fields per stroke: ${allKeys.join(", ")}`);
  console.log(`  per-stroke quality_tier : ${hasPerStrokeQuality ? "✅ YES" : "❌ NO — only session-level tier available"}`);
  console.log(`  per-stroke quality label: ${hasPerStrokeLabel ? "✅ YES" : "❌ NO"}`);
  console.log(`  timing data (start/end) : ${hasTiming ? "✅ YES" : "❌ NO"}`);

  // ── Per-stroke table ─────────────────────────────────────────────────────
  console.log("\n────────────────────────────────────────────────────────");
  console.log("  PER-STROKE BREAKDOWN");
  console.log("────────────────────────────────────────────────────────");

  strokes.forEach((s, i) => {
    const idx        = s.stroke_index ?? i;
    const style      = s.segmentation_style ?? s.predicted_stroke_type ?? "?";
    const conf       = s.confidence != null ? (s.confidence <= 1 ? s.confidence * 100 : s.confidence).toFixed(1) + "%" : "—";
    const tier       = tierLabel(s.quality_tier);
    const label      = s.predicted_quality ?? "—";
    const start      = s.start_time != null ? s.start_time.toFixed(2) + "s" : "—";
    const end        = s.end_time   != null ? s.end_time.toFixed(2)   + "s" : "—";
    const peak       = s.peak_time  != null ? s.peak_time.toFixed(2)  + "s" : "—";

    console.log(`\n  Stroke ${String(idx + 1).padStart(2, " ")}:`);
    console.log(`    type          : ${style}`);
    console.log(`    quality_tier  : ${tier}`);
    console.log(`    quality_label : ${label}`);
    console.log(`    confidence    : ${conf}`);
    if (hasTiming) {
      console.log(`    timing        : ${start} → peak ${peak} → ${end}`);
    }
  });

  // ── Quality distribution ─────────────────────────────────────────────────
  if (hasPerStrokeQuality) {
    const dist = {};
    for (const s of strokes) {
      const t = (s.quality_tier ?? "unknown").toLowerCase().replace(/-/g, "_");
      dist[t] = (dist[t] ?? 0) + 1;
    }
    console.log("\n────────────────────────────────────────────────────────");
    console.log("  QUALITY DISTRIBUTION  (per-stroke)");
    console.log("────────────────────────────────────────────────────────");
    for (const [tier, count] of Object.entries(dist)) {
      const bar = "█".repeat(count);
      console.log(`  ${tier.padEnd(16)} ${bar} ${count}/${strokes.length}`);
    }
    const goodCount = strokes.filter(s => {
      const t = (s.quality_tier ?? "").toLowerCase().replace(/-/g, "_");
      return t === "low" || t === "good";
    }).length;
    console.log(`\n  Good Form strokes : ${goodCount} / ${strokes.length} (${Math.round(goodCount/strokes.length*100)}%)`);
  }

  console.log("\n════════════════════════════════════════════════════════\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
