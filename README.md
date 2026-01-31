# AmzWP Automator - Enterprise Edition

> **SOTA Amazon-WordPress Automation Platform**

An enterprise-grade React application for automated Amazon affiliate content generation and WordPress publishing with AI-powered optimization.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PRESENTATION LAYER                                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ LandingPage  │ │SitemapScanner│ │  PostEditor  │ │ ConfigPanel  │        │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
┌─────────────────────────────────────────────────────────────────────────────┐
│                         STATE MANAGEMENT (Zustand)                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │  App Store   │ │  Post Store  │ │ Batch Store  │ │   UI Store   │        │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SERVICE LAYER (DI Container)                        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │   AI Service │ │  WP Service  │ │Amazon Service│ │ Cache Service│        │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
┌─────────────────────────────────────────────────────────────────────────────┐
│                         INFRASTRUCTURE LAYER                                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │  Resilient   │ │    Task      │ │   IndexedDB  │ │   Web Worker │        │
│  │  API Client  │ │    Queue     │ │   Storage    │ │   Pool       │        │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Features

### 🚀 Performance
- **Web Workers** for heavy computation (XML parsing, AI generation)
- **Virtualized lists** for handling 10,000+ posts
- **SWR caching** with stale-while-revalidate
- **Lazy loading** with React Suspense
- **Code splitting** at route level

### 🛡️ Reliability
- **Circuit breaker** pattern for API resilience
- **Exponential backoff** retry logic
- **Persistent task queue** with IndexedDB
- **Error boundaries** at component level
- **Graceful degradation** strategies

### 🏗️ Architecture
- **Dependency injection** with InversifyJS
- **Zustand state management** with Immer
- **Zod validation** for runtime type safety
- **Structured logging** with Pino
- **OpenTelemetry** tracing support

### 📊 Observability
- **Real-time metrics** dashboard
- **Performance monitoring** (Web Vitals)
- **Error tracking** with context
- **Audit logging** for all operations

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | React 19 + TypeScript 5.5 |
| Build Tool | Vite 6 |
| State | Zustand + Immer |
| Validation | Zod |
| Caching | SWR + IndexedDB |
| Styling | Tailwind CSS 4 |
| UI Components | Radix UI + shadcn/ui |
| Testing | Vitest + Playwright |
| Logging | Pino |

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run tests
npm run test

# Run e2e tests
npm run test:e2e
```

## Environment Variables

```bash
# Required
VITE_GEMINI_API_KEY=your_key_here

# Optional
VITE_LOG_LEVEL=info
VITE_ENABLE_METRICS=true
VITE_CACHE_TTL=3600
```

## Documentation

- [Architecture Decision Records](./docs/adr/)
- [API Documentation](./docs/api/)
- [Deployment Guide](./docs/deployment/)
- [Contributing](./CONTRIBUTING.md)

## License

MIT © 2026 AmzWP Automator
