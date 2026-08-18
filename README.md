# RS-NextGen — Interactive Kiosk & Badge Generator

**RS-NextGen** is a full-stack interactive kiosk application designed for SRM orientation and event registration. It allows users/students to go through an interactive questionnaire, capture or upload their photograph, dynamically generate custom sports-themed identity badges, store assets securely, and deliver badges via WhatsApp or instant QR code downloads.

---

## 🌟 Key Features

- 📸 **Live Photo Capture & Upload**: Integrates browser webcam capture and image upload with real-time dynamic preview.
- 🎯 **Interactive Questionnaire & Archetypes**: Tailored quiz flow that determines user personality/sports archetypes.
- 🎨 **Dynamic Badge Canvas Engine**: Fast server-side and client-side canvas rendering using `@napi-rs/canvas` to overlay user details, custom stats, and photo graphics onto styled template badges.
- ⚡ **Asynchronous Background Processing**: High-throughput processing pipeline using **BullMQ** and **Redis** for image rendering and distribution.
- 🗄️ **MinIO Object Storage**: S3-compatible object storage to persist raw user photos cleanly outside the main database.
- 📡 **Real-time Socket Updates**: Live progress updates sent to frontend sessions via **Socket.IO** rooms as badges are processed.
- 📲 **WhatsApp Distribution & QR Fallback**: Automated WhatsApp dispatch with instant QR-code fallback for direct digital downloads.

---

## 🛠️ Tech Stack

### Frontend
- **Framework / Build Tool**: Vite, Vanilla JavaScript / App logic
- **Real-time Communication**: Socket.IO Client
- **Utilities**: `qrcode` (QR generation), HTML5 Canvas

### Backend
- **Runtime & Server**: Node.js, Express.js
- **Canvas Generation**: `@napi-rs/canvas`
- **Database**: MongoDB (via Mongoose)
- **Caching & Message Broker**: Redis (via `ioredis`)
- **Job Queue**: BullMQ
- **Object Storage**: MinIO (`minio` SDK)
- **Process Management**: PM2 (`ecosystem.config.js`)

### Infrastructure & DevOps
- **Containerization**: Docker & Docker Compose (MongoDB, Redis, MinIO)

---

## 📁 Directory Structure

```text
RS-NextGen/
├── backend/
│   ├── assets/              # Template images and graphics for badge generation
│   ├── utils/
│   │   └── canvasGenerator.js # Node canvas rendering logic
│   ├── ecosystem.config.js  # PM2 process configuration for API & Worker
│   ├── server.js            # Express API server & Socket.IO handlers
│   ├── worker.js            # BullMQ background job processing worker
│   ├── .env                 # Backend environment variables configuration
│   └── package.json
├── frontend/
│   ├── src/                 # Frontend source modules
│   ├── public/              # Static public assets
│   ├── App.js               # Core UI flow logic
│   ├── main.js              # Entry JavaScript file
│   ├── style.css            # Styling and visual theme
│   ├── index.html           # Main HTML document
│   └── package.json
└── docker-compose.yml       # Local infrastructure (MongoDB, Redis, MinIO)
```

---

## 🚀 Quick Start Guide

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended)
- [Docker](https://www.docker.com/) & Docker Compose
- `npm` or `yarn`

---

### Step 1: Start Infrastructure Services

Use Docker Compose to start MongoDB, Redis, and MinIO locally:

```bash
docker-compose up -d
```

Services will run on:
- **MongoDB**: `localhost:27018`
- **Redis**: `localhost:6380`
- **MinIO Console**: `http://localhost:9003` (User: `minioadmin` / Pass: `minioadmin`)

---

### Step 2: Configure Environment Variables

Create or update `backend/.env` with the appropriate configurations:

```env
PORT=3001
MONGO_DB=mongodb://127.0.0.1:27018/kiosk
REDIS_HOST=127.0.0.1
REDIS_PORT=6380

MINIO_ENDPOINT=127.0.0.1
MINIO_PORT=9002
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET_NAME=srm-fresher-images

KIOSK_USERNAME=admin
KIOSK_PASSWORD=secretpassword
BACKEND_URL=http://localhost:3001
```

---

### Step 3: Setup & Run Backend

1. Navigate to the backend directory and install dependencies:
   ```bash
   cd backend
   npm install
   ```

2. Run in **Development Mode** (runs server and worker concurrently via Nodemon):
   ```bash
   npm run dev
   ```

3. Run in **Production Mode** (via PM2):
   ```bash
   npm run start
   ```

---

### Step 4: Setup & Run Frontend

1. Open a new terminal, navigate to the frontend directory, and install dependencies:
   ```bash
   cd frontend
   npm install
   ```

2. Start the Vite development server:
   ```bash
   npm run dev
   ```

3. Access the kiosk frontend at `http://localhost:5173`.

---

## 📡 API Endpoints Summary

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/kiosk/login` | Authenticates kiosk terminal session |
| `POST` | `/api/register` | Submits user payload, uploads image to MinIO, saves user record, enqueues badge generation job |
| `POST` | `/api/generate-canvas` | Returns quick preview URL rendered on-the-fly |
| `GET` | `/api/download/:userId` | Serves final generated high-res badge (cached in Redis) |

---

## 📜 License

ISC License. Built for SRM orientation and event interactive kiosks.
