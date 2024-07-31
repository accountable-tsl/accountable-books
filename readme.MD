# Accountable Api

## Overview

**Accountable Api** is the back-end part of a dual-component financial management system designed to help individuals and small to medium-sized businesses manage their financial records more efficiently. The app interfaces with the `accountable-app` to provide a responsive and intuitive user experience.

## Technology Stack

- **Backend**: Node.js, Express, TypeScript, Prisma, PostgreSQL

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- npm (v6 or higher)

### Installation/Setup

1. **Clone the Repository**

```
git clone git@github.com:accountable-tsl/accountable-api.git
```

2. **Navigate to the project directory**

```
cd accountable-api
```

3. **Install Dependencies**

```
npm install
```

4. **Set up the environment variables**

- Copy the `.env.sample` file to `.env` and fill in the required settings.

5. **Database Configuration**

- Create your PostgreSQL database

- Generate prisma client

```
npx prisma generate
```

- Run Database Migrations

```
npx prisma migrate dev --name init
```

- Seed the database

```
npm run seed
```

6. **Start the server**

```
tsx index.ts
```
