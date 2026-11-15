// Academic years an admin may manage.
// Super admin: all four years. Department admin: their own year plus the extra years the
// super admin granted in public.admin_scopes. The database (RLS) enforces the same rule;
// this helper only decides which options the admin pages show.
export const ALL_YEARS = [1, 2, 3, 4];

export async function loadAllowedYears(supabase, userId) {
  if (!userId) return [];

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_super_admin, academic_year")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile || profile.role !== "admin") return [];
  if (profile.is_super_admin === true) return ALL_YEARS;

  const years = new Set();
  const ownYear = Number(profile.academic_year);
  if (ALL_YEARS.includes(ownYear)) years.add(ownYear);

  const { data: scopes, error: scopesError } = await supabase
    .from("admin_scopes")
    .select("academic_year")
    .eq("admin_id", userId);

  if (scopesError) throw scopesError;
  (scopes || []).forEach((row) => {
    const year = Number(row.academic_year);
    if (ALL_YEARS.includes(year)) years.add(year);
  });

  return [...years].sort((a, b) => a - b);
}
