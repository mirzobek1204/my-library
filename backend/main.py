import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from backend.database import engine, Base
from backend import auth_routes, books
from backend.limits import limiter

Base.metadata.create_all(bind=engine)

app = FastAPI(title="My Library Production API", docs_url=None, redoc_url=None) # Production uchun Swagger yopilgan

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

origins = os.getenv("CORS_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    return response

app.include_router(auth_routes.router, prefix="/api/auth", tags=["Auth"])
app.include_router(books.router, prefix="/api/books", tags=["Books"])

@app.get("/health")
def health_check():
    return {"status": "healthy"}