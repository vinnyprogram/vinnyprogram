import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PROMPT = `You are analyzing a floor plan for an insulation contractor.

Read this drawing carefully and identify every area that needs insulation.
Look for:
- Dimension lines with measurements (numbers followed by ' or ft or " marks)
- Room/space labels
- Construction notes with stud sizes: "2x4", "2x6", "2x8", "2x10", "2x12",
  "I-joist 14in", "I-joist 16in", "I-joist 18in" — also common shorthand like
  "2x10 R/R" (roof rafter), "2x6 EW" (exterior wall), "2x4 typ" etc.
- Floor level indicators in title block or notes: Attic, 1st Floor, 2nd Floor, Basement, Garage

For each insulation area, extract:
1. area_type — must be exactly one of:
   "Roof Rafter w/ Strapping", "Roof Rafter behind knee walls", "Floor",
   "Exterior Wall", "Demising Wall", "Rim Joist", "Concrete Wall",
   "Ceiling", "Interior Walls", "Fire Blocking"
2. thickness_in — stud/rafter size read from the drawing:
   "2x4", "2x6", "2x8", "2x10", "2x12", "I-joist 14in", "I-joist 16in", "I-joist 18in"
   Use empty string "" if not labeled on this drawing.
3. floor — which level: "Floor", "1st", "2nd", "3rd", "Basement", "Crawlspace", "Garage"
4. length — dimension in feet read from dimension lines (a number). null if not shown.
5. width  — dimension in feet read from dimension lines (a number). null if not shown.
6. sqft   — length × width, or the total sqft if directly labeled. null if no dimensions shown.
7. notes  — what you read from the drawing to determine this (e.g. "2x10 label near rafters, dim line 40'-0\" × 28'-0\"")

Rules:
- Only use dimensions actually printed on the drawing — do NOT estimate or guess sqft
- If sqft cannot be determined from printed dimensions, set length/width/sqft to null
- Include ALL distinct insulation areas shown, even if same type appears on multiple parts

Return ONLY a valid JSON array, no explanation, no markdown fences:
[{"area_type":"...","thickness_in":"...","floor":"...","length":null,"width":null,"sqft":null,"notes":"..."}]`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const { imageBase64, mediaType = "image/jpeg" } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY secret not set. Run: supabase secrets set ANTHROPIC_API_KEY=sk-ant-..." }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text",  text: PROMPT },
          ],
        }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify({ error: data?.error?.message || "Anthropic API error" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const raw = (data.content?.[0]?.text || "[]").replace(/```json|```/g, "").trim();
    let areas = [];
    try { areas = JSON.parse(raw); } catch (_) { areas = []; }

    // Fill sqft from length × width when available
    areas = areas.map((a: Record<string, unknown>) => ({
      ...a,
      sqft: a.sqft ?? (a.length && a.width
        ? Math.round((a.length as number) * (a.width as number) * 10) / 10
        : null),
    }));

    return new Response(JSON.stringify({ areas }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
