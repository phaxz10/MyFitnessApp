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

---

## Technical Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| **Framework** | React 18+ | With TypeScript |
| **Build Tool** | Vite | Fast development, PWA plugin available |
| **PWA** | vite-plugin-pwa | Service worker, offline caching |
| **Database** | PGlite | Postgres in WASM, excellent DX |
| **Styling** | Tailwind CSS v4 | Utility-first, dark mode only |
| **State Management** | Zustand | Lightweight, simple |
| **AI Provider** | Google Gemini API | Vision + text capabilities |
| **Charts** | Recharts | Simple line graphs |
| **Linting** | Biome | Fast, modern linter |

### Project Structure (Current)

```
src/
├── components/
│   ├── ui/                 # Reusable UI components (Button, Input, Card, Modal, etc.)
│   └── workout/            # Workout-specific components (RestTimer)
├── pages/
│   ├── Dashboard.tsx       # Main dashboard with calorie summary
│   ├── CalorieLog.tsx      # Food entry management
│   ├── MealScanner.tsx     # AI-powered meal scanning
│   ├── Workout.tsx         # Workout overview and program list
│   ├── WorkoutSession.tsx  # Active workout logging
│   ├── ProgramEditor.tsx   # Create/edit workout programs
│   ├── ExerciseLibrary.tsx # Manage exercise database
│   ├── WeightTracker.tsx   # Weight logging and trends
│   ├── Settings.tsx        # Profile, targets, data management
│   └── Onboarding.tsx      # Initial setup flow
├── services/
│   ├── db.ts               # PGlite database setup
│   ├── gemini.ts           # Gemini AI integration
│   └── backup.ts           # Export/import functionality
├── hooks/
│   ├── useAppStore.ts      # Global app state (Zustand)
│   ├── useProfile.ts       # User profile operations
│   ├── useCalories.ts      # Food entry operations
│   ├── useWeight.ts        # Weight log operations
│   ├── useExercises.ts     # Exercise library operations
│   ├── useWorkoutPrograms.ts # Program/session management
│   └── useWorkoutLogs.ts   # Workout logging operations
├── types/
│   └── index.ts            # TypeScript type definitions
├── utils/
│   ├── calculations.ts     # Body fat %, etc.
│   └── date.ts             # Date utilities
└── App.tsx
```

---

## Database Schema

### Tables

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
| target_rep_min | INTEGER | Minimum rep range |
| target_rep_max | INTEGER | Maximum rep range |
| order_index | INTEGER | Order within session |
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
| reps | INTEGER | Reps performed |
| weight_kg | REAL | Weight used in kg |
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

---

## Feature Specifications

### F1: Calorie Tracking

#### Description
Track daily calorie and macro intake through simple text input with AI-powered estimation.

#### User Flow
1. User navigates to calorie log or taps quick-add on dashboard
2. Selects meal type (breakfast, lunch, dinner, snack)
3. Enters food description (e.g., "50g cooked rice, 100g pork adobo")
4. If online: AI analyzes and returns estimated calories/macros
5. If offline: Manual entry form for calories/macros
6. User can edit values before saving
7. Entry saved to daily log

#### UI Components
- **Daily View**: Shows total calories consumed vs target, remaining calories
- **Meal Sections**: Collapsible sections for each meal type
- **Entry Card**: Shows food description, portion, calories, macros
- **Add Entry Modal**: Meal selector, text input, AI/manual toggle
- **Edit Entry Modal**: Modify any field of existing entry

#### AI Prompt Template (Gemini)
```
Analyze the following food description and estimate nutritional information.
Return JSON format only.

Food: {user_input}

Return format:
{
  "items": [
    {
      "name": "food item name",
      "portion_grams": estimated_grams,
      "calories": estimated_calories,
      "protein_g": estimated_protein,
      "carbs_g": estimated_carbs,
      "fat_g": estimated_fat
    }
  ],
  "total": {
    "calories": total_calories,
    "protein_g": total_protein,
    "carbs_g": total_carbs,
    "fat_g": total_fat
  }
}
```

#### Offline Behavior
- Manual entry only (text input + manual calorie/macro fields)
- Queue AI requests when back online (optional enhancement)

