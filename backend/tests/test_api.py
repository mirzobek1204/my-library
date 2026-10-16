import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import Base, get_db
from backend.main import app

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture()
def client():
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def register_and_login(client, username):
    response = client.post(
        "/api/auth/register",
        json={"username": username, "password": "secure-password-123"},
    )
    assert response.status_code == 200, response.text
    response = client.post(
        "/api/auth/login",
        data={"username": username, "password": "secure-password-123"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": "Bearer " + response.json()["access_token"]}


def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_register_and_login(client):
    headers = register_and_login(client, "testuser")
    assert headers["Authorization"].startswith("Bearer ")


def test_books_require_authentication(client):
    response = client.get("/api/books/")
    assert response.status_code == 401


def test_book_create_list_update_and_delete(client):
    headers = register_and_login(client, "readerone")
    created = client.post(
        "/api/books/",
        headers=headers,
        json={
            "title": "Test book",
            "author": "Test author",
            "status": "planned",
            "language": "en",
            "pages": 120,
            "rating": 4,
            "description": "A test description",
        },
    )
    assert created.status_code == 201, created.text
    book_id = created.json()["id"]
    assert created.json()["title"] == "Test book"

    listed = client.get("/api/books/", headers=headers)
    assert listed.status_code == 200
    assert [book["id"] for book in listed.json()] == [book_id]

    updated = client.put(
        f"/api/books/{book_id}",
        headers=headers,
        json={
            "title": "Updated title",
            "author": "Test author",
            "status": "read",
            "language": "en",
            "pages": 140,
            "rating": 5,
            "description": "Updated description",
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["title"] == "Updated title"
    assert updated.json()["status"] == "read"

    deleted = client.delete(f"/api/books/{book_id}", headers=headers)
    assert deleted.status_code == 200
    assert client.get("/api/books/", headers=headers).json() == []


def test_user_cannot_read_or_modify_another_users_book(client):
    owner_headers = register_and_login(client, "owneruser")
    other_headers = register_and_login(client, "otheruser")
    created = client.post(
        "/api/books/",
        headers=owner_headers,
        json={"title": "Private book", "status": "planned"},
    )
    assert created.status_code == 201, created.text
    book_id = created.json()["id"]

    assert client.get("/api/books/", headers=other_headers).json() == []
    assert client.put(
        f"/api/books/{book_id}",
        headers=other_headers,
        json={"title": "Hijacked", "status": "read"},
    ).status_code == 404
    assert client.delete(f"/api/books/{book_id}", headers=other_headers).status_code == 404
