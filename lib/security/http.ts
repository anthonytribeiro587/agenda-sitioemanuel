import "server-only";
import { NextResponse } from "next/server";

const SAFE_FETCH_SITES = new Set(["same-origin", "same-site", "none"]);

export function isSameOriginRequest(request: Request) {
  const expectedOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  if (!origin || origin !== expectedOrigin) return false;
  if (fetchSite && !SAFE_FETCH_SITES.has(fetchSite)) return false;
  return true;
}

export function noStoreJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, private, max-age=0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export function normalizeEmail(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function allowedBootstrapEmails() {
  return new Set(
    (process.env.ADMIN_BOOTSTRAP_EMAILS ?? "")
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean)
  );
}
