# MenuLens

A full-stack web app that scans restaurant menus and gives you personalized dish recommendations based on your taste profile.

## How it works

1. Search for a restaurant (or add a new one)
2. Upload a photo or PDF of the menu — Claude Vision parses it into structured dishes
3. Get ranked dish recommendations scored against your taste profile
4. Log visits and rate dishes to improve future recommendations

## Tech Stack

- **Backend**: FastAPI (Python 3.11), PostgreSQL, Claude API (Anthropic)
- **Frontend**: React 18, Vite
- **Deployment**: Railway (backend + database), Vercel (frontend)

## Project Structure

```
MenuLens/
├── railway.json              # Railway build/deploy config (backend)
└── menulens/
    ├── docker-compose.yml    # Local development stack
    ├── backend/
    │   ├── Dockerfile
    │   ├── requirements.txt
    │   └── app/
    │       ├── main.py       # FastAPI app + all API endpoints
    │       ├── auth.py       # JWT + bcrypt, session cookie
    │       ├── guest.py      # Guest accounts: seed fixtures, creation, purge
    │       ├── llm.py        # Claude API calls (menu parsing, taste summarization)
    │       ├── scoring.py    # Formula-based dish ranking against taste profile
    │       ├── models.py     # SQLAlchemy ORM models
    │       └── database.py   # DB connection / session
    └── frontend/
        ├── index.html
        ├── package.json
        ├── vite.config.js
        ├── vercel.json       # Vercel SPA rewrite rules
        └── src/
            ├── main.jsx
            ├── App.jsx           # Auth gate + router, shared app state
            ├── AppContext.jsx    # useApp() — user, pending visits, logout
            ├── index.css         # Design system (light green/cream theme)
            ├── pages/
            │   ├── HomePage.jsx      # Restaurant search + scan/rank flow
            │   ├── DiscoverPage.jsx  # Browse restaurants and trending dishes
            │   ├── ListPage.jsx      # Visit history and pending ratings
            │   ├── FriendsPage.jsx   # Social feed (preview, not wired up)
            │   ├── StatsPage.jsx     # Charts derived from visit history
            │   ├── ProfilePage.jsx   # Collections, taste profile, activity
            │   └── SettingsPage.jsx  # Preferences, notifications, data
            └── components/
                ├── AppLayout.jsx        # Top nav, avatar menu, footer
                ├── icons.jsx            # Shared line icons
                ├── Uploader.jsx         # Drag/drop menu uploader
                ├── DishCards.jsx        # Ranked dish results
                ├── Onboarding.jsx       # Taste profile setup flow
                ├── RestaurantSearch.jsx # Search/select restaurant
                ├── NewRestaurantForm.jsx
                ├── LogMealForm.jsx      # Manual meal logging + dish ratings
                └── MyMealsPanel.jsx     # Visit history and pending visits
```

### Routes

| Path | Page |
|------|------|
| `/` | Home — restaurant search, menu scan, ranked picks |
| `/discover` | Browse restaurants and trending dishes |
| `/list` | Visit history and visits awaiting ratings |
| `/friends` | Friend activity feed (preview) |
| `/stats` | Charts derived from your visit history |
| `/profile` | Collections, taste profile, recent activity |
| `/settings` | Taste preferences, notifications, data |

Profile and Settings are reached from the avatar menu in the header; the other five
are in the main nav. `vercel.json` already rewrites all routes to `index.html`.

## Deployment

### Backend — Railway

