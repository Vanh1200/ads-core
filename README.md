# Ads Core System

This repository contains the source code for the Ads Core System.

## Project Structure

- `backend/`: Backend source code.
- `frontend/`: Frontend source code.
- `docker-compose.yml`: Docker composition for running the services.

## Getting Started

1.  Clone the repository.
2.  Navigate to the project directory.
3.  Run `docker-compose up` to start the services.

## Deployment to Railway (Recommended)

Since this project has both Backend and Frontend in one repository (Monorepo), you need to create 2 services in Railway.

### Step 1: Deploy Backend
1.  Sign up/Login to [Railway](https://railway.app).
2.  Click **"New Project"** -> **"Deploy from GitHub repo"**.
3.  Select this repository.
4.  Click **"Add Variables"** (or Settings later) and add:
    -   `PORT`: `3001` (Optional, but good to be explicit).
    -   `JWT_SECRET`: Your secure secret.
    -   `DATABASE_URL`: (We will add this in Step 3).
5.  Go to **Settings** -> **Root Directory**: Set to `/backend`.
6.  Railway will find the `Dockerfile` and deploy.

### Step 2: Deploy Frontend
1.  In the same project, click **"New"** button -> **"GitHub Repo"**.
2.  Select the **SAME repository** again.
3.  Go to **Settings** -> **Root Directory**: Set to `/frontend`.
4.  Go to **Variables** and add:
    -   `VITE_API_URL`: The URL of your Backend service (e.g., `https://web-production-xxxx.up.railway.app/api`).
    -   **Important**: You find the Backend URL in the "Settings" -> "Public Networking" of the Backend service.
5.  Railway will find the `Dockerfile` and deploy.

### Step 3: Add Database
1.  Click **"New"** -> **"Database"** -> **"Add PostgreSQL"**.
2.  Railway will create a database service.
3.  Go to the **Backend Service** -> **Variables**.
4.  Railway often auto-injects `DATABASE_URL`. If not, copy it from the Postgres service "Connect" tab and add it manually.
5.  **Redeploy** the Backend if needed.
## Deployment with Docker (Self-hosted)

Use this if you have a VPS (DigitalOcean Droplet, EC2).


1.  Make sure you have Docker installed.
2.  Run the following command in the root directory:

    ```bash
    docker-compose up --build -d
    ```

3.  The services will be available at:
    -   Frontend: `http://localhost`
    -   Backend: `http://localhost:3001`
    -   Database: `localhost:5432`

### Environment Variables

The `docker-compose.yml` file contains default environment variables. For production, **you must change** the `JWT_SECRET` and consider using a `.env` file or environment variables on your server.

