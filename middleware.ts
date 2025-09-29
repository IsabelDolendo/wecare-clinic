import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          res.cookies.set({ name, value: "", ...options, maxAge: 0 });
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const path = req.nextUrl.pathname;
  const role = session?.user?.user_metadata?.role as string | undefined;

  if (path.startsWith("/dashboard")) {
    if (!session) {
      const url = req.nextUrl.clone();
      url.pathname = "/auth/login";
      url.searchParams.set("redirectedFrom", path);
      return NextResponse.redirect(url);
    }
  }

  if (path.startsWith("/auth") && session) {
    const url = req.nextUrl.clone();
    url.pathname = role === "admin" ? "/dashboard/admin" : "/dashboard/patient";
    return NextResponse.redirect(url);
  }

  // Enforce role-specific areas
  if (session) {
    if (path.startsWith("/dashboard/admin") && role !== "admin") {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard/patient";
      return NextResponse.redirect(url);
    }
    if (path.startsWith("/dashboard/patient") && role === "admin") {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard/admin";
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/auth/:path*"],
};
