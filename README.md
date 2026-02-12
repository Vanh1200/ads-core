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

## Deployment on Railway (Monolith Strategy)

We deploy both Frontend and Backend as a **single service** to save costs and simplify management.

1.  Sign up/Login to [Railway](https://railway.app).
2.  Click **"New Project"** -> **"Deploy from GitHub repo"**.
3.  Select this repository.
4.  Railway will find the `Dockerfile` in the root and start building.
5.  **Configure Variables**:
    -   `PORT`: `3001`
    -   `DATABASE_URL`: Add a PostgreSQL service and link it here.
    -   `JWT_SECRET`: Your secure secret.
    -   `FRONTEND_URL`: The public URL of this service (e.g., `https://ads-core-production.up.railway.app`).
    -   `VITE_API_URL`: **IMPORTANT**: Set this to `/api` (relative path) so the frontend talks to the backend on the same domain.
6.  **Redeploy** to apply changes.

### Development
1.  Frontend: `cd frontend && npm run dev`
2.  Backend: `cd backend && npm run dev`

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

