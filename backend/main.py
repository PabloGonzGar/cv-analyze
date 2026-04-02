"""
main.py — API FastAPI para el sistema de ranking de CVs
Recibe un ZIP con CVs + texto de oferta, extrae el texto y lanza el ranker en background.
"""

import asyncio
import json
import os
import shutil
import uuid
import zipfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse


from extractors.pdf_extractor import extract_text_from_pdf
from extractors.docx_extractor import extract_text_from_docx
from ranker import procesar_todos

# ── Directorios ────────────────────────────────────────────────────────────────
BASE_DIR    = Path(__file__).parent
UPLOAD_DIR  = BASE_DIR / "uploads"
RESULTS_DIR = BASE_DIR / "results"
UPLOAD_DIR.mkdir(exist_ok=True)
RESULTS_DIR.mkdir(exist_ok=True)

app = FastAPI(title="CV Ranker API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# Almacén en memoria de jobs activos { job_id: {"status": ..., "progress": ...} }
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
    """Descomprime el ZIP y extrae texto de cada CV soportado."""
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
    """Ejecuta el ranking y actualiza el estado del job."""
    result_path = RESULTS_DIR / f"{job_id}.json"
    jobs[job_id]["status"] = "running"
    jobs[job_id]["total"]   = len(cvs)
    jobs[job_id]["done"]    = 0

    input_usuario = {"oferta_trabajo": oferta, "cvs": cvs}

    # Monkey-patch: apuntamos el FILE_PATH del ranker al resultado de este job
    import ranker as _ranker
    _ranker.FILE_PATH = str(result_path)

    try:
        await procesar_todos(input_usuario)
        jobs[job_id]["status"]      = "done"
        jobs[job_id]["result_path"] = str(result_path)
    except Exception as e:
        jobs[job_id]["status"] = "error"
        jobs[job_id]["error"]  = str(e)


# ── Endpoints ──────────────────────────────────────────────────────────────────
@app.post("/api/upload", summary="Subir ZIP de CVs + texto de oferta")
async def upload_cvs(
    oferta: str      = Form(..., description="Texto completo de la oferta de trabajo"),
    file:   UploadFile = File(..., description="ZIP con los CVs (PDF, DOCX, TXT)")
):
    if not file.filename.endswith(".zip"):
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
        "status":     "queued",
        "total":      len(cvs),
        "done":       0,
        "oferta":     oferta[:120],
        "result_path": None,
    }

    # Lanzar en background sin bloquear la respuesta
    asyncio.create_task(run_ranking_job(job_id, oferta, cvs))

    return {"job_id": job_id, "candidatos": len(cvs)}


@app.get("/api/status/{job_id}", summary="Estado del job")
def get_status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job no encontrado")

    # Si el archivo de resultado existe, añadimos progreso real
    result_path = RESULTS_DIR / f"{job_id}.json"
    if result_path.exists():
        try:
            data = json.loads(result_path.read_text(encoding="utf-8"))
            job["done"] = data["oferta"]["total_candidatos"]
        except Exception:
            pass

    return job


@app.get("/api/results/{job_id}", summary="Resultados completos del ranking")
def get_results(job_id: str):
    result_path = RESULTS_DIR / f"{job_id}.json"
    if not result_path.exists():
        raise HTTPException(404, "Resultados no disponibles aún")
    return JSONResponse(json.loads(result_path.read_text(encoding="utf-8")))

