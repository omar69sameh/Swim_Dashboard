/**
 * Creates an admin user directly in Supabase.
 * Run once: node scripts/create-admin.mjs
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://fdeiebmamhhwrucrwytl.supabase.co";
const SERVICE_ROLE_KEY = "sb_secret_dZ3DCB05QhOls7rmkJdbfg_NgkZHCEG";

const ADMIN_EMAIL = "admin@swimmate.app";
const ADMIN_PASSWORD = "SwimAdmin@2025!";
const ADMIN_NAME = "SwimMate Admin";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log("Creating admin user...");

  // Check if already exists
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const alreadyExists = existing?.users?.find(
    (u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
  );

  let userId;

  if (alreadyExists) {
    console.log(`⚠️  Auth user already exists with id: ${alreadyExists.id}`);
    userId = alreadyExists.id;
  } else {
    // Create in auth.users
    const { data, error } = await admin.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { name: ADMIN_NAME, role: "admin" },
    });

    if (error || !data?.user) {
      console.error("❌ Failed to create auth user:", error?.message);
      process.exit(1);
    }

    userId = data.user.id;
    console.log(`✅ Auth user created: ${userId}`);
  }

  // Upsert profile with admin role
  const { error: profileError } = await admin.from("profiles").upsert({
    id: userId,
    first_name: "SwimMate",
    last_name: "Admin",
    age: null,
    role: "admin",
    coach_id: null,
  });

  if (profileError) {
    console.error("❌ Failed to upsert profile:", profileError.message);
    process.exit(1);
  }

  console.log("✅ Profile upserted with role = admin");
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Admin account ready:");
  console.log(`  Email   : ${ADMIN_EMAIL}`);
  console.log(`  Password: ${ADMIN_PASSWORD}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main();
