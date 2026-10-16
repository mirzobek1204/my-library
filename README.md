# My Library Production Web Application

A full-stack book library application built with FastAPI, PostgreSQL, SQLAlchemy, and a native HTML/CSS/JavaScript frontend.

## Features
- Secure authentication (Argon2 password hashing & JWT tokens).
- User-specific private library data isolation.
- Full CRUD operations for books.
- Rate-limiting and security headers.
- Automated testing with Pytest and GitHub Actions.

## Local Setup
1. Clone the repository.
2. Install dependencies: `pip install -r requirements.txt`
3. Run local server: `uvicorn backend.main:app --reload`