#### History View
- Default: Current week (7 days)
- Option: View all history (paginated or infinite scroll)
- Handle missed days gracefully (show as empty, not broken)

---

### F2: Workout Tracker

#### Description
Track resistance training workouts based on user-created programs with sets, reps, and weight logging.

#### Components

##### Exercise Library
- List of exercises with name, description, muscle groups, equipment
- Add manually or generate via AI
- AI generates: proper form, execution tips, muscle targets

##### Workout Programs
- User creates program with:
  - Name and description
  - Sessions per week
  - Which days for each session
  - Exercises per session with target sets and rep range
- Multiple programs allowed
- One program set as "active"

##### Workout Session
- Start session from dashboard (today's scheduled workout)
- Or start ad-hoc session
- For each exercise:
  - Show target sets/reps from program
  - Show last session's actual performance (for progressive overload)
  - Log actual sets: reps and weight
  - Add/remove sets as needed
- Rest timer: Simple countdown, select minutes (1-5), start/stop

#### User Flow - Creating Program
1. Navigate to Programs page
2. Tap "Create Program"
3. Enter name, description
4. Set sessions per week
5. For each session:
   - Name the session (e.g., "Push Day")
   - Assign day(s) of week
   - Add exercises from library
   - Set target sets and rep range per exercise
6. Save program
7. Set as active if desired

#### User Flow - Logging Workout
1. Dashboard shows today's scheduled workout (if any)
2. Tap "Start Workout"
3. See list of exercises with targets
4. For each exercise:
   - View last session's performance
   - Log each set (reps, weight)
   - Use rest timer between sets
5. Complete workout
6. Session saved with timestamp

#### AI Prompt Template (Exercise Generation)
```
Generate exercise details for: {exercise_name}

Return JSON format:
{
  "name": "exercise name",
  "description": "Step-by-step execution instructions",
  "muscle_groups": ["primary", "secondary"],
  "equipment": "required equipment",
  "tips": ["form tip 1", "form tip 2"]
}
```

#### Offline Behavior
- Full functionality (all data local)
- AI exercise generation requires connection

---

### F3: AI Meal Scanner

#### Description
Scan food photos with optional text description for AI-powered calorie/macro estimation.

#### User Flow
1. Navigate to meal scanner or tap scan icon
2. Select meal type (breakfast, lunch, dinner, snack)
3. Choose input method:
   - Capture photo (camera)
   - Upload from gallery
4. Optionally add text description for better accuracy
5. Submit for AI analysis
6. AI returns:
   - Identified food items
   - Estimated portions (grams)
   - Calories and macros per item
7. User sees editable form:
   - Each item with portion field (grams)
   - Macros recalculate on portion change
8. Save to meal log or continue editing

#### UI Components
- **Scanner Page**: Camera preview, gallery button, text input
- **Results Form**: List of identified items, editable portions
- **Macro Display**: Per-item and total calories/macros
- **Action Buttons**: Save, Edit, Retry, Manual Entry

#### AI Prompt Template (Gemini Vision)
```
Analyze this food image and estimate nutritional information.
Additional context from user: {text_description}

All portions should be estimated in grams.

Return JSON format only:
{
  "items": [
    {
      "name": "identified food item",
      "portion_grams": estimated_grams,
      "calories": estimated_calories,
      "protein_g": estimated_protein,
      "carbs_g": estimated_carbs,
      "fat_g": estimated_fat,
      "confidence": "high/medium/low"
    }
  ],
  "total": {
    "calories": total_calories,
    "protein_g": total_protein,
    "carbs_g": total_carbs,
    "fat_g": total_fat
  }
}
```

#### Portion Editing Logic
When user edits portion_grams:
- Recalculate calories and macros proportionally
- Formula: `new_value = original_value * (new_portion / original_portion)`

#### Fallback
- If AI cannot identify: Show error, offer manual entry
- If confidence is low: Highlight for user review

#### Offline Behavior
- Feature unavailable (requires AI)
- Show message: "Meal scanner requires internet connection"
- Offer manual entry as alternative

---

### F4: Weight Tracker & Trends

#### Description
Daily weight logging with body measurements, body fat estimation, and visual trend tracking.

#### Data Captured
- **Weight**: In kilograms (required)
- **Body Measurements** (optional):
  - Waist circumference (cm)
  - Neck circumference (cm)
  - Arm circumference (cm)
- **Body Fat %**: Auto-calculated from measurements using Navy formula

#### Body Fat Calculation (Navy Method)
**For Men:**
```
Body Fat % = 495 / (1.0324 - 0.19077 * log10(waist - neck) + 0.15456 * log10(height)) - 450
```

**For Women:**
```
Body Fat % = 495 / (1.29579 - 0.35004 * log10(waist + hip - neck) + 0.22100 * log10(height)) - 450
```

Note: We'll use the male formula since hip measurement isn't captured. Can add later if needed.

#### User Flow
1. Navigate to weight tracker
2. Tap "Log Weight"
3. Enter weight (required)
4. Optionally enter body measurements
5. Body fat % auto-calculated if measurements provided
6. Save entry

#### Visualization
- **Line Graph**: Weight over time
- **Default View**: Last 30 days
- **Options**: 7 days, 30 days, 90 days, all time
- **Goal Indicator**: 
  - Green line/zone: On track with goal
  - Red line/zone: Off track

#### Goal Progress Logic
Based on user's goal:
- **Bulk/Lean Bulk**: Weight should trend upward
- **Cut**: Weight should trend downward
- **Maintain/Recomp**: Weight should stay stable

Compare weekly average to previous week:
- If direction matches goal: Green indicator
- If direction opposes goal: Red indicator

#### AI Goal Review Feature
- Manual trigger button (e.g., "Review My Progress")
- Recommended after 3-6 months of data
- AI analyzes:
  - Weight trend over time
  - Current vs target progress
  - Adherence to calorie targets
- AI outputs:
  - Updated calorie target recommendation
  - Program adjustment suggestions
  - Goal change recommendation if appropriate
- User can accept or dismiss recommendations

#### AI Prompt Template (Goal Review)
```
Review my fitness progress and provide recommendations.

Current Profile:
- Age: {age}, Gender: {gender}, Height: {height}cm
- Goal: {goal}
- Target rate: {target_rate}kg/week
- Current calorie target: {calorie_target}

Weight History (last {n} months):
{weight_data_summary}

Calorie Adherence:
- Average daily intake: {avg_calories}
- Days logged: {days_logged}
- Target adherence: {adherence_pct}%

Current weight: {current_weight}kg
Starting weight: {starting_weight}kg
Weight change: {weight_change}kg over {period}

Analyze my progress and provide:
1. Assessment of current progress vs goal
2. Recommended calorie target adjustment (if any)
3. Suggested goal change (if appropriate)
4. Any other recommendations

Return JSON format:
{
  "assessment": "text analysis of progress",
  "on_track": true/false,
  "recommendations": {
    "calorie_target": new_target_or_null,
    "protein_g": new_protein_or_null,
    "carbs_g": new_carbs_or_null,
    "fat_g": new_fat_or_null,
    "goal_change": "suggested_goal_or_null",
    "reasoning": "why these changes"
  },
  "program_suggestions": "any workout program advice"
}
```

#### Offline Behavior
- Weight logging: Full functionality
- Trend graph: Full functionality
- AI Goal Review: Requires connection

---

### F5: AI Calorie Target Assistant

#### Description
AI-powered calculation of daily calorie and macro targets based on user profile and goals.

#### Initial Setup (Onboarding)
Collects:
1. **Age**: Number input
2. **Gender**: Male/Female selection
3. **Height**: In centimeters
4. **Current Weight**: In kilograms
5. **Activity Level**: 
   - Sedentary (little or no exercise)
   - Light (light exercise 1-3 days/week)
   - Moderate (moderate exercise 3-5 days/week)
   - Active (hard exercise 6-7 days/week)
6. **Goal**:
   - Bulk (aggressive muscle gain)
   - Lean Bulk (slow muscle gain, minimize fat)
   - Recomp (maintain weight, change composition)
   - Cut (fat loss)
   - Maintain (stay current)
7. **Target Rate**: kg per week (for bulk/cut goals)

#### AI Calculation
Send profile to Gemini for personalized targets:

```
Calculate daily calorie and macro targets for:

Profile:
- Age: {age}
- Gender: {gender}
- Height: {height}cm
- Weight: {weight}kg
- Activity Level: {activity_level}
- Goal: {goal}
- Target Rate: {target_rate}kg/week

Provide personalized daily targets considering the goal and sustainable progress.

Return JSON format:
{
  "calorie_target": daily_calories,
  "protein_g": protein_grams,
  "carbs_g": carb_grams,
  "fat_g": fat_grams,
  "reasoning": "brief explanation of calculation"
}
```

#### Manual Override
- User can manually edit any target
- Edited values persist until next recalculation
- Clear indication when values are manually overridden

#### Recalculation
- Available anytime via Settings
- Uses current profile data (including latest weight)
- Replaces current targets with new AI recommendations
- User confirms before applying

#### Display
- **Dashboard**: Always visible
  - Calorie target (e.g., "2500 kcal")
  - Remaining calories (e.g., "1200 remaining")
  - Progress bar or ring
- **Macro targets**: Visible in detailed view or daily log

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
- **Meal Scanner**: Camera icon (quick access from Calories or Dashboard)

### Pages

#### Dashboard
- **Header**: App name, settings icon
- **Calorie Summary Card**:
  - Target calories
  - Consumed calories
  - Remaining calories
  - Macro breakdown (P/C/F)
- **Today's Workout Card** (if scheduled):
  - Session name
  - "Start Workout" button
- **Quick Actions**:
  - Log Food
  - Scan Meal
  - Log Weight
- **Weight Trend Mini-Graph**: Last 7 days

#### Calories Page
- **Date Selector**: Navigate between days
- **Daily Summary**: Total calories/macros
- **Meal Sections**: 
  - Breakfast (collapsible)
  - Lunch (collapsible)
  - Dinner (collapsible)
  - Snacks (collapsible)
- **Add Entry FAB**: Opens meal type selector then input

#### Workout Page
- **Active Program Card**: Current program name and schedule
- **Today's Session**: If scheduled, show exercises
- **Quick Actions**: Start Workout, View Programs
- **Recent Workouts**: Last 3-5 sessions

#### Programs Sub-page
- **Program List**: All created programs
- **Active Badge**: Indicates current active program
- **Create Program Button**

#### Workout Session Page (Active)
- **Header**: Session name, timer
- **Exercise List**: 
  - Exercise name
  - Target sets x reps
  - Last session's performance
  - Logged sets (reps @ weight)
  - Add set button
- **Rest Timer**: Floating or fixed component
- **Complete Workout Button**

#### Weight Page
- **Log Weight Button**
- **Current Stats**: Latest weight, body fat %
- **Trend Graph**: Weight over time
- **Goal Indicator**: On/off track
- **Time Range Selector**: 7d, 30d, 90d, All
- **AI Review Button**: "Review My Progress"

#### Settings Page
- **Profile Section**: Edit age, gender, height, activity level
- **Goals Section**: Edit goal, target rate
- **Targets Section**: View/edit calorie and macro targets
- **Recalculate Button**: Trigger AI recalculation
- **API Key**: Manage Gemini API key
- **Data Management**:
  - Export Data (JSON)
  - Import Data (restore backup)
  - Clear All Data (with confirmation)
- **About**: App version, links

#### Onboarding Pages
Multi-step form:
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

## Onboarding Flow

### Step-by-Step

1. **Welcome**
   - App logo and name
   - Brief description
   - "Get Started" button

2. **Basic Information**
   - Age (number input)
   - Gender (male/female toggle)
   - Height (cm input)

3. **Current Weight**
   - Weight input (kg)
   - This becomes first weight log entry

4. **Activity Level**
   - Visual cards for each level
   - Description of what each means

5. **Fitness Goal**
   - Cards: Bulk, Lean Bulk, Recomp, Cut, Maintain
   - Brief description of each

6. **Target Rate** (skip if Maintain/Recomp)
   - Slider or input: 0.25 - 1.0 kg/week
   - Recommendation shown based on goal

7. **API Setup**
   - Gemini API key input
   - Link to get API key
   - "Skip for now" option (limits AI features)

8. **Calculating...**
   - Loading state
   - AI calculates personalized targets

9. **Your Targets**
   - Display calculated targets
   - Option to adjust manually
   - "Confirm" button

10. **Ready!**
    - Success message
    - "Go to Dashboard" button

### Skip/Later Handling
- API key can be added later in Settings
- Without API key: Manual-only mode for all features

---

## Offline Strategy

### Service Worker Caching
Using vite-plugin-pwa with Workbox:

**Cache Strategies:**
- **App Shell**: Cache-first (HTML, CSS, JS, fonts)
- **Images**: Cache-first with fallback
- **API Calls**: Network-first, fall back to cache (for Gemini)

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
| AI Goal Review | No | Yes |
| Export Data | Yes | Yes |
| Import Data | Yes | Yes |

### Offline Indicators
- Show connection status in header
- Toast notification when going offline/online
- Disable AI buttons with tooltip when offline

---

## Data Export & Backup

### Export Format
JSON file containing all tables:

```json
{
  "version": "1.0",
  "exported_at": "2024-01-15T10:30:00Z",
  "data": {
    "user_profile": { ... },
    "weight_logs": [ ... ],
    "food_entries": [ ... ],
    "exercises": [ ... ],
    "workout_programs": [ ... ],
    "program_sessions": [ ... ],
    "program_exercises": [ ... ],
    "workout_logs": [ ... ],
    "workout_sets": [ ... ],
    "ai_goal_reviews": [ ... ]
  }
}
```

### Export Process
1. User taps "Export Data" in Settings
2. App queries all tables
3. Generates JSON with timestamp
4. Triggers download: `mypersonalfitness-backup-{date}.json`

### Import Process
1. User taps "Import Data" in Settings
2. File picker opens for JSON
3. App validates file structure
4. Confirmation dialog: "This will replace all existing data"
5. If confirmed:
   - Clear all existing data
   - Insert imported data
   - Refresh app state
6. Success/error toast

### Validation
- Check file has correct version/structure
- Validate required fields exist
- Handle missing optional fields gracefully

---

## Development Phases

### Phase 1: Foundation ✅ COMPLETED
- [x] Project setup (Vite, React, TypeScript, Tailwind)
- [x] PWA configuration (vite-plugin-pwa)
- [x] PGlite database setup and schema
- [x] Basic routing structure
- [x] Dark mode theme setup
- [x] Basic UI components (Button, Input, Card, Modal, Select, TextArea, Header, BottomNav)
- [x] Navigation bar

### Phase 2: Onboarding & Profile ✅ COMPLETED
- [x] Onboarding flow UI (10 steps)
- [x] User profile storage
- [x] Gemini API integration (basic)
- [x] AI calorie target calculation
- [x] Settings page (profile, targets, API key)

### Phase 3: Calorie Tracking ✅ COMPLETED
- [x] Food entries CRUD operations
- [x] Daily calorie view UI
- [x] Meal sections (breakfast, lunch, dinner, snacks)
- [x] AI food analysis integration
- [x] Manual entry fallback
- [x] Edit/delete entries
- [x] Weekly/historical view

### Phase 4: Workout Tracker ✅ COMPLETED
- [x] Exercise library CRUD
- [x] AI exercise generation
- [x] Workout program creation
- [x] Program sessions and exercises
- [x] Active program management
- [x] Workout logging session
- [x] Sets/reps/weight tracking
- [x] Rest timer component
- [x] Last session comparison display

### Phase 5: Meal Scanner ✅ COMPLETED
- [x] Camera capture integration
- [x] Gallery upload integration
- [x] Gemini Vision API integration
- [x] Results form with editable portions
- [x] Macro recalculation logic
- [x] Save to food entries

### Phase 6: Weight Tracker ✅ COMPLETED
- [x] Weight log CRUD
- [x] Body measurements input
- [x] Body fat calculation
- [x] Weight trend chart
- [x] Goal progress indicator
- [x] Time range selector
- [ ] AI goal review feature (UI exists, needs implementation)

### Phase 7: Dashboard & Polish ✅ COMPLETED
- [x] Dashboard layout
- [x] Calorie summary widget (ring chart)
- [x] Today's workout widget
- [x] Quick action buttons
- [x] Weight mini-graph
- [x] Offline indicators (basic)
- [x] Loading states
- [x] Error handling
- [x] Empty states

### Phase 8: Data Management & Testing ✅ COMPLETED
- [x] Export functionality
- [x] Import functionality
- [x] Data validation
- [ ] Cross-browser testing
- [ ] Mobile responsiveness testing
- [ ] Offline functionality testing
- [ ] PWA installation testing
- [ ] Bug fixes and polish

---

## Progress Tracking

### Checklist

#### Foundation ✅
- [x] Vite + React + TypeScript setup
- [x] Tailwind CSS v4 configuration
- [x] PWA manifest and service worker
- [x] PGlite integration
- [x] Database schema implementation
- [x] Basic component library
- [x] Routing setup
- [x] Navigation component

#### User Profile & Settings ✅
- [x] Onboarding flow (all steps)
- [x] Profile CRUD
- [x] Settings page
- [x] API key management
- [x] Manual target override

#### Calorie Tracking ✅
- [x] Add food entry (manual)
- [x] Add food entry (AI)
- [x] Edit food entry
- [x] Delete food entry
- [x] Daily view
- [x] Meal type sections
- [x] Weekly view
- [x] Historical view
- [x] Calorie/macro totals

#### Workout Tracker ✅
- [x] Exercise library view
- [x] Add exercise (manual)
- [x] Add exercise (AI)
- [x] Create workout program
- [x] Edit workout program
- [x] Delete workout program
- [x] Set active program
- [x] View program schedule
- [x] Start workout session
- [x] Log sets/reps/weight
- [x] View last session data
- [x] Rest timer
- [x] Complete workout

#### Meal Scanner ✅
- [x] Camera capture
- [x] Gallery upload
- [x] Text description input
- [x] AI image analysis
- [x] Editable results form
- [x] Portion adjustment
- [x] Save to log

#### Weight Tracker ✅
- [x] Log weight
- [x] Log measurements
- [x] Body fat calculation
- [x] Weight history view
- [x] Trend chart
- [x] Goal progress indicator
- [ ] AI goal review (partial - needs implementation)

#### Dashboard ✅
- [x] Calorie summary card
- [x] Today's workout card
- [x] Quick action buttons
- [x] Weight mini-chart
- [x] Remaining calories display

#### Data Management ✅
- [x] Export to JSON
- [x] Import from JSON
- [x] Data validation
- [ ] Clear data function (in Settings)

#### Polish (In Progress)
- [x] Loading states
- [x] Error handling
- [x] Empty states
- [x] Responsive design (mobile-first)
- [ ] PWA installation testing
- [ ] Offline indicators enhancement

---

## What's Next

### Immediate Tasks
1. **AI Goal Review Implementation** - Wire up the "Review My Progress" button in Weight Tracker to call the AI and display recommendations
2. **Clear All Data Function** - Add confirmation modal and implement in Settings
3. **Offline Indicator Enhancement** - Show clearer status when offline, disable AI features gracefully

### Testing & Polish
1. Test PWA installation on iOS and Android
2. Test offline functionality thoroughly
3. Cross-browser testing (Chrome, Safari, Firefox)
4. Performance optimization (lazy loading, code splitting)
5. Fix any remaining linter warnings

### Optional Enhancements
1. Workout history detail view (view past workout logs)
2. Exercise search/filter improvements
3. Charts enhancements (better tooltips, animations)
4. Toast notifications for actions
5. Swipe gestures for navigation

---

## Notes & Decisions Log

Use this section to track important decisions and changes during development.

| Date | Decision | Reasoning |
|------|----------|-----------|
| 2026-01-07 | Replaced ESLint with Biome | Faster, modern linter with better DX |
| 2026-01-07 | Used Tailwind v4 | Latest version with improved performance |
| 2026-01-07 | Dark mode only | Simplified theming, matches personal preference |
| 2026-01-07 | Zustand for state | Lightweight, simple API, no boilerplate |

---

## Future Enhancements (Post-MVP)

Ideas for future versions (not in current scope):
- Barcode scanning for packaged foods
- Water intake tracking
- Sleep tracking
- Custom meal recipes
- Social sharing
- Multiple user profiles
- Cloud sync
- Workout history analytics
- Progress photos
- AI-generated workout programs
- Integration with fitness wearables

---

*Last Updated: January 7, 2026*
*Version: 1.0*
