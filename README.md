# AI Unlocked — Static Site

A **zero-server** AI news aggregator hosted entirely on **GitHub Pages**.  
A GitHub Action scrapes 20+ RSS feeds every hour, summarises articles, detects company logos, and pushes static JSON files that the frontend reads.

## Architecture

```
GitHub Actions (cron every hour)
  └── scripts/build.py
        ├── scrapes 20 RSS feeds
        ├── summarises articles (extractive)
        ├── detects companies & fetches logos
        └── outputs JSON to site/data/
              ├── articles.json
              └── meta.json

GitHub Pages serves site/
  └── index.html + app.js read from data/*.json
```

## Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run the build script (scrapes feeds → outputs JSON)
python scripts/build.py

# Serve the static site locally
cd site && python -m http.server 8080
# Open http://localhost:8080
```

## Deploying to GitHub

1. Create a new repo on GitHub
2. Push this folder:
   ```bash
   cd ai-unlocked-static
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USER/ai-unlocked.git
   git push -u origin main
   ```
3. Go to **Settings → Pages → Source** → select `gh-pages` branch
4. The GitHub Action will run automatically on push and then every hour

## Costs

**$0** — GitHub Actions free tier gives 2,000 min/month.  
Each scrape takes ~45 seconds. Running hourly = ~22 hours/month = well within limits.
