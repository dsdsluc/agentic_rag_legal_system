from __future__ import annotations

import logging
import os
import uuid
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from ingestion.index.embed import get_embedding_model
from ingestion.index.load_vectorstore import load_corpus as load_corpus_chunks
from ingestion.index.vectorstore import get_collection
from rag.retrieval.bm25_index import get_bm25_index
from rag.retrieval.rerank import warm_up as rerank_warm_up
from rag.generation.generate import answer_question
from rag.input.security import is_suspicious

from .schemas import HealthResponse, QueryRequest, QueryResponse

load_dotenv()

# Independent of LangSmith tracing (a paid third-party service that only
# activates when LANGSMITH_TRACING=true) — this is our own stdout log, so
# request/error investigation doesn't depend entirely on one external tool.
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("legal_rag.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-warm the embedding model, Chroma collection, and BM25 index once
    # at startup rather than lazily on the first request, so the first real
    # query isn't the one that eats model-load latency.
    get_embedding_model()
    get_collection()
    get_bm25_index()
    rerank_warm_up()
    yield


app = FastAPI(title="Legal RAG API", version="0.1.0", lifespan=lifespan)

# /query and /documents are called directly from the browser (see
# web/lib/api.ts — NEXT_PUBLIC_API_URL, no Next.js proxy in front), with no
# auth layer at all. Per-IP rate limiting is the minimum guardrail against a
# script hammering an endpoint that can fan out into a dozen-plus OpenAI
# calls per request (see retrieve()'s per-chunk trim step).
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_default_origins = "http://localhost:3000,http://localhost:5173"
_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", _default_origins).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    # A bare "always ok" wasn't actually checking anything — a dead Chroma
    # collection (the most likely real failure) would still report healthy.
    # This touches the collection so a load balancer / uptime check can tell
    # the difference between "process is up" and "can actually serve /query".
    try:
        get_collection().count()
    except Exception:
        logger.exception("health check failed: vector store unavailable")
        raise HTTPException(status_code=503, detail="vector store unavailable")
    return HealthResponse(status="ok")


@app.post("/query", response_model=QueryResponse)
@limiter.limit(os.getenv("QUERY_RATE_LIMIT", "20/minute"))
def query(request: Request, body: QueryRequest) -> QueryResponse:
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="question must not be empty")
    logger.info(
        "query request: mode=%s domain=%s top_k=%s question_len=%d history_len=%d",
        body.mode,
        body.domain or "auto",
        body.top_k,
        len(body.question),
        len(body.history),
    )
    # Cheap, zero-LLM-cost pre-check against common jailbreak/injection
    # phrasings — run before any OpenAI call, on the question and every
    # history turn (a forged "answer" turn is exactly what condense_question
    # treats as untrusted, but there's no reason to even reach that LLM call
    # for an obvious attempt). See rag/input/security.py for what this does and
    # does not catch.
    suspicious_texts = [body.question] + [t.question for t in body.history] + [t.answer for t in body.history]
    for text in suspicious_texts:
        blocked, pattern = is_suspicious(text)
        if blocked:
            logger.warning("query blocked: suspicious input matched pattern=%r", pattern)
            raise HTTPException(
                status_code=400,
                detail="Câu hỏi chứa nội dung không hợp lệ, vui lòng đặt câu hỏi khác.",
            )
    try:
        result = answer_question(
            body.question,
            top_k=body.top_k,
            mode=body.mode,
            domain=body.domain,
            use_graph_expansion=body.use_graph_expansion,
            trim_context=body.trim_context,
            history=[(t.question, t.answer) for t in body.history],
        )
    except Exception:
        # Never leak str(exc) to the client — a raw exception message can
        # carry internal file paths, connection details, or SDK error bodies
        # (OWASP: information disclosure). Full detail goes to the server
        # log with a request id the client CAN see, so a real support
        # request can still be traced back to it.
        request_id = uuid.uuid4().hex[:12]
        logger.exception("query failed (request_id=%s)", request_id)
        raise HTTPException(
            status_code=502,
            detail=f"Đã xảy ra lỗi khi xử lý câu hỏi, vui lòng thử lại sau (mã lỗi: {request_id}).",
        )
    logger.info("query completed: sources=%d", len(result.sources))
    return QueryResponse.from_result(result)


@app.get("/documents")
@limiter.limit(os.getenv("DOCUMENTS_RATE_LIMIT", "60/minute"))
def list_documents(request: Request) -> list[dict]:
    chunks = load_corpus_chunks()
    seen: dict[str, dict] = {}
    for chunk in chunks:
        entry = seen.setdefault(
            chunk.doc_id,
            {
                "doc_id": chunk.doc_id,
                "doc_title": chunk.doc_title,
                "doc_type": chunk.doc_type.value,
                "chunk_count": 0,
            },
        )
        entry["chunk_count"] += 1
    return sorted(seen.values(), key=lambda d: d["doc_id"])
