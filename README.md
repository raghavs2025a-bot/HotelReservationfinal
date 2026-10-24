# StayEase - Hotel Reservation and Management System

A full-stack hotel booking platform: a premium customer website (browse, search, book, manage reservations) and a separate admin dashboard (rooms, reservations, customers, reports).

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite, React Router, Axios, Lucide React, plain responsive CSS |
| Backend | Node.js + Express 4 (ES modules), mysql2 (parameterized queries), JWT in an HTTP-only cookie, bcrypt hashing (`bcryptjs`), helmet, CORS, rate limiting |
| Database | MySQL 8.0+ (InnoDB, foreign keys, CHECK constraints, transactions, row locks) |

## Features

**Customers**
- Landing page: hero search, featured rooms, amenities, testimonials, contact info, footer
- Room search by check-in/out dates, guests and category; live availability per date range
- Filter by max price, capacity, amenities, keyword; sort by price/capacity; "available only" toggle
- Room details: gallery, facilities, booked date ranges, live server-side price quote
- Register / login / logout, secure cookie session, profile editing, password change
- Checkout with guest details and price breakdown (nights, room charges, tax, service fee, total - all computed on the server)
- Unique booking reference, confirmation page, printable receipt
- My bookings (upcoming / completed / cancelled) with rule-based cancellation and refunds

**Administrators** (`/admin`, enforced by the API, not only hidden in the UI)
- Dashboard: total / available / occupied / maintenance rooms, reservations by status, revenue, today's arrivals and departures, recent reservations
- Rooms: add, edit, deactivate/activate, price, capacity, amenities, images, maintenance flag
- Room types: add / edit
- Reservations: search and filter, confirm, cancel, check-in, check-out
- Customers: search, activate/deactivate, full booking history
- Reports for any date range (up to 366 days): bookings by status, daily revenue, daily occupancy, top rooms

**Hotels, cities and rooms**
- 12 cities, 3 hotels per city, 8 individually numbered rooms per hotel. Choosing a city shows only that city's hotels, with that city's prices.
- After a booking, the confirmation page, My bookings and the admin panel all show the booked **hotel, city and room number (and floor)**.

**Business rules**
- No double booking (also enforced inside MySQL by triggers in `server/database/triggers.sql`): every booking runs in a transaction that locks the room row (`SELECT ... FOR UPDATE`) and checks for overlapping `pending`/`confirmed` bookings.
- Dates: check-in cannot be in the past, check-out must be after check-in, max stay `MAX_STAY_NIGHTS` (default 30), up to 365 days in advance. Guests cannot exceed room capacity.
- Customer cancellation: 2+ days before check-in = 100% refund; 1 day before = 50% refund; on/after the check-in day = not allowed online. Administrators can cancel any non-checked-in booking with a full refund.
- Payment: **simulated only** (see below). Revenue = payments with status `success` or `partially_refunded`, net of refunds.
- Pay-at-hotel bookings start `pending` until an admin confirms them; the payment is marked paid at check-out.
- A room with upcoming reservations cannot be deactivated.

## Payments are simulated

No payment gateway is integrated. "Simulated online payment" records a successful **test** payment (`is_simulated = 1`, transaction ref `SIM-...`) and no money moves. This is labelled in the UI. To go live, replace the simulated branch in `server/src/services/booking.service.js` (`createBooking`) with a real provider (for example Razorpay or Stripe) and verify payments via webhooks.

## Folder structure

