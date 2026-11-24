# Trợ lý Pháp luật — Agentic RAG Legal System

Hệ thống hỏi-đáp pháp luật Việt Nam (giao thông, dân sự, hình sự) dùng kiến
trúc RAG (Retrieval-Augmented Generation) kết hợp agent tool-calling, với
web app Next.js và backend FastAPI/LangGraph riêng biệt.

## Kiến trúc

Hai service độc lập, giao tiếp qua HTTP:

- **`web/`** — Next.js 16 (App Router, Turbopack) + Prisma ORM + PostgreSQL
  (Neon). Chat UI (chế độ Người dân / Chuyên gia), Legal Workspace (tra cứu
  văn bản luật theo Điều/Khoản), trang quản trị (`/admin`) cho rà soát OCR,
  quản lý người dùng, chi phí, tình trạng hệ thống.
- **`src/`** — FastAPI + LangChain/LangGraph (ReAct agent). Retrieval kết
  hợp dense (Chroma) + sparse (BM25) qua Reciprocal Rank Fusion, phân loại
  lĩnh vực câu hỏi tự động, sinh câu trả lời có bước tự rà soát
  (reflection) trước khi trả về, kèm 3 tool cho agent tự tra cứu thêm
  (`get_article`, `get_khoan`, `search_corpus`, `get_fine_range`).

```
├── src/
│   ├── api/          FastAPI app (main.py)
│   ├── rag/           xử lý mỗi câu hỏi (online)
│   │   ├── input/        bảo mật, phân loại lĩnh vực/phạm vi, viết lại câu hỏi
│   │   ├── retrieval/    hybrid dense + BM25, rerank, đồ thị quan hệ, chọn Khoản
│   │   ├── generation/   sinh câu trả lời, agent tools, đo chi phí
│   │   └── evaluation/   eval câu trả lời (LLM-judge), eval tìm kiếm (Recall/MRR)
│   └── ingestion/      pipeline offline PDF → Chroma
│       ├── extract/      OCR, làm sạch văn bản, metadata
│       ├── chunking/     chia Điều / Khoản
│       ├── enrich/       ngữ cảnh, mức phạt, quan hệ sửa đổi
│       └── index/        embedding (tách từ), đơn vị Khoản, nạp Chroma
├── web/
│   ├── app/            Next.js routes (chat, van-ban, admin, api/*)
│   ├── components/
│   ├── lib/             Prisma client, auth, hooks
│   └── prisma/          schema + migrations
├── data/               corpus đã xử lý (data/processed/corpus.jsonl) + eval set
├── tests/               pytest — retrieval/generation logic thuần, không gọi LLM thật
└── plans/                ghi chú kiến trúc/quyết định kỹ thuật trong quá trình phát triển
```

## Tính năng chính

- **2 chế độ trả lời**: Người dân (ngôn ngữ đơn giản, không thuật ngữ) và
  Chuyên gia (trích dẫn đầy đủ Điều/Khoản/Điểm, link thẳng tới văn bản gốc).
- **Tự động nhận diện lĩnh vực** câu hỏi (giao thông/dân sự/hình sự, có thể
  đa lĩnh vực) để lọc phạm vi tìm kiếm, người dùng vẫn có thể chọn tay.
- **Reflection pass**: một lượt LLM tự đối chiếu câu trả lời nháp với ngữ
  cảnh trước khi trả về, bắt các lỗi trích dẫn/số liệu sai lệch.
- **Legal Workspace**: duyệt văn bản luật theo cây Điều/Khoản, xem quan hệ
  sửa đổi/bổ sung giữa các văn bản.
- **Trang quản trị**: rà soát nội dung OCR, quản lý người dùng/phân quyền,
  theo dõi chi phí OpenAI theo ngày/stage, tỷ lệ lỗi `/query`.
- **`eval.py`**: chấm điểm faithfulness/correctness bằng LLM-judge trên bộ
  câu hỏi mẫu (`data/eval/qa_set.json`) — chạy sau mỗi thay đổi ở tầng
  retrieval/generation.

## Chạy local

### Backend (FastAPI)

```bash
python -m venv .venv
.venv/Scripts/activate  # Windows; source .venv/bin/activate trên macOS/Linux
pip install -r requirements.txt

cp .env.example .env  # điền OPENAI_API_KEY, DATABASE_URL

# Tải embedding model (~500 MB) về models/ — chỉ cần chạy 1 lần/máy.
# Backend load model từ thư mục này, không gọi huggingface.co lúc khởi động.
python scripts/download_models.py

# Nạp corpus vào Chroma (chạy từ thư mục gốc dự án)
PYTHONPATH=src python -m ingestion.index.load_vectorstore

PYTHONPATH=src uvicorn api.main:app --reload --port 8000
```

### Web (Next.js)

```bash
cd web
npm install
cp .env.example .env    # DATABASE_URL
cp .env.example .env.local  # NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
npx prisma migrate deploy
npm run dev
```

### Test

```bash
pytest                       # backend, không cần OpenAI key (dùng LLM stub)
python eval.py                # eval end-to-end, cần OpenAI key thật
```

## Lưu ý khi xem bản deploy online

Vercel chỉ host được phần `web/` (Next.js). Backend FastAPI là service
Python độc lập (giữ state trong RAM — model embedding, Chroma, BM25 index —
xem `src/api/main.py`), không chạy được trên nền tảng serverless như
Vercel. Vì vậy bản deploy online (nếu có) có thể chưa có phần chat trả lời
được — toàn bộ kiến trúc và logic RAG vẫn chạy đầy đủ khi build local theo
hướng dẫn trên.
