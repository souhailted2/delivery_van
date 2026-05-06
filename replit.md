# ERP Van Sales — Algeria (French / DZD)

## Overview

A full-featured ERP system for van sales operations in Algeria. All UI is in French, currency is DZD (Dinar Algérien). Includes role-based access (admin / vendeur), product management, warehouse stock, truck fleet, invoices, returns, cash management, and reports.

## Architecture

- **Monorepo** managed with pnpm workspaces
- **Frontend**: React + Vite (`artifacts/erp-van-sales`) — served at `/`
- **Backend**: Express API server (`artifacts/api-server`) — served at `/api`
- **Database**: PostgreSQL via Drizzle ORM (`lib/db`)
- **API Contract**: OpenAPI spec (`lib/api-spec`) → generated React Query hooks (`lib/api-client-react`)

## Authentication

- Session-based using `express-session`
- Password hashing: SHA256 with salt `"erp-salt-dzd"`
- Demo credentials:
  - **admin** / `admin123` — full access
  - **vendeur1** / `vendeur123` — limited access

## Roles & Permissions

| Permission | Admin | Vendeur |
|---|---|---|
| canDeleteInvoice | ✓ | configurable |
| canEditPrice | ✓ | configurable |
| canSellOnCredit | ✓ | configurable |
| canViewReports | ✓ | configurable |

## Key Pages

| Route | Page | Description |
|---|---|---|
| `/` | Tableau de bord | Dashboard stats |
| `/produits` | Produits | Product catalogue |
| `/categories` | Catégories | Product categories |
| `/fournisseurs` | Fournisseurs | Suppliers & debts |
| `/achats` | Bons d'achat | Purchase orders |
| `/clients` | Clients | Client management |
| `/camions` | Camions | Truck fleet |
| `/stock` | Stock Central | Warehouse inventory |
| `/factures` | Factures | Sales invoices |
| `/retours` | Retours | Returns management |
| `/caisse` | Caisse | Cash transfers |
| `/rapports` | Rapports | Sales reports |
| `/utilisateurs` | Utilisateurs | User management |

## API Endpoints

All routes prefixed with `/api`:

- `POST /api/auth/login` — Login
- `POST /api/auth/logout` — Logout
- `GET /api/auth/me` — Current user
- `GET/POST /api/products` — Products
- `GET/POST /api/categories` — Categories
- `GET/POST /api/suppliers` — Suppliers
- `GET/POST /api/purchases` — Purchase orders
- `GET/POST /api/clients` — Clients
- `GET/POST /api/trucks` — Trucks
- `GET /api/stock/warehouse` — Warehouse stock
- `GET/POST /api/invoices` — Invoices
- `GET/POST /api/returns` — Returns
- `GET/POST /api/cash` — Cash transfers
- `GET /api/reports/dashboard` — Dashboard stats
- `GET /api/reports/daily` — Daily report

## Database Schema (Drizzle ORM)

Tables: `users`, `categories`, `products`, `suppliers`, `purchase_orders`, `purchase_items`, `clients`, `trucks`, `truck_stock`, `invoices`, `invoice_items`, `returns`, `return_items`, `cash_transfers`

## Seeded Data

- 4 categories (Boissons, Épicerie, Produits laitiers, Snacks)
- 5 products (Eau minérale, Jus IFRI, Huile Fleurial, Sucre, Lait Candia)
- 2 suppliers (CEVITAL, IFRI)
- 3 clients (Superette Bab Ezzouar, Épicerie Centrale, Magasin el Bahdja)
- 2 trucks (Camion 01 — 16-ALG-100, Camion 02 — 16-ALG-101)

## Tech Stack

- React 19 + TypeScript + Vite
- Tailwind CSS + shadcn/ui components
- TanStack Query (React Query) for data fetching
- Wouter for routing
- Express + TypeScript backend
- Drizzle ORM + PostgreSQL
- Orval for OpenAPI code generation
- express-session for auth
- pino for structured logging
