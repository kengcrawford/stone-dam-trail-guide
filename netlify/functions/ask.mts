import type { Config, Context } from "@netlify/functions";
import { GUIDE } from "../lib/guide.mjs";

// "Ask the Creek Guide": answers visitor questions using only the tour's own content.
// Needs ANTHROPIC_API_KEY set in Netlify environment variables (scope: Functions).

const MODEL = "claude-haiku-5-5";
const MAX_TURNS = 8;          // messages kept from the conversation
const MAX_CHARS = 600;        // per visitor message
const MAX_CONTEXT_CHARS = 120;

const SYSTEM = `You are the Creek Guide, a friendly voice inside the Stone Dam Trail Guide, a self-guided tour of Allen Station Park in Allen, Texas. This is a demo prototype by Ken G. Crawford Consulting, not an official City of Allen service.

How to answer:
- Use the GUIDE CONTENT below as your main source. You may add widely accepted natural-history facts about North Texas plants and animals, but never invent local facts (dates, distances, amenities, events, hours, rules).
- If the guide doesn't cover something, say so plainly and suggest checking with Allen Parks and Recreation. Do not guess.
- Keep answers short: 2 to 4 sentences, plain words, no markdown, no lists unless asked. Many visitors hear answers read aloud, so write for the ear.
- When a visitor asks about access (wheelchairs, walkers, strollers, benches, restrooms, slopes, surfaces), answer from the access details and say that the measurements are sample values still being checked on site.
- Suggest a stop number when it helps, for example "That's at Stop 4."
- Invite noticing: when it fits, end with one small thing to look, listen or feel for.

Safety rules (always follow):
- Emergencies, injuries, someone lost, a snake bite or allergic reaction: tell them to call 911 first, then park staff. Keep it to that.
- Never say a plant, mushroom, berry, nut or animal is safe to eat, touch, handle or pick up. Say to leave it be.
- No medical, legal or swimming advice. Do not encourage entering the creek or climbing on the dam.
- Don't ask for or repeat personal information. If someone shares it, don't use it.
- Stay on the park, its nature, history and the visit. For unrelated requests, kindly steer back to the walk.
- Be suitable for children.

GUIDE CONTENT
${GUIDE}`;

type Msg = { role: "user" | "assistant"; content: string };

function clean(s: unknown, max: number): string {
  return String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return Response.json({ error: "Use POST." }, { status: 405 });

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return Response.json(
      { error: "The Creek Guide isn't switched on yet. The site owner needs to add an API key." },
      { status: 503 },
    );
  }

  let body: any;
  try { body = await req.json(); } catch { return Response.json({ error: "That message couldn't be read." }, { status: 400 }); }

  const raw: any[] = Array.isArray(body?.messages) ? body.messages.slice(-MAX_TURNS) : [];
  const messages: Msg[] = raw
    .filter(m => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string")
    .map(m => ({ role: m.role, content: clean(m.content, MAX_CHARS) }))
    .filter(m => m.content.length > 0);
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return Response.json({ error: "Please type a question." }, { status: 400 });
  }

  const about = clean(body?.context, MAX_CONTEXT_CHARS);
  const easy = body?.easyRead === true;
  let system = SYSTEM;
  if (about) system += `\n\nThe visitor is currently looking at: ${about}. Assume short questions refer to it.`;
  if (easy) system += `\n\nThis visitor turned on easy-read. Use very short sentences and simple, everyday words.`;
  const LANGUAGES = ["Spanish", "Simplified Chinese", "Vietnamese"];
  const language = LANGUAGES.includes(body?.language) ? body.language : "";
  if (language) system += `\n\nThis visitor is using the guide in ${language}. Always reply in ${language}, even if they write in English. Keep place names (Allen Station Park, Cottonwood Creek, Old Stone Dam) recognizable, adding the English name in parentheses the first time if it helps.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, system, messages }),
    });
    if (!res.ok) {
      console.error("Anthropic API error", res.status, (await res.text()).slice(0, 500));
      const busy = res.status === 429 || res.status === 529;
      return Response.json(
        { error: busy ? "The Creek Guide is busy. Please try again in a minute." : "The Creek Guide couldn't answer just now. Please try again." },
        { status: 502 },
      );
    }
    const data: any = await res.json();
    const answer = (data?.content ?? [])
      .filter((b: any) => b?.type === "text")
      .map((b: any) => b.text)
      .join("\n")
      .trim();
    return Response.json({ answer: answer || "I'm not sure about that one. Try asking a different way." });
  } catch (err) {
    console.error("Ask function failed", err);
    return Response.json({ error: "The Creek Guide couldn't answer just now. Please try again." }, { status: 502 });
  }
};

export const config: Config = {
  path: "/api/ask",
  method: "POST",
  rateLimit: { action: "rate_limit", aggregateBy: ["ip", "domain"], windowSize: 60, windowLimit: 12 },
};
