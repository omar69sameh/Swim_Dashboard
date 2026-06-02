/**
 * Mark all sessions without completed analysis as pending (for worker pickup).
 * Requires .env.local with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *
 * Run: node scripts/backfill-analysis-pending.mjs
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envPath = resolve(root, ".env.local");

function loadEnv() {
  if (!existsSync(envPath)) {
    console.error("Missing .env.local");
    process.exit(1);
  }
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return env;
}

const env = loadEnv();
const url = env.SUPABASE_URL?.replace(/\/$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function main() {
  const listRes = await fetch(
    `${url}/rest/v1/swimming_sessions?select=id,analysis_status&analysis_status=neq.completed`,
    { headers }
  );
  const rows = await listRes.json();
  if (!Array.isArray(rows)) {
    console.error("List failed:", rows);
    process.exit(1);
  }

  console.log(`Found ${rows.length} sessions not completed`);

  let updated = 0;
  for (const row of rows) {
    const patchRes = await fetch(
      `${url}/rest/v1/swimming_sessions?id=eq.${row.id}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ analysis_status: "pending", analysis_error: null }),
      }
    );
    if (patchRes.ok) updated++;
  }

  console.log(`Set ${updated} sessions to pending. Start the ML worker to process them.`);
}

main().catch(console.error);
