export default async function handler(req, res) {
  // --- Origin check: restrict to allowed domains ---
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : null;

  const origin = req.headers.origin || req.headers.referer || '';

  if (allowedOrigins) {
    const isAllowed = allowedOrigins.some(allowed => origin.startsWith(allowed));
    if (!isAllowed) {
      return res.status(403).json({ error: "Forbidden" });
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  try {
    const githubApiUrl = process.env.GITHUB_CSV_URL
      || "https://api.github.com/repos/cheneri6/anki-database/contents/AnKing_Step_Deck.csv?ref=main";
    const token = process.env.GITHUB_TOKEN;

    if (!token) {
      return res.status(500).json({ error: "Server configuration error." });
    }

    const response = await fetch(githubApiUrl, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github.raw"
      }
    });

    if (!response.ok) {
      return res.status(502).json({ error: "Failed to fetch upstream data." });
    }

    const csvData = await response.text();
    res.setHeader("Content-Type", "text/csv");
    res.status(200).send(csvData);
  } catch (error) {
    res.status(500).json({ error: "Internal server error." });
  }
}