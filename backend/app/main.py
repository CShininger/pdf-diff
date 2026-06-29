from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.compare import router as compare_router
from app.api.history import router as history_router
from app.api.upload import router as upload_router
from app.services import history_db

app = FastAPI(title="PDF Diff API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(compare_router)
app.include_router(upload_router)
app.include_router(history_router)


@app.on_event("startup")
async def startup():
    try:
        history_db.init_db()
    except Exception as exc:
        print(f"警告: MySQL 初始化失败: {exc}")


@app.get("/health")
async def health():
    return {"status": "ok"}
