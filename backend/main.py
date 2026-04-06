"""
main.py — API FastAPI para el sistema de ranking de CVs
Con autenticación JWT integrada.
"""

import asyncio
import json
import os
import shutil
import uuid
import zipfile
from datetime import timedelta
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles

from auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    get_current_user,
    init_db,
    verify_password,
    get_user_db,
)
from extractors.pdf_extractor import extract_text_from_pdf
from extractors.docx_extractor import extract_text_from_docx
from ranker import procesar_todos

# ── Directorios ────────────────────────────────────────────────────────────────
BASE_DIR    = Path(__file__).parent
UPLOAD_DIR  = BASE_DIR / "uploads"
RESULTS_DIR = BASE_DIR / "results"
UPLOAD_DIR.mkdir(exist_ok=True)
RESULTS_DIR.mkdir(exist_ok=True)

app = FastAPI(title="CV Ranker API", version="3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Startup ────────────────────────────────────────────────────────────────────
@app.on_event("startup")
def startup():
    init_db()
    print("[STARTUP] Base de datos de auth inicializada.")

jobs: dict[str, dict] = {}


# ── Helpers ────────────────────────────────────────────────────────────────────
def extract_text_from_file(path: Path) -> str | None:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return extract_text_from_pdf(path)
    elif suffix in (".docx", ".doc"):
        return extract_text_from_docx(path)
    elif suffix == ".txt":
        return path.read_text(encoding="utf-8", errors="ignore")
    return None


def extract_cvs_from_zip(zip_path: Path, dest_dir: Path) -> dict[str, str]:
    cvs: dict[str, str] = {}
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(dest_dir)
    for file in dest_dir.rglob("*"):
        if file.is_file() and file.suffix.lower() in (".pdf", ".docx", ".doc", ".txt"):
            texto = extract_text_from_file(file)
            if texto and texto.strip():
                cvs[file.stem] = texto.strip()
    return cvs


async def run_ranking_job(job_id: str, oferta: str, cvs: dict[str, str]):
    result_path = RESULTS_DIR / f"{job_id}.json"
    jobs[job_id]["status"] = "running"
    jobs[job_id]["total"]  = len(cvs)
    jobs[job_id]["done"]   = 0

    import ranker as _ranker
    _ranker.FILE_PATH = str(result_path)

    try:
        await procesar_todos({"oferta_trabajo": oferta, "cvs": cvs})
        jobs[job_id]["status"]      = "done"
        jobs[job_id]["result_path"] = str(result_path)
    except Exception as e:
        jobs[job_id]["status"] = "error"
        jobs[job_id]["error"]  = str(e)


# ══════════════════════════════════════════════════════════════
# ENDPOINTS PÚBLICOS
# ══════════════════════════════════════════════════════════════

@app.post("/api/login", summary="Obtener token JWT")
async def login(form: OAuth2PasswordRequestForm = Depends()):
    user = get_user_db(form.username)
    if not user or not verify_password(form.password, user["hashed_password"]):
        raise HTTPException(
            status_code=401,
            detail="Usuario o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_access_token(
        data={"sub": user["username"]},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {"access_token": token, "token_type": "bearer", "username": user["username"]}


@app.get("/api/health", summary="Health check público")
def health():
    return {"status": "ok"}


# ══════════════════════════════════════════════════════════════
# ENDPOINTS PROTEGIDOS (requieren JWT)
# ══════════════════════════════════════════════════════════════

@app.post("/api/upload", summary="Subir ZIP de CVs + texto de oferta")
async def upload_cvs(
    oferta: str        = Form(...),
    file:   UploadFile = File(...),
    _user:  dict       = Depends(get_current_user),
):
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(400, "Solo se admiten archivos .zip")

    job_id   = str(uuid.uuid4())[:8]
    work_dir = UPLOAD_DIR / job_id
    work_dir.mkdir(parents=True)

    zip_path = work_dir / "cvs.zip"
    with open(zip_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    cvs = extract_cvs_from_zip(zip_path, work_dir / "extracted")
    if not cvs:
        raise HTTPException(422, "No se encontraron CVs legibles en el ZIP")

    jobs[job_id] = {
        "status": "queued", "total": len(cvs),
        "done": 0, "oferta": oferta[:120], "result_path": None,
    }
    asyncio.create_task(run_ranking_job(job_id, oferta, cvs))
    return {"job_id": job_id, "candidatos": len(cvs)}


@app.get("/api/status/{job_id}", summary="Estado del job")
def get_status(job_id: str, _user: dict = Depends(get_current_user)):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job no encontrado")
    result_path = RESULTS_DIR / f"{job_id}.json"
    if result_path.exists():
        try:
            data = json.loads(result_path.read_text(encoding="utf-8"))
            job["done"] = data["oferta"]["total_candidatos"]
        except Exception:
            pass
    return job


@app.get("/api/results/{job_id}", summary="Resultados del ranking")
def get_results(job_id: str, _user: dict = Depends(get_current_user)):
    result_path = RESULTS_DIR / f"{job_id}.json"
    if not result_path.exists():
        raise HTTPException(404, "Resultados no disponibles aún")
    return JSONResponse(json.loads(result_path.read_text(encoding="utf-8")))


@app.get("/api/me", summary="Usuario actual")
def me(user: dict = Depends(get_current_user)):
    return {"username": user["username"]}