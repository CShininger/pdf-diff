from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.compare import router as compare_router

app = FastAPI(title="PDF Diff API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(compare_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
