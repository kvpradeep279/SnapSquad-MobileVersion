# SnapSquad V2

SnapSquad is a face-based group photo organization app that preserves privacy. All face detection and embedding extraction happens locally on the mobile device. The backend acts as a blind coordinator, running HDBSCAN clustering on protected embeddings and storing AES-256 encrypted photo blobs.

## 🛠 Prerequisites

To run this project locally, your machine **must** have the following installed:
1. **Node.js & npm/yarn** (for the Expo React Native app)
2. **Python 3.12+** (for the FastAPI backend)
3. **PostgreSQL** with the **`pgvector`** extension installed (Crucial: the backend will crash without `pgvector`).
4. **Redis** (*Optional for local dev* - Used for the background clustering task queue).

---

## 🖥 Backend Setup (FastAPI)

1. **Navigate to the backend directory:**
   ```bash
   cd backend
   ```

2. **Create and activate a virtual environment:**
   ```bash
   python -m venv venv
   # On Windows: venv\Scripts\activate
   # On Mac/Linux: source venv/bin/activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Environment Variables:**
   Copy the example environment file and fill in your details:
   ```bash
   cp .env.example .env
   ```
   *Make sure to update `DATABASE_URL` with your local Postgres credentials. Generate a random 64-character hex string for `JWT_SECRET`. Cloudflare R2 keys are optional for local development (it will fall back to local encrypted storage).*

5. **Start the API Server (Terminal 1):**
   ```bash
   python scripts/start_api.py
   # Or manually: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```
   *Note: The database tables are automatically created on startup. You do not need to run migrations for local dev.*

6. **Start the Background Worker (Terminal 2) - *Optional for Local Dev*:**
   If you have Redis installed, you can start the background worker to process clustering jobs asynchronously:
   ```bash
   python scripts/start_worker.py
   ```
   *Note: If you do not have Redis or do not run this worker, the backend is designed to gracefully fall back and run the heavy clustering math synchronously on the main thread. It is completely fine to skip this step for local testing!*

---

## 📱 Frontend Setup (Expo React Native)

1. **Navigate to the project root:**
   ```bash
   cd .. # (back to the root snapsquad-app folder)
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Network IP:**
   To allow your physical phone or emulator to talk to your local backend, you must configure the API URL.
   * Open `src/services/api.ts`
   * Change the `BASE_URL` on line 13 to your computer's local Wi-Fi IP address (e.g., `http://192.168.1.5:8000/api/v1`).

4. **Run the App:**
   Because this app uses a custom native module (`modules/expo-image-tensor/`) for local machine learning, you **cannot** use the standard "Expo Go" app. You must compile a custom development build:
   ```bash
   # For Android
   npx expo run:android

   # For iOS (Mac only)
   npx expo run:ios
   ```

## 🔐 Architecture Notes
* **Zero ML on Server:** The backend has zero model files. Detection happens on the device.
* **Privacy:** Photos sent to the backend are already AES-256 encrypted by the frontend. The server never sees raw images.
