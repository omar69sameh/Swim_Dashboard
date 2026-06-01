/**
 * Reads Supabase schema (tables/columns) and storage buckets.
 * Requires .env.local with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *
 * Run: node scripts/inspect-supabase.mjs
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envPath = resolve(root, ".env.local");

function loadEnv() {
  if (!existsSync(envPath)) {
    console.error("\nMissing .env.local — create it in the project root (see .env.example).\n");
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
const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("\n.env.local must include:\n  SUPABASE_URL=https://fdeiebmamhhwrucrwytl.supabase.co\n  SUPABASE_SERVICE_ROLE_KEY=...\n");
  process.exit(1);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
};

async function main() {
  console.log("\n=== Supabase inspection ===\n");
  console.log("Project:", url);

  // PostgREST OpenAPI = all public tables + columns
  const restRes = await fetch(`${url}/rest/v1/`, { headers });
  if (!restRes.ok) {
    console.error("\nREST API failed:", restRes.status, await restRes.text());
    process.exit(1);
  }
  const spec = await restRes.json();
  const defs = spec.definitions || {};
  const tables = Object.keys(defs).filter((k) => !k.startsWith("rpc/")).sort();

  console.log("\n--- Tables & columns ---\n");
  if (tables.length === 0) {
    console.log("(no tables exposed via API — check RLS or create tables)");
  } else {
    for (const table of tables) {
      const props = defs[table]?.properties || {};
      const cols = Object.keys(props).sort();
      console.log(`${table}`);
      console.log(`  columns: ${cols.join(", ") || "(none)"}`);
      console.log("");
    }
  }

  // Storage buckets
  const storageRes = await fetch(`${url}/storage/v1/bucket`, { headers });
  console.log("--- Storage buckets ---\n");
  if (!storageRes.ok) {
    console.log("(could not list buckets:", storageRes.status, ")");
  } else {
    const buckets = await storageRes.json();
    if (!Array.isArray(buckets) || buckets.length === 0) {
      console.log("(no buckets)");
    } else {
      for (const b of buckets) {
        console.log(`  - ${b.name} (public: ${b.public ?? false})`);
      }
    }
  }

  // Auth users count (admin API)
  const usersRes = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=5`, { headers });
  console.log("\n--- Auth users (sample) ---\n");
  if (!usersRes.ok) {
    console.log("(need service_role key to list users:", usersRes.status, ")");
  } else {
    const data = await usersRes.json();
    const users = data.users || [];
    console.log(`Total users (this page): ${users.length}${data.total ? ` / ${data.total}` : ""}`);
    for (const u of users.slice(0, 5)) {
      console.log(`  - ${u.email ?? u.id} (id: ${u.id})`);
    }
  }

  console.log("\n=== Done ===\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
