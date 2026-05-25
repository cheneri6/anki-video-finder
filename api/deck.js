export default async function handler(req, res) {
  try {
    const githubApiUrl = "https://api.github.com/repos/cheneri6/anki-database/contents/AnKing_Step_Deck.csv?ref=main";
    const token = process.env.GITHUB_TOKEN;

    console.log('[api/deck] request received');
    if (!token) {
      console.error('[api/deck] missing environment variable GITHUB_TOKEN');
      return res.status(500).json({ error: "GitHub token (GITHUB_TOKEN) is not configured in Vercel Environment Variables." });
    }

    console.log('[api/deck] fetching GitHub contents from:', githubApiUrl);
    const response = await fetch(githubApiUrl, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github.raw"
      }
    });
    console.log('[api/deck] GitHub response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unable to read body');
      console.error('[api/deck] GitHub fetch failed:', response.status, response.statusText, errorBody);
      return res.status(response.status).json({ error: `Failed to fetch from GitHub: ${response.statusText}` });
    }

    const csvData = await response.text();
    console.log('[api/deck] fetched CSV length:', csvData.length);
    res.setHeader("Content-Type", "text/csv");
    res.status(200).send(csvData);
  } catch (error) {
    console.error('[api/deck] handler caught error:', error);
    res.status(500).json({ error: error.message });
  }
}