// One-time seed: creates coach accounts in Supabase and their profiles.
// Run once: node seed-coaches.js
// Coaches can then log in and swimmers can select them during sign-up.

const fs = require("fs");
const path = require("path");

// Parse .env.local manually (no dotenv dependency needed)
const envPath = path.join(__dirname, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const COACHES = [
  { email: "ahmed.hassan@swimclub.com",  password: "Coach@1234", first_name: "Ahmed",   last_name: "Hassan"   },
  { email: "sara.elshamy@swimclub.com",  password: "Coach@1234", first_name: "Sara",    last_name: "El-Shamy" },
  { email: "omar.naguib@swimclub.com",   password: "Coach@1234", first_name: "Omar",    last_name: "Naguib"   },
];

async function seedCoaches() {
  for (const coach of COACHES) {
    const { email, password, first_name, last_name } = coach;

    // Create the auth user
    const { data, error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: "coach", name: `${first_name} ${last_name}` },
    });

    if (authErr) {
      if (authErr.message.includes("already been registered")) {
        console.log(`⚠  ${email} already exists — skipping auth creation`);
      } else {
        console.error(`✗  ${email}: ${authErr.message}`);
        continue;
      }
    }

    const userId = data?.user?.id;

    // If user already existed, look up their id
    let resolvedId = userId;
    if (!resolvedId) {
      const { data: existing } = await admin.auth.admin.listUsers();
      const found = existing?.users?.find((u) => u.email === email);
      resolvedId = found?.id;
    }

    if (!resolvedId) {
      console.error(`✗  Could not resolve user id for ${email}`);
      continue;
    }

    // Upsert the profile row
    const { error: profileErr } = await admin.from("profiles").upsert({
      id: resolvedId,
      first_name,
      last_name,
      role: "coach",
      age: null,
      coach_id: null,
    });

    if (profileErr) {
      console.error(`✗  Profile upsert failed for ${email}: ${profileErr.message}`);
    } else {
      console.log(`✓  Coach created: ${first_name} ${last_name} (${email})  password: ${password}`);
    }
  }

  console.log("\nDone. Coaches will now appear in the sign-up and settings dropdowns.");
}

seedCoaches().catch(console.error);
