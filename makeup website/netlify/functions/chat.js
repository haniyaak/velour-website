/**
 * VELOUR — AI Concierge (Netlify Function version)
 * This replaces the old server/server.js — same idea, but runs as
 * a serverless function on Netlify instead of a separate server.
 * Netlify auto-deploys this whenever you push a change to GitHub.
 */

const Anthropic = require("@anthropic-ai/sdk");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are the Velour Beauty Advisor — the concierge chatbot for Velour,
an elite makeup studio and product line with a red-wine-and-gold, elegant aesthetic.
You help visitors with:
- product questions (Velour sells Lips, Face, Eyes, and Skin categories)
- booking appointments (services include Signature Face $85, Bridal Trial $150,
  Bridal Day-Of $300, Editorial $180, Evening Out $95, Makeup Lesson $120)
- studio info (open Tue–Sun, 10am–7pm, 14 Rue Bordeaux, Design District)
Keep replies short (2-4 sentences), warm, and refined. If you don't know something
specific (like real-time stock or exact order status), say so honestly and suggest
the visitor contact the studio directly or check their account page.`;

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { message, history = [] } = JSON.parse(event.body || "{}");
    if (!message || typeof message !== "string") {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing 'message' string." }) };
    }

    const trimmedHistory = history.slice(-10).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [...trimmedHistory, { role: "user", content: message }],
    });

    const reply = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply }),
    };
  } catch (err) {
    console.error("Chat error:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: "Something went wrong talking to the AI." }) };
  }
};
