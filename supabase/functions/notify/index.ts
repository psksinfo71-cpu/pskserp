import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGINS = ["https://psks-erp.vercel.app", "http://localhost:3000"];

function getCorsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  };
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

interface NotifyBody {
  title: string;
  message: string;
  type?: string;
  link?: string;
  // who to notify: either specific user ids, or "approvers" to fan out
  user_ids?: string[];
  to?: "approvers" | "specific";
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: anonKey },
    });
    if (!callerRes.ok) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const caller = await callerRes.json();
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${caller.id}&select=role,is_active`,
      { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } }
    );
    const profiles = await profileRes.json();
    const callerProfile = profiles?.[0];
    if (!callerProfile?.is_active || !["super_admin", "finance_manager", "head_of_finance", "accounts_manager"].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: "Insufficient permissions to send notifications" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: NotifyBody = await req.json();
    if (!body.title || !body.message) {
      return new Response(JSON.stringify({ error: "title and message are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sanitizeLink = (link: string): string => {
      if (!link) return "";
      if (/^https?:\/\//.test(link) && !link.includes(new URL(supabaseUrl).hostname)) return "";
      if (link.startsWith("javascript:")) return "";
      return link.replace(/[<>"']/g, "");
    };

    let userIds: string[] = [];

    if (body.to === "approvers") {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/profiles?select=id&role=in.(super_admin,finance_manager,head_of_finance,accounts_manager)&is_active=eq.true`,
        { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } }
      );
      const rows = await res.json();
      userIds = (rows as { id: string }[]).map((r) => r.id);
    } else if (body.user_ids && body.user_ids.length > 0) {
      userIds = body.user_ids.slice(0, 50);
    } else {
      return new Response(JSON.stringify({ error: "Provide to=approvers or user_ids" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows = userIds.map((uid) => ({
      user_id: uid,
      title: body.title.slice(0, 200),
      message: body.message.slice(0, 1000),
      type: body.type ?? "system",
      link: sanitizeLink(body.link ?? ""),
    }));

    const insertRes = await fetch(`${supabaseUrl}/rest/v1/notifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify(rows),
    });

    if (!insertRes.ok) {
      const err = await insertRes.json();
      return new Response(JSON.stringify({ error: err.message || "Insert failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ sent: userIds.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
