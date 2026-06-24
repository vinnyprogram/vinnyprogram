/**
 * Vercel serverless function — /api/analyze-drawing
 *
 * Receives a base64 PNG of a floor plan page and asks Claude to read:
 *   - Area types (roof rafter, exterior wall, floor, etc.)
 *   - Stud / rafter sizes (2x4, 2x6, 2x8, 2x10, 2x12, I-joist)
 *   - Dimensions printed on the drawing (length × width in feet)
 *   - Which floor level each area belongs to
 *
 * Returns a JSON array of detected areas ready to import into the estimate.
 *
 * Requires ANTHROPIC_API_KEY in Vercel environment variables.
 */

export default async function handler(req, res) {
  // CORS headers so the browser can call this from any origin
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  const { imageBase64, mediaType = "image/png" } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: "No image provided" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured on Vercel" });

  const prompt = `You are analyzing a floor plan for an insulation contractor.

Read this drawing carefully and identify every area that needs insulation.
Look for:
- Dimension lines with measurements (numbers followed by ' or ft or ")
- Room/area labels (Attic, Roof, Bedroom, Living Room, Garage, Basement, etc.)
- Construction notes indicating stud sizes: "2x4", "2x6", "2x8", "2x10", "2x12", 
  "I-joist 14\"", "I-joist 16\"", "I-joist 18\"" or shorthand like "2x10 RR" (roof rafter), 
  "2x6 EW" (exterior wall), "2x4 typ" etc.
- Floor level indicators: Attic, 3rd Floor, 2nd Floor, 1st Floor, Basement, Crawlspace, Garage

For each insulation area found, determine:
1. area_type — must be one of exactly:
   "Roof Rafter w/ Strapping", "Roof Rafter behind knee walls", "Floor",
   "Exterior Wall", "Demising Wall", "Rim Joist", "Concrete Wall",
   "Ceiling", "Interior Walls", "Fire Blocking"
2. thickness_in — the stud/rafter size: "2x4", "2x6", "2x8", "2x10", "2x12",
   "I-joist 14in", "I-joist 16in", "I-joist 18in" — read from drawing notes/labels
3. floor — which level: "Floor", "1st", "2nd", "3rd", "Basement", "Crawlspace", "Garage"
4. length — dimension in feet (a number, e.g. 42.5) — read from dimension lines
5. width — dimension in feet — read from dimension lines
6. sqft — calculated area = length × width (or read directly if labeled as sqft)
   Set to null if no dimensions are shown for this area
7. notes — any relevant info from the drawing (e.g. "labeled 2x10 @ 16\" o.c.", "dimension line shows 40'-0\" x 28'-0\"")

Important rules:
- If dimensions are NOT shown, set length, width, and sqft to null
- Do NOT guess or estimate sqft — only use numbers actually printed on the drawing
- A roof rafter area sqft = the ceiling/floor projection area (not the sloped surface)
- Exterior walls: estimate perimeter × wall height if those dimensions are shown
- Include ALL distinct insulation areas, even if they share the same area_type

Return ONLY a valid JSON array, no explanation, no markdown, no code blocks:
[{"area_type":"...","thickness_in":"...","floor":"...","length":number_or_null,"width":number_or_null,"sqft":number_or_null,"notes":"..."}]`;

  try {
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
            { type: "text",  text: prompt },
          ],
        }],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(500).json({ error: data?.error?.message || "Anthropic API error", raw: data });
    }

    const text = (data.content?.[0]?.text || "[]").replace(/```json|```/g, "").trim();
    let areas = [];
    try { areas = JSON.parse(text); } catch(e) { areas = []; }

    // Ensure sqft is calculated when length+width are present
    areas = areas.map(a => ({
      ...a,
      sqft: a.sqft ?? (a.length && a.width ? Math.round(a.length * a.width * 10) / 10 : null),
    }));

    return res.status(200).json({ areas });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
