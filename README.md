<div align="center">
  <img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" />
  <h1>P2P Electric Motorcycle Sharing (EMRS) API</h1>
  <p>A robust backend service for a Peer-to-Peer Electric Motorcycle Sharing platform, built with NestJS, TypeScript, and Prisma ORM.</p>
</div>

---

## 📖 Overview

The **P2P Electric Motorcycle Sharing API** addresses the growing demand for sustainable, accessible, and affordable urban transportation. By enabling a platform where motorcycle owners can rent out their electric vehicles directly to users, it promotes an eco-friendly sharing economy.

**Problem it solves:** 
Provides a secure and scalable backend ecosystem that seamlessly connects vehicle owners with renters, handling real-time availability, secure payments, vehicle tracking, and automated booking lifecycles.

**Target users:**
- **Vehicle Owners:** Easily list, manage, track, and earn from idle electric motorcycles.
- **Renters:** Discover, book, and intuitively navigate short-term rentals.
- **Administrators:** Oversee platform activity, manage user disputes, verify vehicles, and analyze statistics.

---

## ✨ Features

- **Robust Authentication & Roles:** Secure user sign-up/login with JWTs, Passport strategies, and role-based access control (Admin, User, Owner).
- **Vehicle Listing & Search:** Advanced filtering, geographic mapping, and availability checking for electric motorcycles.
- **Seamless Bookings & Trips:** Complete lifecycle management from booking requests to confirmed reservations and active trip tracking.
- **Real-Time Integration:** In-app notifications using Socket.IO and push notifications integrated with Firebase Admin.
- **Secure Payments:** Payment processing and transaction management via `@payos/node`.
- **Media & File Uploads:** Direct-to-S3 secure file uploads (`@aws-sdk/client-s3`) and image processing using Multer.
- **Event-Driven Architecture:** Asynchronous task processing (e.g., automated email confirmations) using `@nestjs/event-emitter`.
- **Containerized Workflows:** Structured Docker/Docker Compose environments for fast development, testing, and production deployments.

---

## 🛠️ Tech Stack

- **Framework:** NestJS (Node.js)
- **Language:** TypeScript
- **Database:** PostgreSQL
- **ORM:** Prisma Client (`@prisma/client`, `@prisma/adapter-pg`)
- **Real-time Engine:** Socket.io, Firebase Admin
- **Payment Gateway:** PayOS (`@payos/node`)
- **Cloud Storage:** Amazon S3
- **Validation:** `class-validator`, `class-transformer`
- **Testing:** Jest, Supertest
- **Containerization:** Docker, Docker Compose

---

## 📂 Project Structure

A structured, modular approach ensuring scalability and maintainability:

```text
src/
├── admin/          # Admin portal API (user/vehicle management & disputes)
├── auth/           # Authentication strategies, guards, and JWT logic
├── booking/        # Motorcycle booking logic, validations, and lifecycle
├── database/       # Prisma ORM and database connection configuration
├── events/         # Handlers for asynchronous events and background jobs
├── mail/           # Email templates, Nodemailer config, AWS SES setup
├── notification/   # Real-time WebSocket and Firebase push notifications
├── payments/       # PayOS payment gateway integration and webhooks
├── reviews/        # User and vehicle rating systems
├── trips/          # Active trip tracking, start/end trip logic
├── types/          # Shared global TypeScript interfaces and DTOs
├── upload/         # File, document, and image upload service via AWS S3
├── user/           # User profile management and account settings
├── vehicles/       # Electric motorcycle listings, inventory, and location data
└── main.ts         # Application entry point and bootstrap configuration
```

---

## 🚀 Getting Started

Follow these instructions to set up the project locally.

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [PostgreSQL](https://www.postgresql.org/) (if running without Docker)
- [Docker](https://www.docker.com/) & Docker Compose
- API Keys for AWS S3, PayOS, and Firebase.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/DACN-P2P-Electric-Motorbike/P2P-EMRS-API.git
   cd P2P-EMRS-API
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

### Environment Setup

Create a `.env` file based on the provided `.env.example`:
```bash
cp .env.example .env
```

## 💻 Usage

### Running with Docker (Recommended for Local Dev)

To start the complete application setup along with the PostgreSQL database:
```bash
# Build and start development containers
npm run docker:dev

# If you only need the testing db:
npm run test:db:up

# Apply Prisma Database Migrations
npx prisma migrate dev

# Start development server
npm run start

# Start development server in watch mode
npm run start:dev

# Start production server
npm run start:prod
```

---

## 📖 API Documentation

The backend API exposes an interactive Swagger documentation page.
Once the server is running natively or via Docker, visit:

```
http://localhost:3000/api
```

## 🚢 Build & Deployment

The application includes robust deployment configurations via Docker.

```bash
# Build the application
npm run build

# Deploy using Production Docker Compose (downloads images & runs detached)
npm run docker:prod

# Stop the containers
npm run docker:down
```

---

## 🧪 Testing

The platform includes comprehensive test suites spanning from unit, End-to-End, and integration layers.

```bash
# Run unit tests
npm run test:unit

# Run specific feature tests (e.g., member-a functionality)
npm run test:member-a

# Run end-to-end tests
npm run test:e2e

# Get continuous test coverage
npm run test:cov
```

---

## 🤝 Contributing

Guidelines to step into the project and improve the Electric Motorcycle Sharing platform.

1. Fork the Project.
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`).
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the Branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

## 📜 License

Distributed under the **UNLICENSED** License (as defined in `package.json`). See `LICENSE` inside the repository for more details. Include a proper Open-Source license (e.g., MIT, Apache) depending on the project's strategy.
