# SwimML Analytics Dashboard

A premium, enterprise-grade swimming performance analytics dashboard built with **Next.js 14**, **React 18**, **TypeScript**, and **TailwindCSS**. Features a stunning dark aquatic glassmorphism design with zero backend dependencies — all data is realistically simulated for immediate testing and demonstration.

## Architecture Overview

```
swim-ml-dashboard/
├── app/                          # Next.js App Router pages
│   ├── layout.tsx               # Root layout with dark theme
│   ├── page.tsx                 # Coach Dashboard (Home)
│   ├── globals.css              # Global styles, glassmorphism utilities, custom scrollbar
│   ├── swimmer/[id]/            # Swimmer Profile view
│   │   └── page.tsx
│   ├── session/[id]/            # Session Analysis view (core feature)
│   │   └── page.tsx
│   ├── swimmers/                # All swimmers list
│   ├── analytics/               # Team analytics (placeholder)
│   └── settings/                # Settings panel (placeholder)
│
├── components/                   # Component-based architecture
│   ├── layout/                   # Shell components
│   │   ├── Sidebar.tsx          # Animated collapsible sidebar with nav
│   │   └── TopBar.tsx           # Search, notifications, user profile
│   ├── dashboard/               # Home view components
│   │   ├── MetricCard.tsx       # Animated metric cards with trends
│   │   ├── SessionFeed.tsx      # Real-time session list with status
│   │   ├── SwimmerGrid.tsx      # Team roster grid
│   │   └── QualityChart.tsx     # Historical quality score area chart
│   ├── session/                 # Core analysis components
│   │   ├── SessionHeader.tsx    # Swimmer name, stroke badge, confidence
│   │   ├── StrokeTimeline.tsx   # Interactive sensor data + ML segments
│   │   ├── QualityGauge.tsx     # Animated radial score gauge
│   │   └── FeatureBreakdown.tsx # ML feature progress bars
│   └── ui/                      # Reusable UI primitives
│       ├── ProgressBar.tsx      # Animated category-coded progress bars
│       └── Badge.tsx            # Status badges with variants
│
├── lib/                         # Utilities and state
│   ├── store.ts                 # Zustand global state management
│   ├── data.ts                  # Realistic placeholder data generators
│   └── utils.ts                 # Formatting helpers, cn() utility
│
├── types/                       # Strict TypeScript interfaces
│   └── index.ts                 # Swimmer, Session, MLResults, etc.
│
├── tailwind.config.ts           # Custom aquatic color palette, animations
├── tsconfig.json                # Path aliases (@/*)
└── package.json                 # Dependencies
```

## Design System

### Color Palette
- **Backgrounds**: Deep charcoal (`#020617`, `#0B1120`) with subtle radial gradients
- **Accents**: Neon aquatic teals (`#40E0D0`), cyan glows (`#22D3EE`), ocean blues
- **Semantic**: Emerald (good), Amber (average), Rose (needs improvement)

### Glassmorphism
- `glass-panel`: Frosted glass with backdrop blur, subtle borders, inner shadows
- `glass-card`: Elevated cards with hover lift animations and glow effects
- `neon-border`: Glowing aqua borders for emphasis elements

### Animations
- **Framer Motion**: Page transitions, staggered lists, hover effects, layout animations
- **Recharts**: Animated chart entry, smooth area gradients
- **Custom CSS**: Shimmer backgrounds, pulsing status dots, floating elements

## Key Features

### 1. Coach Dashboard (Home)
- **Top-level Metrics**: Total swimmers, average quality score, pipeline success rate, weekly sessions — all with trend indicators
- **Real-Time Feed**: Live session list showing analysis status (pending/processing/completed) with animated status dots
- **Team Roster**: Grid of swimmer cards with stroke specialties, average scores, and session counts

### 2. Swimmer Profile
- **Profile Header**: Avatar, stroke specialty, age, session count, average quality score
- **Quality Chart**: 30-day historical area chart with gradient fill and target reference line
- **Recent Sessions**: Clickable session list linking to detailed analysis

### 3. Session Analysis (Core Feature)
- **Session Header**: Swimmer name, date, stroke type badge with emoji, ML confidence percentage
- **Quality Gauge**: Large animated radial gauge (0-100) with color-coded tiers (Elite/Excellent/Good/Average/Needs Work) and glow effects
- **Feature Breakdown**: 6 animated progress bars showing ML-extracted features (Kick Velocity, Arm Extension, etc.) with color-coded categories
- **Stroke Timeline**: Interactive time-series chart with:
  - Toggle between Accelerometer/Gyroscope data
  - Zoom in/out/reset controls
  - ML segment overlays (vertical markers showing where the pipeline segmented strokes)
  - Hover tooltips showing segment details
  - Downsampled data for performance (50Hz → 10Hz display)

## Data Architecture

All data is generated via deterministic functions in `lib/data.ts`:
- `swimmers`: 5 elite swimmers with realistic stats
- `sessions`: 8 sessions with varying statuses
- `generateSensorData()`: Simulates 50Hz accelerometer/gyroscope with butterfly stroke patterns
- `generateMLResults()`: Creates stroke segments, confidence scores, and weighted feature breakdowns
- `generateHistoricalData()`: 30-day quality score trends with realistic variation

## State Management

**Zustand** store manages:
- Selected swimmer/session/ML results
- Sidebar open/close state
- Loading and error states

Chosen over Redux for minimal boilerplate in a single-user dashboard context.

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open http://localhost:3000
```

## Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | Next.js 14 (App Router) | Server components, file-based routing, optimal performance |
| Language | TypeScript | Strict typing for all data structures |
| Styling | TailwindCSS | Utility-first, custom aquatic palette, glassmorphism utilities |
| Animation | Framer Motion | Declarative animations, layout transitions, gesture support |
| Charts | Recharts | React-native, customizable, performant with large datasets |
| State | Zustand | Minimal boilerplate, TypeScript-friendly, performant |
| Icons | Lucide React | Clean, consistent, tree-shakeable |

## Engineering Decisions

1. **Component Architecture**: Flat hierarchy with feature-based grouping (dashboard/, session/, ui/) for maintainability
2. **No Backend**: All data functions are pure and deterministic — perfect for demos, testing, and gradual backend integration
3. **Responsive Design**: Mobile-first with collapsible sidebar and adaptive grids
4. **Performance**: Sensor data is downsampled 5x for chart rendering while preserving visual fidelity
5. **Accessibility**: Proper semantic HTML, focus states, and color contrast ratios maintained
