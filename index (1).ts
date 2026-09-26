import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import bcrypt from "npm:bcryptjs@2.4.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ADMIN_AUTH_EMAIL = "beehomecreators@admin.local";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return new Response(
        JSON.stringify({ error: "Username and password are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Case-insensitive username lookup — username is stored lowercase
    const { data: adminUser, error: dbError } = await adminClient
      .from("admin_users")
      .select("id, username, password_hash")
      .ilike("username", username.trim())
      .maybeSingle();

    if (dbError) {
      return new Response(
        JSON.stringify({ error: "Authentication failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!adminUser) {
      return new Response(
        JSON.stringify({ error: "Invalid username or password" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify bcrypt hash — check the password as-is, plus lowercase and uppercase
    // variations (owner requested case-insensitive password acceptance)
    const passwordVariations = [
      password,
      password.toLowerCase(),
      password.toUpperCase(),
    ];

    let passwordValid = false;
    for (const variant of passwordVariations) {
      if (bcrypt.compareSync(variant, adminUser.password_hash)) {
        passwordValid = true;
        break;
      }
    }

    if (!passwordValid) {
      return new Response(
        JSON.stringify({ error: "Invalid username or password" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Credentials verified. Now establish a Supabase session ---

    // Find or create the dedicated admin auth user
    const { data: userList, error: listError } = await adminClient.auth.admin.listUsers();

    let adminAuthId: string | null = null;

    if (!listError && userList) {
      const found = userList.users.find(
        (u: { email: string; id: string }) => u.email === ADMIN_AUTH_EMAIL
      );
      if (found) adminAuthId = found.id;
    }

    // Generate a fresh one-time random password for this login session
    const oneTimePassword = crypto.randomUUID() + crypto.randomUUID();

    if (adminAuthId) {
      // Update existing user with the one-time password
      const { error: updateError } = await adminClient.auth.admin.updateUserById(
        adminAuthId,
        { password: oneTimePassword, email_confirm: true }
      );
      if (updateError) {
        return new Response(
          JSON.stringify({ error: "Failed to establish admin session" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Create the admin auth user
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: ADMIN_AUTH_EMAIL,
        password: oneTimePassword,
        email_confirm: true,
      });
      if (createError || !newUser) {
        return new Response(
          JSON.stringify({ error: "Failed to establish admin session" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Return the one-time credentials so the frontend can establish a real session
    // via signInWithPassword. The actual admin password is never sent to the client.
    return new Response(
      JSON.stringify({
        success: true,
        email: ADMIN_AUTH_EMAIL,
        oneTimePassword,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch {
    return new Response(
      JSON.stringify({ error: "Authentication failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});