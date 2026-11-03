# Stone Dam Trail Guide

A self-guided, accessible interpretive tour of Allen Station Park and the 1874 Old Stone Dam in Allen, Texas. Demo prototype by Ken G. Crawford Consulting; not an official City of Allen product.

## What's here

- `public/index.html` is the whole visitor-facing guide: stops, field guide, welcome video, GPS stop alerts, accessibility settings and the Ask tab.
- `netlify/functions/ask.mts` powers "Ask the Creek Guide." It answers questions using only the guide's own content.
- `scripts/build-guide.mjs` runs on every Netlify build. It copies the stop and species content out of `index.html` into `netlify/lib/guide.mjs`, so the chatbot always matches what visitors see.

## Setup

1. Connect this repository to the Netlify site `stone-dam-trail-guide`. Netlify reads `netlify.toml`, so no build settings need to be typed in.
2. In Netlify, add the environment variable `ANTHROPIC_API_KEY` with its scope set to include Functions, then redeploy.
3. Set a monthly spending limit on the Anthropic account.

Every push to `main` publishes automatically.

## Editing content

Change the stories, access details or species in `public/index.html`. The chatbot picks up the changes on the next deploy.
