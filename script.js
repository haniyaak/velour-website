/* =========================================================
   VELOUR — shared behavior
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  /* Mobile nav toggle */
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector("nav.links");
  if (toggle && links) {
    toggle.addEventListener("click", () => links.classList.toggle("open"));
    links.querySelectorAll("a").forEach(a =>
      a.addEventListener("click", () => links.classList.remove("open"))
    );
  }

  /* Scroll reveals + pour dividers */
  const observed = document.querySelectorAll(".reveal, .pour");
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );
  observed.forEach((el) => io.observe(el));

  /* Note: product category/search/price/shade filtering for the
     Shop page now lives in ui.js (initProductGrid), since it needs
     to re-render cards from data.js rather than just hide/show. */

  /* Appointment form (appointment.html) */
  const bookingForm = document.getElementById("booking-form");
  if (bookingForm) {
    bookingForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("bk-name").value.trim() || "there";
      const service = document.getElementById("bk-service");
      const serviceLabel = service.options[service.selectedIndex]?.text || "your service";
      const date = document.getElementById("bk-date").value;
      const time = document.getElementById("bk-time").value;

      if (typeof DB !== "undefined") {
        const apptRecord = {
          name,
          service: serviceLabel,
          date,
          time,
          email: document.getElementById("bk-email")?.value.trim() || "",
          phone: document.getElementById("bk-phone")?.value.trim() || "",
          notes: document.getElementById("bk-notes")?.value.trim() || "",
        };
        await DB.addAppointment(apptRecord);

        // Send the confirmation + studio notification email directly —
        // simpler and more reliable than relying on a Supabase Database Webhook.
        fetch("/.netlify/functions/appointment-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ record: apptRecord }),
        }).catch(() => {}); // email is a nice-to-have; never block the booking on it
      }

      const box = document.getElementById("confirm-box");
      box.innerHTML = `<strong style="color:var(--gold-300)">Request received, ${escapeHtml(name)}.</strong><br>
        We've noted your request for <em>${escapeHtml(serviceLabel)}</em>${date ? " on " + escapeHtml(date) : ""}${time ? " at " + escapeHtml(time) : ""}.
        A Velour concierge will confirm by phone or email within 24 hours.`;
      box.classList.add("show");
      bookingForm.reset();
      box.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  initChat();
});

/* =========================================================
   Concierge Chat Widget
   Tries a real AI backend first (see /server example — you run
   this yourself with your own Anthropic API key). If that
   endpoint isn't reachable, it falls back to the scripted
   concierge replies in replyFor() below, so the widget always
   works even without a backend running.
   ========================================================= */
const VELOUR_CHAT_API = "/.netlify/functions/chat"; // served by your own Netlify site — no separate backend needed

async function askAI(message, history) {
  const res = await fetch(VELOUR_CHAT_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });
  if (!res.ok) throw new Error("Chat backend error");
  const data = await res.json();
  return data.reply;
}

function initChat() {
  const launcher = document.getElementById("velour-chat-launcher");
  const panel = document.getElementById("velour-chat-panel");
  const closeBtn = document.getElementById("chat-close");
  const body = document.getElementById("chat-body");
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  const chips = document.querySelectorAll(".chat-chip");

  if (!launcher || !panel) return;

  let opened = false;
  launcher.addEventListener("click", () => {
    opened = !opened;
    panel.classList.toggle("open", opened);
    if (opened && body.dataset.greeted !== "true") {
      body.dataset.greeted = "true";
      addMsg("bot", "Welcome to Velour. I'm your virtual concierge — ask me about products, appointments, or hours.");
    }
  });
  closeBtn?.addEventListener("click", () => {
    opened = false;
    panel.classList.remove("open");
  });

  chips.forEach((chip) => {
    chip.addEventListener("click", () => sendMessage(chip.dataset.prompt));
  });

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    sendMessage(text);
    input.value = "";
  });

  const history = [];

  function sendMessage(text) {
    addMsg("user", text);
    history.push({ role: "user", content: text });
    const typing = addMsg("bot", "…");

    askAI(text, history)
      .then((reply) => {
        typing.textContent = reply;
        history.push({ role: "assistant", content: reply });
        body.scrollTop = body.scrollHeight;
      })
      .catch(() => {
        // No AI backend running (or it errored) — use the scripted concierge.
        setTimeout(() => {
          const reply = replyFor(text);
          typing.textContent = reply;
          history.push({ role: "assistant", content: reply });
          body.scrollTop = body.scrollHeight;
        }, 450);
      });
  }

  function addMsg(role, text) {
    const el = document.createElement("div");
    el.className = `chat-msg ${role}`;
    el.textContent = text;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    return el;
  }

  function replyFor(raw) {
    const t = raw.toLowerCase();
    if (t.includes("appointment") || t.includes("book") || t.includes("schedule")) {
      return "You can reserve a session on our Book an Appointment page — choose your service, preferred date and time, and our concierge will confirm within 24 hours.";
    }
    if (t.includes("price") || t.includes("cost") || t.includes("how much")) {
      return "Our pricing varies by service and product line — you'll find prices listed on each item in the Shop, and full service pricing on the appointment page.";
    }
    if (t.includes("hour") || t.includes("open") || t.includes("time")) {
      return "The Velour studio is open Tuesday–Sunday, 10am–7pm. Closed Mondays for restocking and inventory.";
    }
    if (t.includes("location") || t.includes("where") || t.includes("address")) {
      return "We're located in the design district — the full address and directions are on our Contact section in the footer.";
    }
    if (t.includes("product") || t.includes("lip") || t.includes("foundation") || t.includes("shop")) {
      return "Our collection spans Lips, Face, Eyes, and Skin — all in the Velour signature wine-and-gold packaging. Browse the full range on the Shop page.";
    }
    if (t.includes("thank")) {
      return "It's our pleasure. Anything else I can help you with?";
    }
    return "Thank you for reaching out — for anything beyond what I can answer here, our team would love to assist directly. Would you like help finding a product or booking an appointment?";
  }
}
