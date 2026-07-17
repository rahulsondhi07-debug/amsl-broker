# AMSL Broker — Frontend

A React (Vite) admin UI for the AMSL Broker portal. It talks to the backend API and reproduces
the portal’s screens: a live **Dashboard** and full pages for Leads, Customers, Quotes (+ the
Get Quote form), Contracts, Suppliers, Supplier Payments, Products, Agencies, Agents and Tickets.

Design matches the original portal — slate canvas, indigo→violet accents, Plus Jakarta Sans,
collapsed icon rail.

## Run it

The backend must be running first (see `../amsl-backend`). Then:

```bash
npm install
npm run dev        # → http://localhost:5173
```

Point it at a different API by creating a `.env`:

```
VITE_API_URL=http://localhost:4000/api
```

Build for production:

```bash
npm run build      # outputs to dist/
npm run preview
```

## What’s wired

- **Dashboard** — one call to `GET /api/dashboard?period=`, rendering every widget (stat cards,
  earning bar chart, revenue area chart, UK regional bars, performance metrics, demographics +
  latest leads, weekly payment status, recent contracts, top agents). The Monthly/Total toggle
  re-fetches with the matching period.
- **Leads** — paginated table, search, **Add Lead** modal (`POST /api/leads`), **Convert** to
  customer (`POST /api/leads/:id/convert`), delete.
- **Customers** — same table, customer stage.
- **Quotes** — history table; **New Quote** form posts to `POST /api/quotes`.
- **Contracts / Suppliers / Products / Agencies / Agents / Tickets** — live tables with search
  and pagination via the generic `ListPage` component.
- **Supplier Payments** — supplier picker + uploaded-invoice list.

## Structure

```
src/
  api.js               fetch client (reads VITE_API_URL)
  App.jsx              routes
  components/
    Layout.jsx         icon rail + top bar
    ui.jsx             Card, Badge, Modal, Pager, useList hook, …
    ListPage.jsx       generic column-driven table page
    BusinessTable.jsx  leads/customers table + add/convert
  pages/               one file per module
  styles.css           design system
```

Notes: routing uses `BrowserRouter`; if you deploy the static build, add an SPA fallback so deep
links resolve to `index.html`. CORS is already enabled on the backend.
