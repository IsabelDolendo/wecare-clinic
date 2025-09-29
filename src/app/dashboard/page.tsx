import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardRouter() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // 1) Prefer server RPC check (authoritative)
  const { data: isAdminRpc } = await supabase.rpc("is_admin", { uid: user.id });
  if (isAdminRpc) redirect("/dashboard/admin");

  // 2) Fallback to metadata role if present
  const metaRoleRaw = typeof user.user_metadata?.role === "string" ? (user.user_metadata.role as string) : undefined;
  if (metaRoleRaw?.toLowerCase() === "admin") redirect("/dashboard/admin");

  // 3) Fallback to profiles.role
  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if ((prof?.role as string | undefined)?.toLowerCase() === "admin") redirect("/dashboard/admin");

  redirect("/dashboard/patient");
}
