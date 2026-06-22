# PG Home Stay Dashboard

A Next.js dashboard to track tenants, rent, and food payments — with Supabase for storage and login.

---

## Setup Guide (Step by Step)

### Step 1 — Install Node.js
Download from https://nodejs.org (LTS version)

### Step 2 — Create your Supabase project
1. Go to https://supabase.com and sign up (free)
2. Click **New Project**, give it a name like "pg-dashboard"
3. Wait for the project to be ready (~1 minute)

### Step 3 — Run the database schema
1. In Supabase, go to **SQL Editor → New Query**
2. Copy everything from `supabase-schema.sql` and paste it
3. Click **Run** — this creates your tables

### Step 4 — Create your login user
1. In Supabase, go to **Authentication → Users → Add user**
2. Enter your email and a strong password
3. This is the username/password you'll use to log in

### Step 5 — Get your API keys
1. Go to **Settings → API** in your Supabase project
2. Copy **Project URL** and **anon public** key

### Step 6 — Configure the app
```bash
# In this folder, create .env.local
cp .env.example .env.local
```
Open `.env.local` and fill in:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### Step 7 — Run the app
```bash
npm install
npm run dev
```
Open http://localhost:3000 — you'll see the login page.

---

## Features

- **Login** — secure, only you can access the dashboard
- **Overview** — summary cards, bar charts, monthly trends
- **Payments** — add/edit/delete records, filter by tenant/month/status, toggle paid/pending
- **Tenants** — add/edit tenants, track deposit and join date, mark as inactive

## Project Structure

```
app/
  login/page.tsx          ← Login page
  dashboard/
    page.tsx              ← Overview with charts
    payments/page.tsx     ← Payment records
    tenants/page.tsx      ← Tenant list
components/
  Sidebar.tsx             ← Navigation sidebar
  OverviewClient.tsx      ← Charts and summary cards
  PaymentsClient.tsx      ← Payment table with filters
  TenantsClient.tsx       ← Tenant management
lib/
  supabase-client.ts      ← Browser Supabase client
  supabase-server.ts      ← Server Supabase client
types/index.ts            ← TypeScript types
supabase-schema.sql       ← Run this in Supabase SQL editor
```
