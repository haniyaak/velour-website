/**
 * VELOUR — Stripe Webhook
 * Stripe calls this automatically the moment a real payment succeeds.
 * This is the ONLY place an order actually gets written to the database —
 * never trust the browser to tell you a payment happened.
 */
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Service role key = full admin access, bypasses RLS. Only ever used here,
// in a trusted server-side function — NEVER put this key in browser code.
const sbAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function sendEmail(to, subject, html) {
  if (!process.env.RESEND_API_KEY) return; // email is optional; don't crash the order if unset
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "Velour <onboarding@resend.dev>",
        to,
        subject,
        html,
      }),
    });
  } catch (err) {
    console.error("Email send failed:", err.message);
  }
}

exports.handler = async function (event) {
  const sig = event.headers["stripe-signature"];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type === "checkout.session.completed") {
    const session = stripeEvent.data.object;
    const userId = session.client_reference_id;
    const email = session.customer_details?.email;
    const total = session.amount_total / 100;

    try {
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
        expand: ["data.price.product"],
      });
      const items = lineItems.data.map((li) => ({
        productId: li.price.product.metadata?.productId || null,
        shade: li.price.product.metadata?.shade || null,
        name: li.description,
        qty: li.quantity,
      }));

      const orderId = "VLR-" + Date.now().toString().slice(-6);
      await sbAdmin.from("orders").insert({
        id: orderId,
        user_id: userId,
        shipping: session.shipping_details || null,
        items,
        total,
        status: "Confirmed",
      });

      if (userId) {
        await sbAdmin.from("cart_items").delete().eq("user_id", userId);
      }

      if (email) {
        await sendEmail(
          email,
          `Your Velour order ${orderId} is confirmed`,
          `<div style="font-family:serif;background:#2B0512;color:#F5EBDD;padding:32px">
            <h2 style="color:#D4AF6A">Order ${orderId} confirmed</h2>
            <p>Thank you for your order — here's what you got:</p>
            <ul>${items.map((i) => `<li>${i.qty} × ${i.name}</li>`).join("")}</ul>
            <p><strong>Total: $${total.toFixed(2)}</strong></p>
            <p style="color:#D4AF6A">— The Velour Studio</p>
          </div>`
        );
      }
    } catch (err) {
      console.error("Order creation failed:", err.message);
      return { statusCode: 500, body: "Order processing failed" };
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