The backend (FastAPI) and PostgreSQL database are hosted on [Railway](https://railway.app).

Railway builds directly from the repo using the `railway.json` config in the root:

```json
{
  "build": {
    "dockerfilePath": "menulens/backend/Dockerfile",
    "buildContext": "."
  },
  "deploy": {
    "startCommand": "uvicorn app.main:app --host 0.0.0.0 --port $PORT",
    "healthcheckPath": "/health"
  }
}
```

Required environment variables set in Railway:
- `DATABASE_URL` — PostgreSQL connection string (provided by Railway's Postgres plugin)
- `ANTHROPIC_API_KEY` — Claude API key

### Frontend — Vercel

The frontend (React/Vite) is deployed on [Vercel](https://vercel.com) from the `menulens/frontend` directory.

- **Root directory**: `menulens/frontend`
- **Build command**: `npm run build`
- **Output directory**: `dist`
- `vercel.json` configures SPA rewrites so all routes resolve to `index.html`

Required environment variable set in Vercel:
- `VITE_API_URL` — the Railway backend URL (e.g. `https://your-app.railway.app`)

## Local Development

### Option 1: Docker (Recommended)

```bash
cd menulens
docker-compose up --build
```

Backend at http://localhost:8000, frontend at http://localhost:5173.

### Option 2: Manual

**Backend** (requires PostgreSQL running locally):
```bash
cd menulens/backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend**:
```bash
cd menulens/frontend
npm install
npm run dev
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/login` | Username-based login / account creation |
| POST | `/api/guest` | Create a seeded throwaway guest account |
| GET | `/api/restaurants/search?q=` | Search restaurants by name |
| POST | `/api/restaurants` | Create a new restaurant |
| GET | `/api/restaurants/{id}/menu` | Get a restaurant's saved menu |
| POST | `/api/recommend/stream` | Upload menu image/PDF → SSE stream → parsed dishes (auth) |
| POST | `/api/recommend/rank` | Score + rank a dish list against the caller's taste profile (auth) |
| GET | `/api/profile/{user_id}` | Get taste profile |
| POST | `/api/profile/{user_id}` | Create / replace taste profile |
| PATCH | `/api/profile/{user_id}` | Patch taste profile fields |
| POST | `/api/profile/{user_id}/recompute` | Recompute profile from visit history |
| GET | `/api/visits/{user_id}` | Get visit history |
| POST | `/api/visits/{user_id}` | Log a visit |
| POST | `/api/visits/{user_id}/{visit_id}/dishes` | Rate dishes from a visit |
| DELETE | `/api/visits/{user_id}/{visit_id}` | Delete a visit |
| POST | `/api/import/excel` | Bulk import visits from Excel |

## Security notes

- **Secrets** live only in environment variables. `menulens/.env.example` documents every
  one; the real `.env` files are gitignored and have never been committed. `JWT_SECRET` is
  required — the backend refuses to start without it.
- **Sessions** are JWTs in an `httponly` cookie. `ENVIRONMENT=production` is what enables
  `Secure` and `SameSite=None`; leaving it unset in a deployed environment ships the
  session cookie without the `Secure` flag, so set it.
- **Every endpoint that calls the Anthropic API requires a session.** Menu scanning is the
  only one, it is capped per guest, and uploads are limited to `MAX_UPLOAD_BYTES`
  (10 MB default). Identity for scanning and ranking comes from the session cookie, never
  from a client-supplied `user_id` field.
- **Rate limits** are applied per IP to `/api/login`, `/api/register`, `/api/guest` and
  `/health/llm`. The limiter is in-process, so it does not hold across replicas — move it
  to Redis before scaling the backend horizontally.
- **Login** returns one message for every failure so usernames cannot be enumerated.
- **Public endpoints** are `/health`, `/api/login`, `/api/register`, `/api/guest`,
  `/api/restaurants/search` and `GET /api/restaurants/{id}/menu`. The last two are
  read-only views of shared restaurant data.

## Guest accounts

"Continue as guest" on the sign-in screen calls `POST /api/guest`, which creates a real
`User` row with no password and seeds it with sample restaurants, visits, dish ratings
and a taste profile — so Stats, Profile, My List and Collections have content to show.

- **Identified** by a reserved `guest_` username prefix. `/api/register` rejects that
  prefix, so real accounts can't collide with it. There is no `is_guest` column because
  the project has no migration tooling and `create_all` would not add one to an existing
  database.
- **Isolated** — each click creates its own account, so visitors don't affect each other.
- **Scan-limited** to `GUEST_SCAN_LIMIT` (currently 1) menu uploads per account, since
  every scan is a billed Anthropic call. The limit keys off the session cookie, not the
  `user_id` form field. A failed scan does not consume the allowance.
- **Purged** after `GUEST_TTL_DAYS` (currently 7). Cleanup runs opportunistically when a
  new guest is created, so no scheduler is needed. Only rows the guest owns are deleted;
  restaurants, menus and dishes are shared, so a purged guest's scans are kept and merely
  disowned.

The seed fixtures live in `menulens/backend/app/guest.py`. They use invented restaurant
names rather than real businesses, and each seeded restaurant gets a full menu — so a
guest can hit "Get recommendations" and see the real ranking flow without spending a scan.

## Data Model

- **User** — username-based, no passwords
- **Restaurant** — name, cuisine type, city
- **Menu** — one per restaurant; stores parsed dishes + scan metadata
- **Dish** — dish name, description, price, section, flavor vector
- **TasteProfile** — per-user; cuisine affinities, liked/disliked ingredients, flavor preferences; auto-recomputed from ratings
- **RestaurantVisit** — a logged visit linking user → restaurant → menu
- **DishRating** — per-dish rating (1–10) attached to a visit
