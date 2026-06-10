"""
MongoDB connection.

The same code works in dev and prod — only MONGODB_URI changes:
  - dev:  mongodb://localhost:27017            (local mongod)
  - prod: mongodb+srv://...@cluster.mongodb.net (MongoDB Atlas)

pymongo is synchronous, which suits the sync FastAPI route handlers here
(FastAPI runs them in a threadpool).
"""
from __future__ import annotations

import os

from pymongo import MongoClient

_MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
_MONGODB_DB = os.getenv("MONGODB_DB", "repo_pulse")

client: MongoClient = MongoClient(_MONGODB_URI, serverSelectionTimeoutMS=5000)
db = client[_MONGODB_DB]
