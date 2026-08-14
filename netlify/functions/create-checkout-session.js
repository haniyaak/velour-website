/**
 * VELOUR — Create Stripe Checkout Session
 * Called from checkout.html when the customer clicks "Proceed to Payment."
 * Re-fetches real prices from Supabase (never trusts prices sent by the
 * browser) then hands off to Stripe's own hosted, secure payment page.
 */
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const sbPublic = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { items, customerEmail, userId } = JSON.parse(event.body || "{}");
    if (!items || !items.length || !userId) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing cart items or user." }) };
    }

    // Look up REAL prices from the database — never trust prices from the browser.
    const ids = items.map((i) => i.productId);
    const { data: products, error } = await sbPublic.from("products").select("*").in("id", ids);
    if (error) throw error;

    const line_items = items.map((item) => {
      const p = products.find((p) => p.id === item.productId);
      if (!p) throw new Error(`Unknown product: ${item.productId}`);
      return {
        quantity: item.qty,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(Number(p.price) * 100), // Stripe uses cents
          product_data: {
            name: p.name + (item.shade ? ` — ${item.shade}` : ""),
            metadata: { productId: p.id, shade: item.shade || "" },
          },
        },
      };
    });

    const origin = event.headers.origin || process.env.SITE_URL || "https://velourcosmetic.netlify.app";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      client_reference_id: userId,
      customer_email: customerEmail || undefined,
      shipping_address_collection: { allowed_countries: ["US", "CA", "GB", "AU"] },
      success_url: `${origin}/checkout.html?success=true`,
      cancel_url: `${origin}/cart.html`,
    });

    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    console.error("Stripe session error:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