```
hotel-reservation-system/
|-- client/                  React + Vite frontend
|   |-- public/              favicon
|   |-- src/
|   |   |-- components/      Navbar, Footer, RoomCard, SearchBar, Modal, feedback (Loader/Empty/Error) ...
|   |   |-- context/         AuthContext, ToastContext
|   |   |-- hooks/           useFetch, useDebounce
|   |   |-- layouts/         MainLayout, AdminLayout
|   |   |-- pages/           Home, Rooms, RoomDetails, Login, Register, Checkout, BookingConfirmation, MyBookings, Profile
|   |   |-- pages/admin/     AdminDashboard, AdminRooms, AdminRoomTypes, AdminReservations, AdminCustomers, AdminReports
|   |   |-- services/        axios instance + API wrappers
|   |   |-- styles/          base.css, site.css, admin.css
|   |   `-- utils/           formatting helpers
|   |-- index.html, vite.config.js, package.json, .env.example
|-- server/
|   |-- src/
|   |   |-- config/          env.js, db.js
|   |   |-- controllers/     auth, room, booking, admin
|   |   |-- middleware/      auth (JWT cookie + admin check), error handling, rate limits
|   |   |-- models/          SQL data access (user, room, booking)
|   |   |-- routes/          auth, rooms, bookings, admin
|   |   |-- services/        pricing, booking (transactions, cancellation), reports
|   |   |-- utils/           AppError, asyncHandler, dates, validators
|   |   |-- app.js, server.js
|   |-- scripts/setup-db.js  creates schema, seed data, demo accounts
|   |-- package.json, .env.example
|-- server/database/
|   |-- schema.sql           tables, keys, indexes, constraints (hotels, rooms, bookings ...)
|   |-- seed.sql             amenities, room types, 36 hotels in 12 cities, 288 rooms, reviews
|   |-- triggers.sql         double-booking triggers + v_room_bookings view
|-- docs/
|   |-- API_DOCUMENTATION.md
|   |-- DATABASE_DESIGN.md
|-- package.json             root scripts (install, dev, build)
|-- .gitignore
`-- README.md
```

## Setup on Windows (VS Code)

