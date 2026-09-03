"""Pinecone client — product-catalog index, 384-dim cosine, serverless."""
from functools import lru_cache

from pinecone import Pinecone, ServerlessSpec

from app.config import settings

INDEX_NAME = "product-catalog"
DIMENSION = 384
METRIC = "cosine"


@lru_cache(maxsize=1)
def get_pinecone_index():
    if not settings.pinecone_api_key:
        raise RuntimeError("PINECONE_API_KEY must be set")

    pc = Pinecone(api_key=settings.pinecone_api_key)

    existing = [idx.name for idx in pc.list_indexes()]
    if INDEX_NAME not in existing:
        pc.create_index(
            name=INDEX_NAME,
            dimension=DIMENSION,
            metric=METRIC,
            spec=ServerlessSpec(cloud="aws", region="us-east-1"),
        )

    return pc.Index(INDEX_NAME)
