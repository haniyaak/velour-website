/**
 * VELOUR — AI Concierge backend (optional)
 * ---------------------------------------------------------
 * This tiny server is what makes the chat widget a REAL AI
 * chatbot instead of the scripted fallback. It exists because
 * an API key can never be safely placed in browser JavaScript
 * — anyone could open dev tools and steal it. This server holds
 * the key instead, and the browser only ever talks to THIS
 * server, never to Anthropic directly.
 *
 * Setup:
 *   1. cd server
 *   2. npm install
 *   3. copy .env.example to .env and paste in your own API key
 *      from https://console.anthropic.com
 *   4. npm start
 *   5. Open the website — the chat widget will now use real AI.
 *      (It already points at http://localhost:3000/api/chat in
 *      script.js — change VELOUR_CHAT_API there if you deploy
 *      this server somewhere else.)
 */

const express = require("express");
const cors = require("cors");
require("dotenv").config();
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
app.use(cors());
app.use(express.json());

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

app.post("/api/chat", async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Missing 'message' string." });
    }

    // Keep only the last few turns so requests stay small and fast.
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

    res.json({ reply });
  } catch (err) {
    console.error("Chat error:", err.message);
    res.status(500).json({ error: "Something went wrong talking to the AI." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Velour AI concierge backend running on http://localhost:${PORT}`));
