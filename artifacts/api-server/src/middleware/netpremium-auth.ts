import type { Request, Response, NextFunction } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = (process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"] || "")
  .replace(/['"]/g, "")
  .trim();
const supabaseServiceKey = (process.env["SUPABASE_SERVICE_ROLE_KEY"] || "")
  .replace(/['"]/g, "")
  .trim();

let supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  if (!supabase) supabase = createClient(supabaseUrl, supabaseServiceKey);
  return supabase;
}

const adminEmailsRaw = (process.env["NETPREMIUM_ADMIN_EMAILS"] || "").trim();
const adminEmails = new Set(
  adminEmailsRaw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

function extractBearerToken(req: Request): string | null {
  const auth = req.header("authorization") || req.header("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m && m[1] ? m[1].trim() : null;
}

export interface AuthedRequest extends Request {
  netpremiumUser?: {
    id: string;
    email?: string;
    isAdmin: boolean;
    raw: any;
  };
}

export async function requireUser(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const sb = getSupabase();
  if (!sb) {
    res.status(503).json({ error: "Auth backend not configured" });
    return;
  }
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }
  try {
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data?.user) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    const email = (data.user.email || "").toLowerCase();
    const metaRole =
      (data.user.user_metadata as any)?.role || (data.user.app_metadata as any)?.role;
    const metaIsAdmin =
      (data.user.user_metadata as any)?.is_admin === true ||
      (data.user.app_metadata as any)?.is_admin === true;
    const isAdmin =
      metaRole === "admin" || metaIsAdmin === true || (!!email && adminEmails.has(email));
    req.netpremiumUser = {
      id: data.user.id,
      email: data.user.email ?? undefined,
      isAdmin,
      raw: data.user,
    };
    next();
  } catch (err: any) {
    res.status(401).json({ error: err?.message || "Auth check failed" });
  }
}

export async function requireAdmin(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await requireUser(req, res, () => {
    if (!req.netpremiumUser) {
      // requireUser already responded
      return;
    }
    if (!req.netpremiumUser.isAdmin) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  });
}
