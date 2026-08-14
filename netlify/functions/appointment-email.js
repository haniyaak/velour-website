/**
 * VELOUR — Appointment Email Notifier
 * This is called automatically by a Supabase Database Webhook the moment
 * a new row is inserted into the "appointments" table — not called
 * directly by the website. See the setup guide for how to connect it.
 */
async function sendEmail(to, subject, html) {
  if (!process.env.RESEND_API_KEY) return;
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
}

exports.handler = async function (event) {
  try {
    const payload = JSON.parse(event.body || "{}");
    const appt = payload.record;
    if (!appt) return { statusCode: 400, body: "No appointment record in payload" };

    if (appt.email) {
      await sendEmail(
        appt.email,
        "Your Velour appointment request",
        `<div style="font-family:serif;background:#2B0512;color:#F5EBDD;padding:32px">
          <h2 style="color:#D4AF6A">Request received, ${appt.name}</h2>
          <p>We've noted your request for <strong>${appt.service || "a sitting"}</strong>${appt.date ? ` on ${appt.date}` : ""}${appt.time ? ` at ${appt.time}` : ""}.</p>
          <p>A Velour concierge will confirm by phone or email within 24 hours.</p>
          <p style="color:#D4AF6A">— The Velour Studio</p>
        </div>`
      );
    }

    if (process.env.STUDIO_NOTIFY_EMAIL) {
      await sendEmail(
        process.env.STUDIO_NOTIFY_EMAIL,
        `New appointment request: ${appt.name}`,
        `<p><strong>${appt.name}</strong> requested <strong>${appt.service}</strong>${appt.date ? ` on ${appt.date}` : ""}${appt.time ? ` at ${appt.time}` : ""}.</p>
         <p>Contact: ${appt.email || "—"} / ${appt.phone || "—"}</p>
         <p>Notes: ${appt.notes || "—"}</p>`
      );
    }

    return { statusCode: 200, body: JSON.stringify({ sent: true }) };
  } catch (err) {
    console.error("Appointment email failed:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
