# 💬 ChatApp — Real-time Messenger (Phase 1)

Signal-inspired real-time chat app built with **Node.js + Socket.IO**.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
```
Or for auto-reload during development:
```bash
npm run dev
```

### 3. Open in Browser
```
http://localhost:3000
```

Open multiple tabs to chat between users!

---

## 📁 Project Structure

```
ChatApp/
├── server/
│   └── server.js        # Express + Socket.IO backend
├── client/
│   ├── index.html       # Main UI
│   ├── style.css        # Signal-inspired dark theme
│   └── script.js        # Frontend Socket.IO logic
├── package.json
└── README.md
```

---

## ✅ Phase 1 Features

- 🔌 Real-time messaging via Socket.IO
- 🏠 4 pre-built chat rooms (General, Tech Talk, Random, Gaming)
- 👤 Username-based join (no account needed)
- 💬 Typing indicators (live!)
- 😄 Emoji reactions (right-click on any message)
- 🎨 Signal-inspired dark UI
- 🔢 Online member count per room
- 📱 Mobile-responsive sidebar
- 🎲 Emoji picker
- 🔔 System messages (join/leave events)

---

## 🗺️ Roadmap (Upcoming Phases)

### Phase 2 — Auth & Persistence
- [ ] User accounts with passwords
- [ ] MongoDB/SQLite message history
- [ ] User avatars & profile editing
- [ ] Private direct messages (DMs)

### Phase 3 — Rich Features
- [ ] File/image sharing
- [ ] Message search
- [ ] Read receipts (✓✓)
- [ ] Message editing & deletion
- [ ] Thread replies
- [ ] Notification sounds

### Phase 4 — Polish
- [ ] End-to-end encryption concepts
- [ ] Custom room creation
- [ ] User roles (admin/moderator)
- [ ] Desktop notifications
- [ ] Dark/light theme toggle

---

## 🛠 Tech Stack

| Layer    | Technology          |
|----------|---------------------|
| Runtime  | Node.js             |
| Server   | Express.js          |
| Realtime | Socket.IO           |
| Frontend | Vanilla JS + CSS    |
| Fonts    | DM Sans + DM Mono   |