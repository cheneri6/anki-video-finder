export default async function handler(req, res) {
  try {
    // This points to your private database repository
    const githubUrl = "https://raw.githubusercontent.com/cheneri6/anki-database/refs/heads/main/AnKing_Step_Deck.csv";
    
    // Securely pulls the token from your Vercel Environment Variables
    const token = process.env.GITHUB_PAT;

    if (!token) {
      return res.status(500).json({ error: "GitHub token (GITHUB_PAT) is not configured in Vercel Environment Variables." });
    }

    const response = await fetch(githubUrl, {
      headers: {
        "Authorization": `token ${token}`
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Failed to fetch from GitHub: ${response.statusText}` });
    }

    // Send the CSV content directly to your React frontend
    const csvData = await response.text();
    res.setHeader("Content-Type", "text/csv");
    res.status(200).send(csvData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}