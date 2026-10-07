# X Buddy — Monorepo Architecture

Smart student PDF printing, UPI payments, and automated print station ecosystem.

## 📁 Repository Structure

```
├── frontend/                # Client-Side Application
│   ├── src/                 # React UI components, hooks, utils
│   ├── public/              # Static assets, QR codes, icons, forms
│   ├── android/             # Capacitor Android APK native project
│   ├── vite.config.js       # Vite configuration & dev proxy
│   ├── package.json         # Frontend dependencies & scripts
│   ├── .env                 # Frontend local variables (Git-ignored)
│   ├── .env.example         # Frontend environment template
│   └── README.md            # Frontend documentation
│
├── backend/                 # Backend & Automation Services
│   ├── api/                 # Authoritative MongoDB Orders API
│   ├── print-agent/         # Local Print Agent & SumatraPDF controller
│   ├── google-apps-script/  # Google Apps Script for Campus Ads & Archive
│   ├── scripts/             # DB migration, parity audit, backfill tools
│   ├── test/                # Backend regression test suites
│   ├── package.json         # Backend dependencies & scripts
│   ├── .env                 # Backend local variables (Git-ignored)
│   ├── .env.example         # Backend environment template
│   └── README.md            # Backend documentation
│
├── api/                     # Vercel Serverless Function entry point adapter
├── vercel.json              # Vercel deployment & routing configuration
└── package.json             # Root monorepo workspace scripts
```

## 🚀 Quick Start

### 1. Root Workspace Commands
```bash
# Run local frontend website (http://localhost:5173)
npm run dev

# Build production bundle
npm run build

# Run all test suites (backend + frontend)
npm test
```

### 2. Frontend Independent Commands
```bash
cd frontend
npm run dev
npm run build
npm test
```

### 3. Backend Independent Commands
```bash
cd backend
npm run agent   # Run local Print Agent (port 3001)
npm test        # Run backend test suites
npm run audit   # Run MongoDB parity audit
```
