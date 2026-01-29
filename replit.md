# AmzWP-Automator

## Overview
AmzPilot is an Autonomous WordPress Monetization Engine that helps automate affiliate marketing tasks. It scans content, identifies opportunities, and deploys high-conversion assets.

## Tech Stack
- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS (CDN)
- **API**: Google Generative AI (@google/genai)

## Project Structure
```
/
├── App.tsx           # Main application component
├── index.tsx         # React entry point
├── index.html        # HTML template
├── types.ts          # TypeScript type definitions
├── utils.ts          # Utility functions
├── constants.ts      # Application constants
├── components/       # React components
├── vite.config.ts    # Vite configuration
└── tsconfig.json     # TypeScript configuration
```

## Development
- **Dev Server**: `npm run dev` (runs on port 5000)
- **Build**: `npm run build` (outputs to `dist/`)

## Deployment
Configured for static deployment via Vite build.

## Environment Variables
- `API_KEY`: Google Generative AI API key (optional fallback)

## AI Provider Support
The app supports multiple AI providers with secure API key storage:
- **Google Gemini**: Default provider, models include gemini-2.0-flash, gemini-1.5-flash, gemini-1.5-pro
- **OpenAI**: GPT-4o, GPT-4o Mini, GPT-4 Turbo, GPT-3.5 Turbo
- **Anthropic Claude**: Claude 3.5 Sonnet, Claude 3.5 Haiku, Claude 3 Opus
- **Groq**: Supports custom model input (e.g., llama-3.3-70b-versatile, mixtral-8x7b-32768)
- **OpenRouter**: Supports custom model input (e.g., anthropic/claude-3.5-sonnet, google/gemini-pro)

All API keys are encrypted before storage using SecureStorage.

## Features
- **Deep Intelligence Scan**: AI-powered content analysis to automatically detect monetization opportunities
- **Manual Product Add**: Add any Amazon product by entering ASIN or full Amazon URL
- **Smart Auto-Deploy**: Automatically place products in optimal positions based on content relevance
- **Visual Editor**: Drag-and-drop content blocks with product placement
- **Multi-Provider AI**: Support for Google Gemini, OpenAI, Anthropic, Groq, and OpenRouter
