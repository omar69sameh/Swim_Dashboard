# Supabase signup — dashboard and mobile app

Use the **same** Supabase project (`imu_reader`) for the phone app and this dashboard so one email/password works everywhere.

## One-time database setup

Run this in **Supabase → SQL Editor** (or use [`supabase/migrations/001_profiles_role_coach.sql`](../supabase/migrations/001_profiles_role_coach.sql)):

```sql
alter table profiles
  add column if not exists role text check (role in ('coach', 'swimmer')),
  add column if not exists coach_id uuid references profiles(id);

create index if not exists profiles_coach_id_idx on profiles(coach_id);
create index if not exists profiles_role_idx on profiles(role);

update profiles set role = 'swimmer' where role is null;
```

Set `role = 'coach'` on any existing coach profile rows manually if needed.

## Signup fields (both apps)

| Field | Where stored | Notes |
|-------|----------------|-------|
| Email / password | `auth.users` | Supabase Auth |
| Name | `profiles.first_name`, `last_name` + `user_metadata.name` | |
| Age | `profiles.age` | Swimmers: required on dashboard signup |
| Role | `profiles.role` + `user_metadata.role` | `coach` or `swimmer` |
| Coach (swimmer only, optional) | `profiles.coach_id` | UUID of coach’s `profiles.id` |

## Mobile app checklist (when you add coach/swimmer UI)

1. `supabase.auth.signUp({ email, password, options: { data: { role, name } } })`
2. Upsert `profiles`:

```ts
await supabase.from("profiles").upsert({
  id: user.id,
  first_name,
  last_name,
  role: "swimmer", // or "coach"
  age: 20, // swimmers
  coach_id: selectedCoachId ?? null, // swimmers only, optional
});
```

3. Sessions: keep writing to `swimming_sessions` as today (no change).

## Dashboard API

| Endpoint | Purpose |
|----------|---------|
| `GET /api/coaches` | List coaches for signup dropdown (public) |
| `POST /api/auth/signup` | Body: `{ email, password, name, role, coachId? }` |
| `GET /api/swimmers` | Coach sees only swimmers with `coach_id = coach user id` |

## Same account on phone and dashboard

Both apps use **one Supabase project** and **one Auth user per email**.

| Action | Result |
|--------|--------|
| Sign up on phone → log in on dashboard | Works (same email/password) |
| Sign up on dashboard → log in on phone | Works |
| Sessions recorded on phone | Visible on dashboard after login as swimmer |

On first dashboard login, the server creates/updates a `profiles` row if the phone app only created Auth + sessions.

Swimmers can set or change their coach under **Settings** on the dashboard (`PATCH /api/profile`).

## Mobile app: swimmers only (coaches blocked)

The recording app must **not** allow coach accounts. After login, read `profiles.role` (or default swimmer) and **sign out** if role is `coach`:

```ts
const { data: profile } = await supabase
  .from("profiles")
  .select("role")
  .eq("id", user.id)
  .single();

if (profile?.role === "coach") {
  await supabase.auth.signOut();
  // show: "Coaches use the web dashboard. Swimmers use this app."
  return;
}
```

On mobile signup, always set `role: 'swimmer'` in `profiles` and `user_metadata` — never `coach`. Implemented in `mobileApp/lib/services/supabase_service.dart`; coaches are blocked at login.

## Testing

1. Run the SQL migration above.
2. Sign up as **coach** on `/signup` (dashboard only).
3. Sign up as **swimmer**, pick that coach (optional), or set coach in **Settings** later.
4. Log in as coach → `/coach` shows only assigned swimmers.
5. Log in with a phone account on dashboard → same credentials, then Settings → choose coach.
