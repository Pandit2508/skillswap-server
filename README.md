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
git clone https://github.com/your-username/skillswap-backend.git
cd skillswap-backend

2. Install dependencies

npm install

Configure environment variables

3. Create a .env file:

PORT=5000
DATABASE_URL=your_postgresql_connection_string
JWT_SECRET=your_secret_key
CLIENT_URL=https://skillswap-client-yv4s.vercel.app

4. Run the server
npm start


⚠️ Notes
Uses PostgreSQL as the primary database
Authentication is handled via HTTP-only cookies
Ensure proper CORS configuration for frontend communication
Backend is deployed on Render

💡 Future Improvements
Real-time chat (WebSockets)
Notification system
Advanced recommendation engine
Rate limiting & security enhancements

👨‍💻 Author
Naman Pandit
GitHub: https://github.com/Pandit2508

🧾 License

This project is licensed under the MIT License.

