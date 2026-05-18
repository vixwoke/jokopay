# JokoPay

JokoPay is an AI-powered personal finance tracker for Malaysian users. It records expenses and income from text, voice, or receipt images, converts them into structured transactions, updates the user's balance, and visualizes spending activity through dashboards and transaction history.

## Features

- **AI transaction parsing**: Converts natural language transaction descriptions into structured finance data.
- **Text, voice, and image input**: Users can type a transaction, record audio, take a receipt photo, or upload a receipt image.
- **Receipt review flow**: Parsed transactions are shown as a receipt before saving.
- **Smart editing**: Users can edit store, payment method, date, notes, and item details, with AI-assisted normalization.
- **Malaysia-focused payment support**: Supports Malaysian payment methods such as Touch 'n Go eWallet, GrabPay, ShopeePay, Boost, DuitNow, FPX, MyDebit, cash, and Malaysian banks.
- **Balance tracking**: Income increases the balance, expenses reduce it, and deletes reverse the balance impact.
- **Dashboard analytics**: Displays current balance, balance movement, expense charts, income charts, and recent transactions.
- **Transaction history**: Desktop table view with pagination, row selection, bulk delete, and transaction details.
- **CSV import**: Drag-and-drop CSV import with preview before saving.
- **User preferences**: Users can choose between Chat Only and Chat + Dashboard as their home view.

## Tech Stack

- **Framework**: Next.js 16 App Router
- **Language**: TypeScript
- **UI**: React 19, Tailwind CSS v4
- **Charts**: Recharts
- **Database**: Supabase PostgreSQL
- **AI SDK**: Groq SDK
- **Text and vision model**: `meta-llama/llama-4-scout-17b-16e-instruct`
- **Speech model**: `whisper-large-v3`
- **Fonts**: Poppins, Pacifico, Geist Mono via `next/font/google`

## Project Structure

```text
finance-tracker-njs1/
|-- app/
|   |-- chatview/          # Chat-only transaction input page
|   |-- dashboard/         # Combined dashboard and chat page
|   |-- dashboardview/     # Dashboard-only home view
|   |-- login/             # Username setup and login page
|   |-- transactions/      # Desktop transaction history and CSV import
|   |-- components/        # Shared UI components
|   |-- globals.css        # Global theme and Tailwind setup
|   `-- layout.tsx         # App shell and Google fonts
|-- lib/
|   |-- models/            # TypeScript data models
|   |-- services/          # Transaction parsing, saving, and input collection
|   |-- groq.ts            # Groq AI helpers
|   `-- supabase.ts        # Supabase client
|-- public/
|-- package.json
`-- README.md
```

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_GROQ_API_KEY=your_groq_api_key
```

Do not commit `.env.local` to GitHub.

### 3. Create the Supabase tables

Run this SQL in the Supabase SQL editor:

```sql
CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username    text UNIQUE NOT NULL,
  preference  smallint DEFAULT 0 CHECK (preference IN (0, 1)),
  balance     numeric(12,2) NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_users_username ON users (username);

CREATE TABLE transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date            timestamptz NOT NULL DEFAULT now(),
  type            text NOT NULL CHECK (type IN ('expense', 'income')),
  store           text,
  payment_method  text,
  total           numeric(12,2),
  notes           text,
  raw_text        text NOT NULL,
  source          text NOT NULL CHECK (source IN ('text', 'voice', 'image')),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_transactions_user_id ON transactions (user_id);
CREATE INDEX idx_transactions_date ON transactions (date DESC);

CREATE TABLE transaction_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id   uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  name             text NOT NULL,
  amount           numeric(12,2) NOT NULL,
  quantity         integer NOT NULL DEFAULT 1,
  category         text,
  created_at       timestamptz DEFAULT now()
);
```

### 4. Run the development server

```bash
npm run dev
```

Open `http://localhost:3000` in your browser. The root page redirects to `/login`.

## Available Scripts

```bash
npm run dev      # Start the development server
npm run build    # Build the production app
npm run start    # Start the production server
npm run lint     # Run ESLint
```

## Main Routes

- `/login`: Create or continue with a username, choose view preference, and set starting balance.
- `/chatview`: Chat-only transaction recording interface.
- `/dashboardview`: Dashboard-only view with balance and charts.
- `/dashboard`: Combined dashboard and chat interface.
- `/transactions`: Desktop transaction history, delete tools, and CSV import.

## CSV Import Format

The transaction import page accepts CSV files with these columns:

```csv
group,date,time,type,store,payment_method,total,notes,item_name,item_amount,item_quantity
1,2026-05-19,14:30,expense,Giant,TNG,150.50,weekly groceries,Milk,12.00,2
1,2026-05-19,14:30,expense,Giant,TNG,150.50,weekly groceries,Eggs,8.50,1
2,2026-05-20,09:00,income,Salary,,5000.00,May salary,,,
```

Rows with the same `group` value are imported as one transaction with multiple items.

## Database Overview

- `users`: Stores username, preferred home view, running balance, and creation timestamp.
- `transactions`: Stores expense or income records linked to a user.
- `transaction_items`: Stores itemized transaction details linked to a transaction.

The schema uses cascading deletes so removing a user deletes their transactions, and removing a transaction deletes its items.

## GitHub Upload Notes

Before pushing to GitHub, keep generated files and secrets out of version control:

```gitignore
node_modules/
.next/
.env.local
.env*.local
```

Keep source files, `package.json`, `package-lock.json`, and configuration files committed.

## Deployment

This app can be deployed on Vercel or another Next.js-compatible hosting provider. Add the same environment variables used locally to the deployment platform:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_GROQ_API_KEY`

After deployment, confirm that Supabase policies and API keys allow the expected client-side reads and writes for this project.
