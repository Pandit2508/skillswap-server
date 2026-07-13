# SkillSwap – Backend

This is the backend server for **SkillSwap**, a platform where users connect to exchange skills.  
It handles authentication, user profiles, match requests, availability scheduling, and video meeting coordination.

Built using **Node.js, Express, and PostgreSQL**, the backend powers all core platform functionality and APIs.

---

## 🧠 Features

- 🔐 JWT-based authentication with secure cookies  
- 👤 User profile creation and management  
- 🧩 Skills offered and skills wanted  
- 📅 Multiple availability slots per user  
- 🤝 Send and receive match requests  
- ⚖️ Weighted match suggestions (skill reciprocity + rating + shared availability)  
- ⏱️ Overlap-based availability matching (longest shared window, not first-found)  
- 📆 Automatic meeting scheduling  
- 🎥 Video call link generation  
- 💬 Real-time in-app chat between matched users  
- 🔌 REST APIs for frontend integration  

---

## 🎥 Video Call Integration

SkillSwap uses **Jitsi Meet** for seamless video communication.

### How it works:
- When a match request is accepted, a meeting link is generated automatically  
- Both users join the same room using that link  
- No login or API key required  
- Meetings are accessible only during scheduled time

https://meet.jit.si/skillswap-{requestId}-{timestamp}


### Why Jitsi?
- Free and open-source  
- No complex setup  
- Works directly in the browser  
- Supports multiple participants  

---

## ⚙️ Tech Stack

- **Node.js**  
- **Express.js**  
- **PostgreSQL**  
- **JWT Authentication**  
- **Cookie-based Sessions**  
- **Jitsi Meet**  

---

## 🏗️ Core Responsibilities

- Authentication & session management  
- Profile and skill data handling  
- Match request processing  
- Availability conflict resolution  
- Meeting scheduling logic  
- API endpoints for frontend  

---

## ⚙️ Setup Instructions

### 1. Clone the repository
```bash
git clone https://github.com/Pandit2508/skillswap-server.git
cd skillswap-server
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment variables
Copy `.env.example` to `.env` and fill in your own values:
```bash
cp .env.example .env
```

### 4. Set up the database
Run the schema against your PostgreSQL instance:
```bash
psql "$DATABASE_URL" -f schema.sql
```

### 5. Run the server
```bash
npm start        # production
npm run dev      # with nodemon (auto-restart)
```

### 6. Run tests
```bash
npm test
```

### 7. (Optional) Seed sample data & run benchmarks
Useful for local development or generating real performance numbers:
```bash
node scripts/seed.js 150        # seeds 150 fake users, skills, and availability
node scripts/benchmark.js       # measures index impact + matching throughput
```

---

⚠️ Notes
- Uses PostgreSQL as the primary database (see `schema.sql` for the full table structure)
- Authentication is handled via HTTP-only cookies + JWT
- Auth endpoints (`/signup`, `/login`, `/forgot-password`, `/reset-password`) are rate-limited to guard against brute-force attempts
- Real-time match-request notifications are delivered via Socket.io, authenticated using the same auth cookie
- Post-session ratings are handled via `/api/reviews` — a review can only be left after a booking's `end_time` has passed
- Ensure proper CORS configuration for frontend communication
- Backend is deployed on Render

### 💬 Chat
- `GET /api/messages/conversations` — list conversations (one per accepted match), with last message + unread count
- `GET /api/messages/:userId` — full thread with that user, marks their messages to you as read
- `POST /api/messages/:userId` — send a message; only allowed between users with an **accepted** match request
- Delivered live over the same authenticated Socket.io connection as match-request notifications (`new_message` event); typing indicators via `typing` / `stop_typing`

### ⚖️ Weighted match suggestions
- `GET /api/match-requests/suggestions?limit=10` — ranks other users by a weighted score (`utils/scoring.js`):
  skill reciprocity (do you two actually have something to teach *each other*, not just one-way) × 0.5, average rating × 0.2, size of your best shared availability window × 0.3
- Replaces the old "first overlap wins" scheduling with **largest overlap wins** in `findCommonSlot` (`utils/matching.js`) — used both here and when sending/accepting a request

💡 Future Improvements
- CI pipeline (GitHub Actions) running `npm test` on push
- Integration tests for auth/booking/chat flows with a disposable test database
- Message pagination for very long threads (currently loads the full history at once)

👨‍💻 Author
Naman Pandit
GitHub: https://github.com/Pandit2508

🧾 License

This project is licensed under the MIT License.

