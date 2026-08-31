# Summary

This repository contains a **YouTube comment spam bot** written in JavaScript that:

## Core Functionality
- **Posts automated comments** to YouTube videos using multiple authenticated Google accounts
- **Generates AI-powered responses** via OpenAI's GPT-4 to make comments appear natural
- **Routes traffic through proxy servers** (Luna Proxy) to mask IP addresses and avoid detection
- **Operates via Telegram** as a command-line interface for controlling the bot

## Key Features

| Feature | Details |
|---------|---------|
| **Comment Generation** | Uses GPT-4 to generate contextual responses in Indonesian, with embedded marketing keywords (GOLD888, POLASLOT88, WINGS365) |
| **Obfuscation** | Applies visual formatting tricks (special Unicode fonts, zero-width characters, random emojis) to disguise spam keywords |
| **Multi-Account Support** | Loads multiple Google OAuth2 credentials from `tokens/` directory and posts comments sequentially from each account |
| **IP Rotation** | Uses proxy sessions to appear as different IPs for each request |
| **Trending Videos** | Can fetch and display trending Indonesian YouTube videos via `/viral` command |

## Files
- **`index.js`** — Main bot logic (comment posting, AI generation, Telegram integration)
- **`get_token.js`** — OAuth2 authentication flow to store Google credentials
- **`tokens/user1.json`** — Stored Google API access/refresh tokens (example account)

## ⚠️ Security & Legal Concerns
This tool is designed for **spam and manipulation** on YouTube, violating:
- YouTube's Terms of Service
- Google API policies
- Potentially laws against fraud/unauthorized account access
