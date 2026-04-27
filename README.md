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
            ├── App.jsx           # App shell, state machine, all tabs
            ├── index.css         # Design system (Beli-inspired light theme)
            └── components/
                ├── PhoneFrame.jsx       # iPhone-style wrapper
                ├── Uploader.jsx         # Drag/drop menu uploader
                ├── DishCards.jsx        # Ranked dish results
                ├── Onboarding.jsx       # Taste profile setup flow
                ├── RestaurantSearch.jsx # Search/select restaurant
                ├── NewRestaurantForm.jsx
                ├── LogMealForm.jsx      # Manual meal logging + dish ratings
                └── MyMealsPanel.jsx     # Visit history and pending visits
```

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
| GET | `/api/restaurants/search?q=` | Search restaurants by name |
| POST | `/api/restaurants` | Create a new restaurant |
| GET | `/api/restaurants/{id}/menu` | Get a restaurant's saved menu |
| POST | `/api/recommend/stream` | Upload menu image/PDF → SSE stream → parsed dishes |
| POST | `/api/recommend/rank` | Score + rank a dish list against a user's taste profile |
| GET | `/api/profile/{user_id}` | Get taste profile |
| POST | `/api/profile/{user_id}` | Create / replace taste profile |
| PATCH | `/api/profile/{user_id}` | Patch taste profile fields |
| POST | `/api/profile/{user_id}/recompute` | Recompute profile from visit history |
| GET | `/api/visits/{user_id}` | Get visit history |
| POST | `/api/visits/{user_id}` | Log a visit |
| POST | `/api/visits/{user_id}/{visit_id}/dishes` | Rate dishes from a visit |
| DELETE | `/api/visits/{user_id}/{visit_id}` | Delete a visit |
| POST | `/api/import/excel` | Bulk import visits from Excel |

## Data Model

- **User** — username-based, no passwords
- **Restaurant** — name, cuisine type, city
- **Menu** — one per restaurant; stores parsed dishes + scan metadata
- **Dish** — dish name, description, price, section, flavor vector
- **TasteProfile** — per-user; cuisine affinities, liked/disliked ingredients, flavor preferences; auto-recomputed from ratings
- **RestaurantVisit** — a logged visit linking user → restaurant → menu
- **DishRating** — per-dish rating (1–10) attached to a visit
