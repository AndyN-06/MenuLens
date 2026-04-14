# MenuLens iOS

Native iOS app for MenuLens built with SwiftUI. Mirrors the full web app experience — scan menus, get AI-powered dish rankings, log ratings, and build a personalized taste profile.

## Requirements

- Xcode 15+
- iOS 16+ deployment target
- macOS 13+ (to build)
- Running MenuLens backend (`menulens/backend`)

## Setup

### 1. Point the app at your backend

Edit `MenuLens/Services/APIClient.swift` and update `APIConfig.baseURL`:

```swift
enum APIConfig {
    static var baseURL = "http://localhost:8000"   // ← change this
}
```

For a device on your local network, use your Mac's LAN IP (e.g. `http://192.168.1.x:8000`).
For production, use your deployed URL.

### 2. Generate the Xcode project (recommended)

Install [XcodeGen](https://github.com/yonaskolb/XcodeGen):

```bash
brew install xcodegen
```

Then from the `menulens/ios/` directory:

```bash
xcodegen generate
open MenuLens.xcodeproj
```

### 3. Manual Xcode project (alternative)

1. Open Xcode → **File → New → Project**
2. Choose **iOS → App**
3. Product Name: `MenuLens`, Interface: `SwiftUI`, Language: `Swift`
4. Save to `menulens/ios/`
5. Delete the auto-generated `ContentView.swift` and `<AppName>App.swift`
6. Drag the `MenuLens/` folder into Xcode (check "Copy if needed" = OFF)
7. Set `Info.plist` to `MenuLens/Info.plist` in Build Settings

### 4. Run

Select a simulator or connected device and press **⌘R**.

---

## Project Structure

```
MenuLens/
├── MenuLensApp.swift          # App entry point + root view switcher
├── Info.plist                 # App permissions & metadata
│
├── Models/
│   ├── User.swift             # User + LoginRequest
│   ├── Restaurant.swift       # Restaurant + search/create models
│   ├── Dish.swift             # Dish, FlavorVector, ParsedMenu, StreamEvent
│   ├── TasteProfile.swift     # TasteProfile + onboarding constants
│   └── Visit.swift            # Visit, DishRating, PendingVisit
│
├── Services/
│   └── APIClient.swift        # HTTP client — GET/POST/PATCH/DELETE + SSE streaming
│
├── ViewModels/
│   ├── AppState.swift         # Global state machine (login → onboarding → main)
│   ├── ScanViewModel.swift    # Menu scanning + dish ranking + rating flow
│   └── ProfileViewModel.swift # Visit history
│
├── Views/
│   ├── LoginView.swift        # Username login screen
│   ├── OnboardingView.swift   # 3-step taste profile setup
│   ├── MainTabView.swift      # Tab bar (Scan / My Meals / Profile)
│   ├── Scan/
│   │   ├── ScanView.swift          # Camera/photo pick + upload orchestration
│   │   ├── RestaurantSearchView.swift  # Live search + create restaurant
│   │   ├── DishListView.swift      # Ranked dish cards with match badges
│   │   └── DishRatingView.swift    # 1-10 dot rating for each dish
│   ├── Meals/
│   │   └── MyMealsView.swift       # Visit history list
│   └── Profile/
│       └── ProfileView.swift       # Taste profile display + sign out
│
└── Extensions/
    └── Color+Theme.swift      # Brand colors (mlGreen, mlBackground, etc.)
```

## Feature Map

| Web Feature | iOS Screen |
|-------------|-----------|
| Login screen | `LoginView` |
| Onboarding (cuisines → dietary → flavors) | `OnboardingView` |
| Restaurant search + create | `RestaurantSearchView` |
| Camera / photo upload | `ScanView` |
| Real-time Claude processing logs | `ScanView` uploading state |
| Ranked dish cards (great/good/skip badges) | `DishListView` + `DishCard` |
| Dish rating (1–10) | `DishRatingView` + `StarRatingRow` |
| Meal history | `MyMealsView` |
| Taste profile (cuisines, flavors, top dishes) | `ProfileView` |

## Backend API Used

All endpoints documented in `menulens/backend/app/main.py`. The iOS app uses:

- `POST /api/login`
- `POST /api/profile/{user_id}` — create profile
- `GET  /api/profile/{user_id}` — fetch profile  
- `POST /api/profile/{user_id}/recompute`
- `GET  /api/restaurants/search?q=`
- `POST /api/restaurants`
- `POST /api/recommend/stream` — SSE streaming upload
- `POST /api/recommend/rank`
- `POST /api/visits/{user_id}`
- `POST /api/visits/{user_id}/{visit_id}/dishes`
- `GET  /api/visits/{user_id}`
- `DELETE /api/visits/{user_id}/{visit_id}`
