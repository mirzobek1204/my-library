from pydantic import BaseModel, Field
from typing import Optional

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)

class UserResponse(BaseModel):
    id: int
    username: str
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class BookBase(BaseModel):
    title: str = Field(..., max_length=140)
    author: Optional[str] = Field(None, max_length=100)
    status: str = "planned"
    genre: Optional[str] = Field(None, max_length=60)
    language: Optional[str] = "uz"
    pages: Optional[int] = Field(0, ge=0, le=100000)
    rating: Optional[float] = Field(0, ge=0, le=5)
    date: Optional[str] = None
    description: Optional[str] = Field(None, max_length=1500)
    cover: Optional[str] = None

class BookCreate(BookBase):
    pass

class BookResponse(BookBase):
    id: int
    owner_id: int
    class Config:
        from_attributes = True