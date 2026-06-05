async function geminiAiRecommendations({
  type,
  googleAiKey,
  traktUser = null,
  language = "en-US"
}) {
  if (!googleAiKey) return [];

  const mediaLabel = type === "series" ? "TV series" : "movies";
  const prompt = `
Return ONLY valid JSON.
Recommend 12 ${mediaLabel} for a streaming catalog.
${traktUser ? `If useful, personalise for Trakt user "${traktUser}".` : "Use broadly popular, high-quality choices."}

JSON shape:
{"items":[{"title":"The Matrix","year":1999},{"title":"Breaking Bad","year":2008}]}
No markdown. No explanation.
`;

  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": googleAiKey
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  if (!r.ok) {
    console.error("Gemini AI rows failed:", r.status, await r.text().catch(() => ""));
    return type === "series"
      ? [
          { title: "Breaking Bad", year: 2008 },
          { title: "Game of Thrones", year: 2011 },
          { title: "The Sopranos", year: 1999 },
          { title: "The Wire", year: 2002 },
          { title: "Stranger Things", year: 2016 },
          { title: "The Last of Us", year: 2023 }
        ]
      : [
          { title: "The Matrix", year: 1999 },
          { title: "Inception", year: 2010 },
          { title: "Interstellar", year: 2014 },
          { title: "The Dark Knight", year: 2008 },
          { title: "Mad Max: Fury Road", year: 2015 },
          { title: "Dune", year: 2021 }
        ];
  }

  const data = await r.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("\n") || "";

  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed.items) ? parsed.items.slice(0, 12) : [];
  } catch (e) {
    console.error("Gemini JSON parse failed:", text.slice(0, 300));
    return [];
  }
}

module.exports = {
  geminiAiRecommendations
};
