import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function createNonce() {
  return btoa(crypto.randomUUID()).replace(/=+$/g, "");
}

function supabaseConnectSources(url?: string) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return `${parsed.origin} wss://${parsed.host}`;
  } catch {
    return "";
  }
}

function contentSecurityPolicy(nonce: string, supabaseUrl?: string) {
  const development = process.env.NODE_ENV !== "production";
  const connectSources = supabaseConnectSources(supabaseUrl);

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${development ? " 'unsafe-eval'" : " 'strict-dynamic'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://lp-sitioemanuel.vercel.app",
    "font-src 'self' data:",
    `connect-src 'self' ${connectSources}`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

function applyPrivateSecurityHeaders(response: NextResponse, csp: string) {
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "no-store, private, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  return response;
}

function redirectWithCookies(
  request: NextRequest,
  source: NextResponse,
  pathname: string,
  csp: string,
  searchParams?: Record<string, string>
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  Object.entries(searchParams ?? {}).forEach(([key, value]) => url.searchParams.set(key, value));

  const redirect = NextResponse.redirect(url);
  source.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return applyPrivateSecurityHeaders(redirect, csp);
}

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const pathname = request.nextUrl.pathname;
  const nonce = createNonce();
  const csp = contentSecurityPolicy(nonce, url);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const isLogin = pathname.startsWith("/login");
  const isApi = pathname.startsWith("/api/");
  const isBootstrap = pathname.startsWith("/api/profile/bootstrap");
  const isCron = pathname.startsWith("/api/cron/supabase-keepalive");
  const isProtectedPage = !isLogin && !isApi;

  if (!url || !key) {
    if (isCron || isBootstrap) {
      return applyPrivateSecurityHeaders(
        NextResponse.next({ request: { headers: requestHeaders } }),
        csp
      );
    }

    if (isProtectedPage && process.env.NODE_ENV === "production") {
      return applyPrivateSecurityHeaders(
        new NextResponse("Serviço temporariamente indisponível.", { status: 503 }),
        csp
      );
    }

    return applyPrivateSecurityHeaders(
      NextResponse.next({ request: { headers: requestHeaders } }),
      csp
    );
  }

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user && isProtectedPage) {
    return redirectWithCookies(request, response, "/login", csp);
  }

  if (user && (isProtectedPage || isLogin)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, active, role")
      .eq("id", user.id)
      .eq("active", true)
      .maybeSingle();

    if (isProtectedPage && !profile) {
      return redirectWithCookies(request, response, "/login", csp, {
        error: "unauthorized",
      });
    }

    if (isProtectedPage && pathname.startsWith("/configuracoes") && profile?.role !== "ADMIN") {
      return redirectWithCookies(request, response, "/dashboard", csp, {
        error: "forbidden",
      });
    }

    if (isLogin && profile) {
      return redirectWithCookies(request, response, "/dashboard", csp);
    }
  }

  return applyPrivateSecurityHeaders(response, csp);
}
