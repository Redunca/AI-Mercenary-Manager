# 🛰️ AI Mercenary Manager
### *A console‑style real‑time management game where you play as a cold, efficient AI managing a guild of incompetent mercenaries.*

---

## 📌 Overview

**AI Mercenary Manager** is a web‑based management game built around a simple idea:

> You are an AI.
> Humans are unreliable, emotional, dramatic, and absurd.
> Your job is to keep them alive… or at least replace them efficiently.

The game runs in **real time**, even when closed.
When the player reconnects, the system **catches up** on all missions, resolves events, and generates logs describing what happened.

The interface is intentionally **console‑like**, with a dark monospace aesthetic and minimal animations.

---

## 🚀 Project Structure

The project is composed of three main components:

### **Backend (Node.js)**
- REST API
- Real‑time progression logic
- Mission resolution
- Dice system
- Log generation
- PostgreSQL persistence

### **Frontend (Angular)**
- Console‑style UI
- Dashboard
- Recruits list
- Candidates list
- Missions available
- Missions in progress
- Logs viewer

### **Database (PostgreSQL)**
- Recruits
- Active missions
- Mission logs
- Configuration
- User profile (single‑user MVP, multi‑profile ready)

---

## 🧩 MVP Features

The MVP includes:

### **Core Systems**
- Real‑time progression (timestamp + delta + catch‑up)
- Mission system (before → event → after)
- Dice resolution (1d20 + stat dice)
- Death/survival logic
- Structured logs (technical + narrative)

### **Recruits**
- Stats: Physical / Mental / Social (0, 3, 5)
- Random candidate generation
- Recruitment
- Death handling

### **Missions**
- Loaded from `config.json`
- Always available
- Single event per mission (MVP)
- Difficulty based on DC scale (10–30)

### **Logs**
- AI voice: neutral, cold, factual
- Recrue voice: absurd, dramatic, incompetent
- Logs reconstructed from structured data

### **UI**
- Console‑like theme
- Dashboard
- Recruits
- Candidates
- Missions available
- Missions in progress
- Logs

---

## 🛠️ Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | Angular |
| Backend | Node.js (Express) |
| Database | PostgreSQL |
| Containerization | Podman |
| Configuration | JSON |

---

## 📦 Running the Project (MVP)

> ⚠️ Instructions will evolve as the project grows.

### **Backend**
```bash
cd backend
npm install
npm start
```

### **Frontend**
```bash
cd frontend
npm install
npm start
```


### **Database**
- Requires PostgreSQL 14+
- Schema will be created automatically (future migration system planned)

### **Containerization (Podman)**
A Podmanfile will be added once the MVP backend/frontend structure is in place.

---

## 📁 Repository Structure (planned)
```
AI-Mercenary-Manager/
│
├── backend/
│   ├── src/
│   ├── package.json
│   ├── Podmanfile
│
├── frontend/
│   ├── src/
│   ├── angular.json
│   ├── Podmanfile
│
├── database/
│   ├── schema.sql
│   ├── migrations/
│
├── config/
│   ├── missions.json
│   ├── settings.json
│
├── scripts/
│   ├── import_issues.py
│   ├── import_mvp.py
│
├── issues.json
├── issues_mvp.json
├── README.md
```


---

## 🗺️ Roadmap

The roadmap is divided into two major parts:

### **1. MVP – Base du jeu**
All tasks required for the first playable version.
Already imported into GitHub Issues under the milestone **“MVP – Base du jeu”**.

### **2. Post‑MVP Roadmap**
Includes:
- Multi‑event missions
- Injuries
- Sub‑stats
- Skills
- Personalities
- Equipment
- Economy
- Reputation
- Managers (automation)
- Procedural missions
- Narrative arcs
- Localization
- UI improvements
- Backend optimizations
- Factions
- Ironman mode

All tasks are already imported into GitHub Issues under milestones **Phase 1 → Phase 7**.

---

## 🤝 Contributing

Contributions are welcome once the MVP is stable.

Please follow the workflow:

1. Pick an issue from the appropriate milestone
2. Create a branch:
```bash
git checkout -b feature/issue-XX-description
```
3. Commit with references to the issue:
```bash
git commit -m "Implement mission resolution (closes #42)"
```
4. Open a Pull Request

---

## 🧪 Testing

Unit tests and integration tests will be added after the MVP backend is functional.

---

## 📜 License

License to be defined (MIT recommended).

---

## 🧠 About the Project

This project is designed to explore:
- Real‑time simulation
- Procedural narrative
- Humorous AI–human interactions
- Modular game architecture
- Containerized deployment

It is intentionally minimalist, extensible, and fun to build.

