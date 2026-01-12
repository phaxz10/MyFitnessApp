# MyPersonalFitness - Development Plan

> A personal fitness tracker PWA with offline-first architecture, AI-powered features, and local data storage.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Technical Stack](#technical-stack)
3. [Database Schema](#database-schema)
4. [Feature Specifications](#feature-specifications)
   - [F1: Calorie Tracking](#f1-calorie-tracking)
   - [F2: Workout Tracker](#f2-workout-tracker)
   - [F3: AI Meal Scanner](#f3-ai-meal-scanner)
   - [F4: Weight Tracker & Trends](#f4-weight-tracker--trends)
   - [F5: AI Calorie Target Assistant](#f5-ai-calorie-target-assistant)
   - [F6: Weekly Review System](#f6-weekly-review-system)
   - [F7: AI Program Generator](#f7-ai-program-generator)
5. [User Interface Structure](#user-interface-structure)
6. [Onboarding Flow](#onboarding-flow)
7. [Offline Strategy](#offline-strategy)
8. [Data Export & Backup](#data-export--backup)
9. [Development Phases](#development-phases)
10. [Progress Tracking](#progress-tracking)

---

## Project Overview

### Purpose
A personal-use fitness tracking application focused on simplicity and ease of use. The app prioritizes quick data entry through AI assistance while maintaining full offline functionality.

### Key Principles
- **Simplicity First**: Minimal UI, straightforward workflows
- **Offline First**: All core features work without internet
- **AI Assisted**: Leverage Gemini AI to reduce manual input friction
- **Personal Use**: No authentication, single user, local data only
- **Dark Mode**: Single dark theme throughout

### Core Features
1. Calorie tracking with AI-powered food estimation
2. Resistance training workout tracker with programs
3. AI meal scanner (photo + text analysis)
4. Weight and body composition tracking with trends
5. AI-assisted calorie/macro target calculation
6. **Weekly review system with metabolic response analysis** ✅ NEW
7. **AI workout program generator with science-based principles** ✅ NEW

---

## Technical Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| **Framework** | React 19 | With TypeScript |
| **Build Tool** | Vite 7 | Fast development, PWA plugin available |
| **PWA** | vite-plugin-pwa | Service worker, offline caching |
| **Database** | PGlite | Postgres in WASM, stored in IndexedDB |
| **Styling** | Tailwind CSS v4 | Utility-first, dark mode only |
| **State Management** | Zustand | Lightweight, simple |
| **AI Provider** | Google Gemini API (2.0 Flash) | Vision + text capabilities |
| **Charts** | Recharts | Simple line graphs |
| **Forms** | React Hook Form + Zod | Validation and form state |
| **Linting** | Biome | Fast, modern linter |

### Project Structure (Current)

```
src/
├── components/
│   ├── ui/                 # Reusable UI components (Button, Input, Card, Modal, Select, TextArea, Header, BottomNav)
│   ├── workout/            # Workout-specific components (RestTimer)
│   ├── weekly-review/      # WeeklyReviewButton, WeeklyReviewModal
│   ├── program-generator/  # ProgramGeneratorWizard
│   └── settings/           # ExportModal
├── pages/
│   ├── Dashboard.tsx       # Main dashboard with calorie summary
│   ├── CalorieLog.tsx      # Food entry management with AI analysis
│   ├── MealScanner.tsx     # AI-powered meal scanning
│   ├── Workout.tsx         # Workout overview and program list
│   ├── WorkoutSession.tsx  # Active workout logging with set notes
│   ├── ProgramEditor.tsx   # Create/edit workout programs with supersets
│   ├── ExerciseLibrary.tsx # Manage exercise database with duplicate detection
│   ├── WeightTracker.tsx   # Weight logging and trends
│   ├── Settings.tsx        # Profile, targets, data management
│   └── Onboarding.tsx      # Initial setup flow
├── services/
│   ├── db.ts               # PGlite database setup with schema
│   ├── gemini.ts           # All Gemini AI integrations
│   └── backup.ts           # Export/import functionality (selective export)
├── hooks/
│   ├── useAppStore.ts      # Global app state (Zustand)
│   ├── useProfile.ts       # User profile operations
│   ├── useCalories.ts      # Food entry operations
│   ├── useWeight.ts        # Weight log operations
│   ├── useExercises.ts     # Exercise library operations
│   ├── useWorkoutPrograms.ts # Program/session management
│   ├── useWorkoutLogs.ts   # Workout logging operations
│   ├── useWeeklyReview.ts  # Weekly review data and logic
│   └── useProgramGenerator.ts # AI program generation
├── types/
│   └── index.ts            # TypeScript type definitions
├── schemas/
│   └── forms.ts            # Zod validation schemas
├── utils/
│   ├── calculations.ts     # Body fat %, macro calculations
│   └── date.ts             # Date utilities (local time handling)
├── constants/
│   └── equipment.ts        # Equipment types for program generator
└── App.tsx
```

---

## Database Schema

### Tables (11 tables)

#### `user_profile`
Stores user information for calculations.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key (always 1 for single user) |
| age | INTEGER | User's age |
| gender | TEXT | 'male' or 'female' |
| height_cm | REAL | Height in centimeters |
| activity_level | TEXT | 'sedentary', 'light', 'moderate', 'active' |
| goal | TEXT | 'bulk', 'lean_bulk', 'recomp', 'cut', 'maintain' |
| target_rate_kg_per_week | REAL | Target weight change rate |
| calorie_target | INTEGER | Daily calorie goal |
| protein_target_g | INTEGER | Daily protein goal (grams) |
| carbs_target_g | INTEGER | Daily carbs goal (grams) |
| fat_target_g | INTEGER | Daily fat goal (grams) |
| gemini_api_key | TEXT | Encrypted/stored API key |
| created_at | TIMESTAMP | Record creation date |
| updated_at | TIMESTAMP | Last update date |

#### `weight_logs`
Daily weight and body measurements.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| date | DATE | Log date (unique) |
| weight_kg | REAL | Weight in kilograms |
| waist_cm | REAL | Waist measurement (optional) |
| neck_cm | REAL | Neck measurement (optional) |
| arm_cm | REAL | Arm measurement (optional) |
| body_fat_pct | REAL | Calculated body fat percentage |
| created_at | TIMESTAMP | Record creation date |
| updated_at | TIMESTAMP | Last update date |

#### `food_entries`
Individual food items logged.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| date | DATE | Entry date |
| meal_type | TEXT | 'breakfast', 'lunch', 'dinner', 'snack' |
| food_description | TEXT | User input or AI description |
| portion_grams | REAL | Portion size in grams |
| calories | INTEGER | Estimated calories |
| protein_g | REAL | Protein in grams |
| carbs_g | REAL | Carbohydrates in grams |
| fat_g | REAL | Fat in grams |
| is_ai_generated | BOOLEAN | True if AI estimated |
| created_at | TIMESTAMP | Record creation date |
| updated_at | TIMESTAMP | Last update date |

#### `exercises`
Exercise library.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| name | TEXT | Exercise name |
| description | TEXT | How to perform (AI or manual) |
| muscle_groups | TEXT | Target muscles (comma-separated) |
| equipment | TEXT | Required equipment |
| exercise_type | TEXT | 'reps_weight', 'reps_only', 'duration', 'duration_weight' |
| is_ai_generated | BOOLEAN | True if AI generated |
| created_at | TIMESTAMP | Record creation date |

#### `workout_programs`
Workout program definitions.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| name | TEXT | Program name |
| description | TEXT | Program description |
| sessions_per_week | INTEGER | Number of sessions |
| is_active | BOOLEAN | Currently active program |
| created_at | TIMESTAMP | Record creation date |
| updated_at | TIMESTAMP | Last update date |

#### `program_sessions`
Sessions within a program.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| program_id | INTEGER | Foreign key to workout_programs |
| name | TEXT | Session name (e.g., "Push Day") |
| day_of_week | INTEGER | 0-6 (Sunday-Saturday), nullable for flexible |
| order_index | INTEGER | Order within program |
| created_at | TIMESTAMP | Record creation date |

#### `program_exercises`
Exercises within a program session.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| session_id | INTEGER | Foreign key to program_sessions |
| exercise_id | INTEGER | Foreign key to exercises |
| target_sets | INTEGER | Recommended sets |
| target_rep_min | INTEGER | Minimum rep range (nullable for duration exercises) |
| target_rep_max | INTEGER | Maximum rep range (nullable for duration exercises) |
| target_duration_seconds | INTEGER | For duration-based exercises |
| order_index | INTEGER | Order within session |
| superset_group | INTEGER | Group number for supersets (nullable) |
| notes | TEXT | Additional notes |

#### `workout_logs`
Logged workout sessions.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| program_id | INTEGER | Foreign key to workout_programs (nullable) |
| session_id | INTEGER | Foreign key to program_sessions (nullable) |
| date | DATE | Workout date |
| started_at | TIMESTAMP | Session start time |
| ended_at | TIMESTAMP | Session end time (nullable) |
| notes | TEXT | Session notes |
| created_at | TIMESTAMP | Record creation date |

#### `workout_sets`
Individual sets logged during workout.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| workout_log_id | INTEGER | Foreign key to workout_logs |
| exercise_id | INTEGER | Foreign key to exercises |
| set_number | INTEGER | Set number (1, 2, 3...) |
| reps | INTEGER | Reps performed (nullable for duration) |
| weight_kg | REAL | Weight used in kg |
| duration_seconds | INTEGER | For duration exercises |
| notes | TEXT | Set notes (optional) |
| created_at | TIMESTAMP | Record creation date |

#### `ai_goal_reviews`
History of AI goal reviews.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| review_date | DATE | When review was triggered |
| previous_calorie_target | INTEGER | Target before review |
| new_calorie_target | INTEGER | AI recommended target |
| previous_goal | TEXT | Goal before review |
| new_goal_suggestion | TEXT | AI suggested goal |
| ai_analysis | TEXT | Full AI response/reasoning |
| was_accepted | BOOLEAN | If user accepted recommendations |
| created_at | TIMESTAMP | Record creation date |

#### `weekly_reviews`
Weekly check-in reviews with metabolic analysis.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| week_start | DATE | Start of review week |
| week_end | DATE | End of review week |
| start_weight | REAL | Weight at week start |
| end_weight | REAL | Weight at week end |
| weight_change | REAL | Change during week |
| avg_daily_calories | INTEGER | Average daily intake |
| calorie_target | INTEGER | Target during week |
| calorie_adherence | REAL | Percentage of target |
| workouts_completed | INTEGER | Number of workouts |
| previous_goal | TEXT | Goal at time of review |
| new_goal | TEXT | New goal if changed |
| previous_calorie_target | INTEGER | Target before review |
| new_calorie_target | INTEGER | New target if changed |
| ai_summary | TEXT | AI analysis summary |
| recommendations_applied | TEXT | JSON of accepted recommendations |
| created_at | TIMESTAMP | Record creation date |

---

## Feature Specifications

### F1: Calorie Tracking ✅ COMPLETE

Track daily calorie and macro intake through simple text input with AI-powered estimation.

**Features:**
- AI food analysis from text description
- Manual entry fallback for offline
- Daily/weekly/historical views
- Meal type sections (breakfast, lunch, dinner, snack)
- Edit/delete entries
- Macro breakdown display

### F2: Workout Tracker ✅ COMPLETE

Track resistance training workouts with programs, supersets, and progress tracking.

**Features:**
- Exercise library with AI generation and duplicate detection
- Exercise types: reps_weight, reps_only, duration, duration_weight
- Workout program creation with supersets
- Session scheduling by day of week
- Active workout logging with set notes
- Rest timer component
- Last session comparison display
- Batch AI exercise generation

### F3: AI Meal Scanner ✅ COMPLETE

Scan food photos with optional text description for AI-powered calorie/macro estimation.

**Features:**
- Camera capture and gallery upload
- Gemini Vision API integration
- Editable results with portion adjustment
- Macro recalculation on portion change
- **Meal type selection in results before saving** ✅ NEW
- Save to food entries

### F4: Weight Tracker & Trends ✅ COMPLETE

Daily weight logging with body measurements and trend visualization.

**Features:**
- Weight and measurement logging
- Navy method body fat calculation
- Trend chart with time range selector (7d, 30d, 90d, all)
- Goal progress indicator

### F5: AI Calorie Target Assistant ✅ COMPLETE

AI-powered calculation of daily calorie and macro targets.

**Features:**
- Initial calculation during onboarding
- Recalculation from settings
- Manual override capability
- TDEE-based calculations with goal adjustments

### F6: Weekly Review System ✅ COMPLETE (NEW)

Automated weekly check-in system with AI-powered progress analysis.

**Features:**
- Triggers on Monday with minimum 5 logged days required
- Analyzes weight, calories, and workout data from previous week
- **Metabolic Response Analysis:**
  - Detects "thrifty" (metabolic adaptation), "normal", or "spendthrift" metabolism
  - Compares expected vs actual weight change based on calorie intake
  - Uses 7700 kcal ≈ 1kg formula
- **Recommendations:**
  - Calorie target adjustments
  - Goal change suggestions
  - Diet break recommendations for metabolic adaptation
  - Refeed day suggestions
- Stores review history in database

### F7: AI Program Generator ✅ COMPLETE (NEW)

Generate complete workout programs using evidence-based programming principles.

**Features:**
- Equipment selection with always-available items (bodyweight, bands)
- Experience level consideration (beginner/intermediate/advanced)
- Goal-based programming (bulk, cut, recomp, maintain)
- **Science-Based Programming:**
  - Training split selection by frequency (full body, upper/lower, PPL)
  - Volume guidelines (10-20 sets/muscle/week)
  - Training frequency optimization (2x/week per muscle = 38% more growth)
  - Exercise selection rules (stretch exercises, muscle function coverage)
  - Rep ranges by goal with scientific backing
  - Recovery and day spacing guidelines
  - Specific exercise recommendations by muscle group
- Generates sessions with exercises, sets, reps, and notes
- Superset suggestions for time efficiency
- Weekly volume summary with muscle group breakdown

---

## User Interface Structure

### Navigation
Bottom navigation bar with 4 main sections:
1. **Dashboard** (Home icon)
2. **Calories** (Food/utensils icon)
3. **Workout** (Dumbbell icon)
4. **Weight** (Scale icon)

Additional access via:
- **Settings**: Gear icon in header
- **Meal Scanner**: Camera icon (quick access from Dashboard)

### Routes
- `/` - Dashboard
- `/calories` - Calorie log
- `/scanner` - Meal scanner
- `/workout` - Workout overview
- `/workout/session` - Active workout (no bottom nav)
- `/workout/program/new` - New program
- `/workout/program/:id` - Edit program
- `/exercises` - Exercise library
- `/weight` - Weight tracker
- `/settings` - Settings
- `/onboarding` - Initial setup

---

## Onboarding Flow ✅ COMPLETE

10-step onboarding process:
1. Welcome screen
2. Basic info (age, gender, height)
3. Current weight
4. Activity level
5. Goal selection
6. Target rate (if applicable)
7. API key setup
8. AI calculates targets
9. Review and confirm
10. Dashboard

---

## Offline Strategy ✅ COMPLETE

### Feature Availability

| Feature | Offline | Online |
|---------|---------|--------|
| View Dashboard | Yes | Yes |
| View Calorie Logs | Yes | Yes |
| Add Food (Manual) | Yes | Yes |
| Add Food (AI) | No | Yes |
| Scan Meal | No | Yes |
| Workout Programs | Yes | Yes |
| Log Workout | Yes | Yes |
| Add Exercise (Manual) | Yes | Yes |
| Add Exercise (AI) | No | Yes |
| Log Weight | Yes | Yes |
| View Weight Graph | Yes | Yes |
| Weekly Review | No | Yes |
| AI Program Generator | No | Yes |
| Export Data | Yes | Yes |
| Import Data | Yes | Yes |

---

## Data Export & Backup ✅ COMPLETE

### Export Features
- **Selective Export**: Choose categories to export (Profile, Weight, Calories, Exercises, Programs, Workouts)
- Full JSON export with timestamp
- Proper handling of new columns (exercise_type, superset_group, etc.)

### Import Features
- Full data restore from JSON backup
- Data validation before import
- Confirmation dialog

---

## Development Phases

### Phase 1: Foundation ✅ COMPLETED
- [x] Project setup (Vite, React, TypeScript, Tailwind)
- [x] PWA configuration (vite-plugin-pwa)
- [x] PGlite database setup and schema
- [x] Basic routing structure
- [x] Dark mode theme setup
- [x] Basic UI components
- [x] Navigation bar

### Phase 2: Onboarding & Profile ✅ COMPLETED
- [x] Onboarding flow UI (10 steps)
- [x] User profile storage
- [x] Gemini API integration
- [x] AI calorie target calculation
- [x] Settings page

### Phase 3: Calorie Tracking ✅ COMPLETED
- [x] Food entries CRUD operations
- [x] Daily calorie view UI
- [x] Meal sections
- [x] AI food analysis integration
- [x] Manual entry fallback
- [x] Edit/delete entries
- [x] Weekly/historical view

### Phase 4: Workout Tracker ✅ COMPLETED
- [x] Exercise library CRUD
- [x] AI exercise generation (single + batch)
- [x] Workout program creation
- [x] Program sessions and exercises
- [x] Superset functionality
- [x] Duration-based exercises
- [x] Active program management
- [x] Workout logging session
- [x] Sets/reps/weight tracking
- [x] Set notes during workout
- [x] Rest timer component
- [x] Last session comparison display

### Phase 5: Meal Scanner ✅ COMPLETED
- [x] Camera capture integration
- [x] Gallery upload integration
- [x] Gemini Vision API integration
- [x] Results form with editable portions
- [x] Macro recalculation logic
- [x] Meal type selection in results
- [x] Save to food entries

### Phase 6: Weight Tracker ✅ COMPLETED
- [x] Weight log CRUD
- [x] Body measurements input
- [x] Body fat calculation
- [x] Weight trend chart
- [x] Goal progress indicator
- [x] Time range selector

### Phase 7: Dashboard & Polish ✅ COMPLETED
- [x] Dashboard layout
- [x] Calorie summary widget (ring chart)
- [x] Today's workout widget
- [x] Quick action buttons
- [x] Weight mini-graph
- [x] Loading states
- [x] Error handling
- [x] Empty states

### Phase 8: Data Management ✅ COMPLETED
- [x] Export functionality (selective)
- [x] Import functionality
- [x] Data validation

### Phase 9: Weekly Review System ✅ COMPLETED (NEW)
- [x] Weekly review data collection
- [x] Sufficiency checking (5-day minimum)
- [x] AI weekly analysis prompt
- [x] Metabolic response analysis
- [x] Diet break recommendations
- [x] Weekly review modal UI
- [x] Review history storage

### Phase 10: AI Program Generator ✅ COMPLETED (NEW)
- [x] Equipment selection UI
- [x] Program generator wizard
- [x] Science-based prompt engineering
- [x] Training split selection by frequency
- [x] Volume and exercise guidelines
- [x] Program import to database

### Phase 11: Deployment & Production ✅ COMPLETED
- [x] Vercel SPA routing configuration (vercel.json)
- [x] PWA icons (192x192, 512x512, maskable variants)
- [x] Apple touch icon
- [x] Favicon

---

## Progress Tracking

### What's Complete ✅
- All core features (calorie tracking, workout tracking, meal scanner, weight tracking)
- AI integrations (food analysis, exercise generation, program generation, weekly review)
- Weekly review with metabolic response analysis
- AI program generator with science-based principles
- Superset and duration exercise support
- Selective data export
- PWA deployment ready

### What's Remaining

#### Testing & QA
- [ ] Cross-browser testing (Chrome, Safari, Firefox)
- [ ] PWA installation testing (iOS, Android)
- [ ] Offline functionality testing
- [ ] Mobile responsiveness testing

#### Known Issues
- [ ] None currently tracked

---

## Potential Improvements (Big Wins)

### High Priority - Quick Wins
1. **Clear All Data Function** - Button in Settings to reset app (with confirmation)
2. **Offline Indicator Enhancement** - Clearer status when offline, disable AI features gracefully with tooltips

### Medium Priority - Good Enhancements
3. **Workout History View** - View past workout logs with details (not just comparison)
4. **AI Goal Review in Weight Tracker** - The "Review My Progress" button exists but could use the weekly review system
5. **Exercise Search/Filter** - Search by name, muscle group, or equipment in library
6. **Toast Notifications** - Visual feedback for save/delete/error actions

### Lower Priority - Nice to Have
7. **Charts Improvements** - Better tooltips, animations, body fat trend line
8. **Swipe Gestures** - Swipe between days in calorie log
9. **Quick Copy Meals** - Copy previous day's meals
10. **Water Intake Tracking** - Simple daily water logging
11. **Progress Photos** - Store photos linked to weight entries
12. **Workout Templates** - Quick-start templates for common programs

---

## Notes & Decisions Log

| Date | Decision | Reasoning |
|------|----------|-----------|
| 2026-01-07 | Replaced ESLint with Biome | Faster, modern linter with better DX |
| 2026-01-07 | Used Tailwind v4 | Latest version with improved performance |
| 2026-01-07 | Dark mode only | Simplified theming, matches personal preference |
| 2026-01-07 | Zustand for state | Lightweight, simple API, no boilerplate |
| 2026-01-10 | Weekly review on Monday | Better reflection on full week, 5-day minimum data requirement |
| 2026-01-10 | Metabolic response analysis | Detect adaptation early, suggest diet breaks proactively |
| 2026-01-12 | Science-based program generator | Used Built With Science research for evidence-based programming |

---

## Future Enhancements (Post-MVP)

Ideas for future versions (not in current scope):
- Barcode scanning for packaged foods
- Sleep tracking
- Custom meal recipes (save meals for quick re-entry)
- Social sharing
- Multiple user profiles
- Cloud sync
- Workout analytics (volume trends, strength progression)
- Integration with fitness wearables
- AI form check from video

---

*Last Updated: January 12, 2026*
*Version: 1.1*
