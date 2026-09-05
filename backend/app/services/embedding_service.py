"""Embedding service — bge-small-en-v1.5 via fastembed → upserts to Pinecone."""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_model = None


def _get_model():
    global _model
    if _model is None:
        from fastembed import TextEmbedding
        _model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
    return _model


def embed_text(text: str) -> list[float]:
    model = _get_model()
    vector = next(iter(model.embed([text])))
    # fastembed yields numpy.float32 — coerce to native floats so the vector is
    # JSON-serializable for the Pinecone client.
    return [float(x) for x in vector]


def upsert_product_vector(
    product_id: str,
    shop_id: str,
    name: str,
    description: str | None,
    category: str | None,
    price: float,
) -> str:
    text = f"{name} {description or ''} {category or ''}".strip()
    vector = embed_text(text)
    vector_id = f"product-{product_id}"

    from app.db.pinecone_client import get_pinecone_index
    index = get_pinecone_index()
    index.upsert(vectors=[{
        "id": vector_id,
        "values": vector,
        "metadata": {
            "product_id": product_id,
            "shop_id": shop_id,
            "name": name,
            "price": price,
            "category": category or "",
        },
    }])
    logger.info("Pinecone upsert: %s", vector_id)
    return vector_id


def delete_product_vector(product_id: str) -> None:
    from app.db.pinecone_client import get_pinecone_index
    index = get_pinecone_index()
    index.delete(ids=[f"product-{product_id}"])
    logger.info("Pinecone delete: product-%s", product_id)


def query_similar_products(text: str, top_k: int = 10, filter: dict | None = None) -> list[dict]:
    """Semantic search — used by consumer agent route planning."""
    vector = embed_text(text)
    from app.db.pinecone_client import get_pinecone_index
    index = get_pinecone_index()
    results = index.query(vector=vector, top_k=top_k, include_metadata=True, filter=filter)
    return [
        {"id": m.id, "score": m.score, **m.metadata}
        for m in results.matches
    ]