### 1. Prerequisites
- [Node.js 18.17+ (LTS)](https://nodejs.org) - check with `node -v`
- [MySQL Server 8.0+](https://dev.mysql.com/downloads/installer/) (note the root password you set during install). Make sure the **MySQL80** service is running (Win + R, `services.msc`).
- VS Code (optional but recommended)

### 2. Install dependencies
Open the project folder in VS Code, open a terminal (Ctrl + `) and run:

```powershell
npm run install:all
```

### 3. Configure the server
```powershell
copy server\.env.example server\.env
```
Edit `server\.env`:
- `DB_PASSWORD` - your MySQL root password
- `JWT_SECRET` - a long random string. Generate one with:
  ```powershell
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```

The client needs no configuration in development (Vite proxies `/api` to `http://localhost:5000`).

### 4. Create the database
```powershell
npm run db:reset
```
(Use `db:reset` the first time after updating to this version: the schema now has a `hotels` table, so the old database must be rebuilt.)
This applies `database/schema.sql`, loads `database/seed.sql`, creates the demo accounts with **bcrypt-hashed** passwords, and adds a few sample reservations for the demo guest. It is safe to re-run (it skips data that already exists). To wipe and rebuild everything: `npm run db:reset`.

Prefer the MySQL command line? You can run `mysql -u root -p < database\schema.sql` and `mysql -u root -p hotel_reservation < database\seed.sql`, but you must still run `npm run db:setup` once to create the demo accounts.

### 5. Run the app
```powershell
npm run dev
```
- Website: http://localhost:5173
- API: http://localhost:5000/api (health check: http://localhost:5000/api/health)

## Demo accounts (development only)

Created by `npm run db:setup`. Values come from `server/.env` (defaults shown). **Change or delete these before any real deployment.**

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@stayease.test` | `Admin@12345` |
| Customer | `guest@stayease.test` | `Guest@12345` |

Passwords are never stored in plain text; only bcrypt hashes are in the database.

## Environment variables

`server/.env`

| Variable | Purpose | Default |
|----------|---------|---------|
| `PORT` | API port | `5000` |
| `NODE_ENV` | `development` or `production` | `development` |
| `CLIENT_URL` | Allowed CORS origin(s), comma separated | `http://localhost:5173` |
| `SERVE_CLIENT` | `true` = Express also serves `client/dist` | `false` |
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | MySQL connection | `localhost` `3306` `root` - `hotel_reservation` |
| `JWT_SECRET` | Signs session tokens (required, 16+ chars) | none |
| `JWT_EXPIRES_IN` | Token lifetime | `7d` |
| `COOKIE_SAMESITE` | `lax`, `strict` or `none` | `lax` |
| `TAX_RATE` | Tax percent applied to room charges | `12` |
| `SERVICE_FEE_RATE` | Service fee percent | `5` |
| `MAX_STAY_NIGHTS` | Longest allowed stay | `30` |
| `DEMO_*` | Demo account emails/passwords used by `db:setup` | see `.env.example` |

`client/.env` (optional): `VITE_API_URL` - full API URL for production builds, e.g. `https://api.example.com/api`.

## NPM scripts

| Command | Description |
|---------|-------------|
| `npm run install:all` | Install root, server and client dependencies |
| `npm run dev` | Run API (with `node --watch`) and Vite dev server together |
| `npm run dev:server` / `npm run dev:client` | Run one side only |
| `npm run build` | Production build of the client into `client/dist` |
| `npm start` | Start the API in production mode |
| `npm run start:prod` | Build the client, then start the API |
| `npm run db:setup` / `npm run db:reset` | Create/seed the database / drop and rebuild it |

## Documentation
- [API documentation](docs/API_DOCUMENTATION.md)
- [Database design](docs/DATABASE_DESIGN.md)

## Security notes
- Passwords hashed with bcrypt (cost 12); sessions are JWTs in `HttpOnly` cookies (`Secure` in production / `SameSite=None`).
- The user's role and active flag are re-read from MySQL on every request; admin routes are protected by `authenticate` + `requireAdmin`.
- All SQL uses prepared statements; request bodies are validated server-side; prices and totals are never trusted from the client.
- `helmet`, CORS allow-list with credentials, global and login rate limiting.
- The cookie uses `SameSite=Lax` by default, which together with JSON-only endpoints mitigates CSRF. If you must use `SameSite=None` (client and API on different sites), add CSRF tokens before going live.

## Deployment

GitHub Pages can only host static files. It **cannot** run Node.js or MySQL, so it can host only the React build, never the API or database.

A working production architecture has three parts:

1. **MySQL** - a managed MySQL 8 server reachable by the API (e.g. Railway, Aiven, AWS RDS, DigitalOcean Managed Databases). Run `npm run db:setup` once against it (set the `DB_*` variables) and delete or change the demo accounts afterwards.
2. **Express API** - a Node host such as Render, Railway, Fly.io or an Azure/AWS VM. Set the variables from `server/.env.example`, with `NODE_ENV=production`, a strong `JWT_SECRET` and `CLIENT_URL` set to your frontend's URL. Start command: `npm --prefix server start`.
3. **React frontend** - static hosting (Netlify, Vercel, Cloudflare Pages, GitHub Pages or S3). Set `VITE_API_URL=https://your-api-host/api`, run `npm run build`, and publish `client/dist`. Add a rewrite of all paths to `index.html` so React Router deep links work.

If the frontend and API live on different sites, set `COOKIE_SAMESITE=none` (requires HTTPS) and make sure `CLIENT_URL` exactly matches the frontend origin. The simplest option is a single host: set `SERVE_CLIENT=true`, run `npm run build`, then `npm start`, and Express serves both the SPA and `/api` from one origin.

### Publishing to GitHub
```powershell
git init
git add .
git commit -m "Initial commit: StayEase hotel reservation system"
git branch -M main
git remote add origin https://github.com/<your-username>/hotel-reservation-system.git
git push -u origin main
```
`.env` files and `node_modules` are git-ignored; only the `.env.example` templates are committed.

## Troubleshooting
- **`ECONNREFUSED` / "Could not connect to MySQL"** - start the MySQL80 Windows service and check `DB_HOST`/`DB_PORT`.
- **`ER_ACCESS_DENIED_ERROR`** - wrong `DB_USER`/`DB_PASSWORD` in `server/.env`.
- **"JWT_SECRET is missing"** - you have not created `server/.env` yet.
- **Room images are blank** - the seed data uses Unsplash photo URLs and needs internet access; broken images fall back to a placeholder. Replace URLs in Admin > Rooms any time.
- **Port already in use** - change `PORT` in `server/.env` and the proxy target in `client/vite.config.js`.

## Known limitations
- Payment is simulated (see above); there is no email/SMS delivery of confirmations.
- No automated test suite is included.
- The `reviews` table is read-only in the UI (featured testimonials on the home page); guests cannot post reviews yet.
