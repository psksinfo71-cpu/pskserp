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

interface BaseBody {
  action?: "create" | "update" | "delete";
}

interface CreateUserBody extends BaseBody {
  action?: "create";
  email: string;
  password: string;
  full_name: string;
  role: string;
  roles?: string[];
  branch_id?: string | null;
  department_id?: string | null;
  project_id?: string | null;
  phone?: string;
  designation?: string | null;
}

interface UpdateUserBody extends BaseBody {
  action: "update";
  user_id: string;
  email?: string;
  full_name?: string;
  password?: string;
}

interface DeleteUserBody extends BaseBody {
  action: "delete";
  user_id: string;
}

type RequestBody = CreateUserBody | UpdateUserBody | DeleteUserBody;

async function verifySuperAdmin(authHeader: string): Promise<{ ok: boolean; callerId?: string }> {
  const callerRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: anonKey },
  });
  if (!callerRes.ok) return { ok: false };
  const caller = await callerRes.json();

  const profileRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${caller.id}&select=role`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  const profiles = await profileRes.json();
  if (profiles?.[0]?.role !== "super_admin") return { ok: false };
  return { ok: true, callerId: caller.id };
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

    const verified = await verifySuperAdmin(authHeader);
    if (!verified.ok) {
      return new Response(JSON.stringify({ error: "Only super admins can manage users" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: RequestBody = await req.json();
    const action = body.action ?? "create";

    // ---------- CREATE ----------
    if (action === "create") {
      const { email, password, full_name, role, roles, branch_id, department_id, project_id, phone, designation } = body as CreateUserBody;
      const assignedRoles = [...new Set((roles?.length ? roles : [role]).filter(Boolean))];
      const primaryRole = assignedRoles[0];

      if (!email || !password || !full_name || !primaryRole) {
        return new Response(JSON.stringify({ error: "email, password, full_name and role are required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (password.length < 8) {
        return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return new Response(JSON.stringify({ error: "Invalid email format" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const ALLOWED_ROLES = ["super_admin", "executive_director", "deputy_executive_director", "head_of_finance", "finance_manager", "accounts_manager", "accountant", "project_manager", "project_staff", "branch_manager", "auditor"];
      if (!ALLOWED_ROLES.includes(primaryRole)) {
        return new Response(JSON.stringify({ error: "Invalid role" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          email_confirm: true,
          user_metadata: { full_name },
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        return new Response(JSON.stringify({ error: err.msg || err.message || "Failed to create user" }), {
          status: createRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const newUser = await createRes.json();

      const profileInsertRes = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          id: newUser.id,
          email: email.trim().toLowerCase(),
          full_name,
          role: primaryRole,
          branch_id: branch_id || null,
          department_id: department_id || null,
          project_id: project_id || null,
          phone: phone || "",
          designation: designation || null,
          is_active: true,
        }),
      });

      if (!profileInsertRes.ok) {
        const err = await profileInsertRes.json();
        return new Response(JSON.stringify({ error: err.message || "Profile creation failed" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (assignedRoles.length > 0) {
        const rolesRes = await fetch(`${supabaseUrl}/rest/v1/user_roles`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
          body: JSON.stringify(assignedRoles.map((assignedRole) => ({ user_id: newUser.id, role: assignedRole }))),
        });
        if (!rolesRes.ok) return new Response(JSON.stringify({ error: "Role assignment failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ id: newUser.id, email }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- UPDATE ----------
    if (action === "update") {
      const { user_id, email, full_name, password } = body as UpdateUserBody;

      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Prevent a super_admin from deleting/locking themselves inadvertently is handled client-side;
      // here we just apply the update.
      const updatePayload: Record<string, string | object> = {};
      if (email) updatePayload.email = email.trim().toLowerCase();
      if (full_name) updatePayload.user_metadata = { full_name };
      if (password) {
        if (password.length < 8) {
          return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        updatePayload.password = password;
      }

      if (Object.keys(updatePayload).length > 0) {
        const updateRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user_id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify(updatePayload),
        });

        if (!updateRes.ok) {
          const err = await updateRes.json();
          return new Response(JSON.stringify({ error: err.msg || err.message || "Failed to update auth user" }), {
            status: updateRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- DELETE ----------
    if (action === "delete") {
      const { user_id } = body as DeleteUserBody;

      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Guard: never allow self-deletion
      if (verified.callerId === user_id) {
        return new Response(JSON.stringify({ error: "You cannot delete your own account" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const deleteRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user_id}`, {
        method: "DELETE",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      });

      if (!deleteRes.ok && deleteRes.status !== 404) {
        return new Response(JSON.stringify({ error: "Failed to delete user" }), {
          status: deleteRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // profiles row is auto-removed via CASCADE FK, but clean up just in case
      await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user_id}`, {
        method: "DELETE",
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      });

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
