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
- ⏱️ Overlap-based availability matching  
- 📆 Automatic meeting scheduling  
- 🎥 Video call link generation  
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

---

⚠️ Notes
- Uses PostgreSQL as the primary database (see `schema.sql` for the full table structure)
- Authentication is handled via HTTP-only cookies + JWT
- Auth endpoints (`/signup`, `/login`, `/forgot-password`, `/reset-password`) are rate-limited to guard against brute-force attempts
- Ensure proper CORS configuration for frontend communication
- Backend is deployed on Render

💡 Future Improvements
- Real-time chat (WebSockets)
- Notification system
- Advanced recommendation engine
- CI pipeline (GitHub Actions) running `npm test` on push

👨‍💻 Author
Naman Pandit
GitHub: https://github.com/Pandit2508

🧾 License

This project is licensed under the MIT License.

