# X Buddy Print Agent

Automatically prints PDFs from Google Sheets orders.

## Setup

### 1. Install Node.js
Download from https://nodejs.org (LTS)

### 2. Install dependencies
```bash
cd xbuddy-print-agent
npm install
```

### 3. Setup Google Service Account (IMPORTANT)

You need a Google Service Account to read/write Google Sheets.

Steps:
1. Go to https://console.cloud.google.com
2. Create a new project (or use existing)
3. Enable "Google Sheets API"
4. Go to IAM & Admin → Service Accounts
5. Create a new service account
6. Click on it → Keys → Add Key → JSON
7. Download the JSON file
8. Rename it to: credentials.json
9. Place it in this folder: xbuddy-print-agent/credentials.json

### 4. Share your Google Sheet with the service account

1. Open your Google Sheet
2. Click Share
3. Add the service account email (found in credentials.json as "client_email")
4. Give it Editor access

### 5. Connect your printer
Make sure your printer is connected and set as default on Windows.

### 6. Run the agent
```bash
npm start
```

## How it works

Every 5 seconds:
1. Reads Google Sheet
2. Finds rows where Print Status = "Waiting"
3. Downloads PDF from Google Drive
4. Prints automatically
5. Updates status to "Printed"

## Folder Structure

```
xbuddy-print-agent/
├── downloads/          ← Temp PDF storage (auto-deleted after print)
├── services/
│   ├── sheets.js       ← Read Google Sheets
│   ├── printer.js      ← Print PDFs
│   ├── downloader.js   ← Download from Drive
│   └── updater.js      ← Update print status
├── utils/
│   └── logger.js       ← Console logging
├── credentials.json    ← Google Service Account (YOU ADD THIS)
├── index.js            ← Main polling loop
└── package.json
```
