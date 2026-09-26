import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Hub-Signature-256",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;

  // 1. GET: Webhook Verification Challenge from Meta
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token && challenge) {
      // Strictly require WHATSAPP_VERIFY_TOKEN environment secret with no hardcoded fallback
      const expectedToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN")?.trim();

      if (!expectedToken) {
        console.error("WHATSAPP_VERIFY_TOKEN environment secret is not configured on the server.");
        return new Response("Internal Server Error: Missing verification secret", { status: 500 });
      }

      if (token === expectedToken) {
        console.log("WhatsApp webhook verified successfully by Meta challenge.");
        return new Response(challenge, {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        });
      } else {
        console.warn("WhatsApp webhook verification token mismatch.");
        return new Response("Forbidden: Invalid verification token", { status: 403 });
      }
    }

    return new Response(
      "Bad Request: Missing hub.mode, hub.verify_token, or hub.challenge",
      { status: 400 }
    );
  }

  // 2. POST: Event Notifications from Meta WhatsApp Cloud API
  if (req.method === "POST") {
    try {
      const body = await req.json();

      if (body.object !== "whatsapp_business_account") {
        return new Response("Not Found", { status: 404 });
      }

      const supabase = createClient(supabaseUrl, serviceRoleKey);
      const entries = body.entry || [];

      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          const value = change.value;
          if (!value) continue;

          // 2.1 Process status updates: sent, delivered, read, failed
          if (Array.isArray(value.statuses)) {
            for (const statusObj of value.statuses) {
              const messageId = statusObj.id;
              const status = statusObj.status; // 'sent' | 'delivered' | 'read' | 'failed'
              const timestampSeconds = parseInt(statusObj.timestamp, 10);
              const eventDate = !isNaN(timestampSeconds)
                ? new Date(timestampSeconds * 1000).toISOString()
                : new Date().toISOString();
              const recipientPhone = statusObj.recipient_id;

              let errorMessage: string | null = null;
              if (
                status === "failed" &&
                Array.isArray(statusObj.errors) &&
                statusObj.errors.length > 0
              ) {
                const err = statusObj.errors[0];
                errorMessage =
                  err.error_data?.details ||
                  err.message ||
                  err.title ||
                  `Error code ${err.code}`;
              }

              const updatePayload: Record<string, unknown> = {
                status,
                whatsapp_message_id: messageId,
              };

              if (status === "sent") updatePayload.sent_at = eventDate;
              if (status === "delivered") updatePayload.delivered_at = eventDate;
              if (status === "read") updatePayload.read_at = eventDate;
              if (errorMessage) updatePayload.error_message = errorMessage;

              const { data: matchedById } = await supabase
                .from("campaign_recipients")
                .select("id, status")
                .eq("whatsapp_message_id", messageId)
                .maybeSingle();

              if (matchedById) {
                await supabase
                  .from("campaign_recipients")
                  .update(updatePayload)
                  .eq("id", matchedById.id);
              } else if (recipientPhone) {
                const cleanedPhone = recipientPhone.replace(/\D/g, "");
                const { data: matchedByPhone } = await supabase
                  .from("campaign_recipients")
                  .select("id, status")
                  .or(
                    `whatsapp_number.ilike.%${cleanedPhone}%,whatsapp_number.eq.+${cleanedPhone}`
                  )
                  .order("created_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();

                if (matchedByPhone) {
                  await supabase
                    .from("campaign_recipients")
                    .update(updatePayload)
                    .eq("id", matchedByPhone.id);
                }
              }
            }
          }

          // 2.2 Process incoming customer replies
          if (Array.isArray(value.messages)) {
            for (const msg of value.messages) {
              const sender = msg.from;
              let content = "";
              if (msg.type === "text" && msg.text?.body) {
                content = msg.text.body;
              } else if (msg.type) {
                content = `[${msg.type.toUpperCase()}]`;
              }

              const { data: owner } = await supabase
                .from("whatsapp_settings")
                .select("user_id")
                .limit(1)
                .maybeSingle();

              if (owner?.user_id) {
                await supabase.from("activities").insert({
                  user_id: owner.user_id,
                  type: "message_attempted",
                  description: `WhatsApp reply received from +${sender}: "${content.slice(
                    0,
                    80
                  )}"`,
                });
              }
            }
          }
        }
      }

      return new Response(JSON.stringify({ status: "EVENT_RECEIVED" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: unknown) {
      console.error("Webhook processing error:", err);
      return new Response(JSON.stringify({ status: "ERROR_RECORDED" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
});
