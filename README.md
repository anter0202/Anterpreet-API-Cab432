# Anterpreet API – Cloud Services Assignment 2

This project is a **Node.js/Express-based cloud service** developed for CAB432 Cloud Computing.  
It demonstrates a production-ready REST API with authentication, secure storage, AWS integration, deployment on EC2, and thorough documentation.

---

## 🚀 Features

- **Authentication & Authorisation**
  - Secure **JWT-based authentication** with refresh tokens.
  - Passwords stored using **bcrypt hashing**.
  - Role-based access control (e.g., `admin` vs `user`) enforced at route level.
  - Token expiry and refresh implemented for security.

- **Image Storage**
  - Full image upload → store → retrieve pipeline.
  - Files stored in **AWS S3** using the AWS SDK v3.
  - Presigned URLs for secure client access.
  - Metadata persisted in the relational database.

- **Deployment**
  - Deployed on **AWS EC2** with Nginx reverse proxy and PM2 process manager.
  - Environment variables configured with `.env` and AWS Secrets Manager.
  - Logs streamed and monitored via AWS CloudWatch.

- **Security**
  - Input validation using **Zod** for all mutating routes.
  - `helmet` and rate-limiting enabled for HTTP security.
  - CORS policies tailored for dev/prod environments.
  - Centralised error handler with consistent JSON responses.

- **API Design**
  - Clean RESTful endpoints under `/api/v1`.
  - Separate routers for `auth`, `images`, `jobs`, and `admin`.
  - **Swagger/OpenAPI** docs available at `/api/v1/docs`.

- **Testing**
  - Unit & integration tests using **Jest** and **Supertest**.
  - Smoke tests for all critical endpoints.
  - CI/CD pipeline ensures tests pass before deployment.

---

## 🛠️ Tech Stack

- **Backend:** Node.js, Express
- **Database:** PostgreSQL
- **Storage:** AWS S3
- **Auth:** JWT, bcrypt
- **Deployment:** AWS EC2, Nginx, PM2
- **Observability:** Morgan, CloudWatch
- **Security:** Helmet, CORS, Zod validation

---

## 📂 Project Structure

```
├── src
│   ├── routes
│   │   ├── auth.js
│   │   ├── images.js
│   │   ├── jobs.js
│   │   └── admin.js
│   ├── middleware
│   │   └── error.js
│   ├── services
│   │   ├── imageStore.js
│   │   └── db.js
│   └── server.js
├── tests
│   └── api.test.js
├── client
│   └── index.html
├── .env.example
├── package.json
└── README.md
```

---

## 🔑 Endpoints Overview

### Authentication
- `POST /api/v1/auth/register` – Register new user  
- `POST /api/v1/auth/login` – Login and get JWT  
- `POST /api/v1/auth/refresh` – Refresh access token  

### Images
- `POST /api/v1/images` – Upload image to S3  
- `GET /api/v1/images/:id` – Get presigned URL for image  
- `DELETE /api/v1/images/:id` – Delete image  

### Jobs (Protected)
- `GET /api/v1/jobs` – Retrieve user jobs  
- `POST /api/v1/jobs` – Create a job  

### Admin (Protected – Admin Only)
- `GET /api/v1/admin/users` – List all users  
- `DELETE /api/v1/admin/users/:id` – Remove a user  

### Health & Docs
- `GET /api/v1/healthz` – Health check  
- `GET /api/v1/docs` – Swagger API documentation  

---

## 📦 Setup Instructions

### Prerequisites
- Node.js v18+
- PostgreSQL database
- AWS account with S3 bucket + IAM credentials
- EC2 instance (for deployment)

### Local Development
```bash
git clone https://github.com/your-repo/Anterpreet-API-Cab432-main.git
cd Anterpreet-API-Cab432-main
npm install
cp .env.example .env
npm run dev
```

### Testing
```bash
npm test
```

### Deployment
- Configure Nginx reverse proxy.
- Use PM2 to manage the Node process:
  ```bash
  pm2 start src/server.js --name anterpreet-api
  ```
- Set environment variables via AWS Secrets Manager or `.env`.

---

## 📖 Documentation

Full API reference available at:  
➡️ [Deployed Swagger Docs](http://your-ec2-public-dns/api/v1/docs)  

---

## ✅ Assessment Criteria Coverage

- **Auth** → Complete JWT + role-based system.  
- **Storage** → AWS S3 integration with presigned URLs.  
- **Deploy** → Running on EC2 with production config.  
- **Security** → Validations, headers, rate limits, error handling.  
- **Docs** → Swagger, README, and endpoint guide.  
