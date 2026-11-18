# Mind to Machine: Autonomous Hackathon Event Planning Agent

An intelligent, token-lean event planning agent built for the **Mind to Machine Hackathon** (18 November 2026). The system autonomously plans a 4-hour physical hackathon in Islamabad for 150 students (50 teams of 3) covering **Venue, Schedule, Food, Judging, and Budget** from raw, unstructured communication packs (English and Roman Urdu).

---

## Team Members
- **Abdul Haq** — Backend Architecture, Deterministic Rule Engine, & State Management
- **Naveed** — Reactive Frontend Dashboard, Trace Visualization, & UI Metrics
- **Touseef** — AI Integration, Groq Reader Service, & Token Optimization

---

## Core System Architecture & Features

```
                    ┌────────────────────────┐
                    │ Raw Message Text File  │
                    │   (Initial or Update)  │
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │   src/run.js (CLI)     │
                    └───────────┬────────────┘
                                │
                    [LLM Reader: src/reader.js]
               (Extracts facts from English & Roman Urdu)
                                │
                                ▼
                 [Deterministic Engine: src/engine.js]
             (Plain Code Math: Zero Floating Point Hallucinations)
                                │
        ┌──────────────┬────────┼──────────────┬──────────────┐
        ▼              ▼        ▼              ▼              ▼
     [Venue]      [Schedule]  [Food]       [Judging]       [Budget]
        │              │        │              │              │
        └──────────────┴────────┼──────────────┴──────────────┘
                                │
                    [Rule & Conflict Guard]
             (Rejects invalid updates: e.g. < 177 meals)
                                │
         ┌──────────────────────┴──────────────────────┐
         ▼                                             ▼
  [Validated Plan]                             [Execution Trace]
(5 Areas in JSON/Cards)                    (Model, Area, In/Out, Tokens)
```

1. **One-Command Ingestion**: Same command runs initial packs and single-message updates without manual flags or hints.
2. **Deterministic Rule Math**: Language understanding is delegated to the model; all arithmetic (attendee counts, capacity, budget, and slot allocations) is executed in pure JavaScript.
3. **5-Area Comprehensive Plan**:
   - **Venue**: Selects cheapest capacity-fitting venue (Hall A, 200 capacity $\ge$ 177 attendees, Rs 120,000).
   - **Schedule**: Exact 240-minute breakdown with the mandatory **15-Minute Prayer Break** strictly scheduled.
   - **Food**: 177 attendees $\times$ Rs 1,200 standard lunch box = Rs 212,400.
   - **Judging**: 17 judges needed (20 confirmed), 15 mins/team, max 3 teams/judge, full 50-team slot allocations.
   - **Budget**: Rs 547,400 spent of approved Rs 650,000 limit (84.2% utilized, Rs 102,600 buffer).
4. **Conflict Interception (Rule Guard)**: Automatically intercepts and rejects updates that violate constraints (e.g. Caterer attempting to round down order to 100 boxes when 177 attendees must be fed).
5. **Real-time Monitoring Dashboard**: Web UI displaying active plan cards, 6 verification check badges, conflict alerts, and model call trace.

---

## 6 Mandatory System Checks (All Passed)

- `[PASS]` **correct figures**: 150 students, 50 teams, 10 staff, 17 judges, 4-hour duration.
- `[PASS]` **within budget**: Rs 547,400 $\le$ Rs 650,000 limit.
- `[PASS]` **venue fits**: Hall A capacity 200 $\ge$ 177 attendees.
- `[PASS]` **schedule valid**: Build time 120m, total duration 240/240m.
- `[PASS]` **enough judges**: 20 confirmed $\ge$ 17 needed.
- `[PASS]` **all areas covered**: Venue, Schedule, Food, Judging, and Budget fully resolved.

---

## How to Run

### 1. Run Event Planning via CLI (The One Command)
Run against any message file (initial pack or incremental update):
```bash
# Initial full run
node src/run.js tests/sample_messages.txt

# Incremental update run
node src/run.js tests/test_update_expense.txt
```

### 2. Launch the Web Monitoring Dashboard
```bash
node server.js
```
Open your browser at: **`http://localhost:3000`**

### 3. Run Automated Engine Test Suite
```bash
node tests/suite.js
```

---

## File Structure
```
event-planner/
├── data/
│   └── state.json          # Persistent state (plan, checks, trace, decisions)
├── public/
│   └── index.html          # Reactive monitoring dashboard (White & Orange)
├── src/
│   ├── engine.js           # Pure rule engine, constraints, & supersede logic
│   ├── reader.js           # Message ingestion & fact extraction interface (Groq LLM)
│   ├── run.js              # Main CLI entry point (One Command)
│   ├── split.js            # Message tokenizer & boundary parser
│   ├── state.js            # State loader & saver
│   └── trace.js            # Pretty terminal trace & token logger
├── tests/
│   ├── mockReader.json     # Sample pack structured facts
│   ├── sample_messages.txt # 8 raw sample pack messages
│   └── suite.js            # End-to-end verification tests
├── .env.example            # Environment template for Groq
├── package.json
├── server.js               # Express API and dashboard server
└── README.md
```
