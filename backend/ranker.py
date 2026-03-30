"""
ranker.py — Motor de puntuación de CVs con Ollama
Versión optimizada: cliente compartido, semáforo, queue de escritura atómica.
"""

import asyncio
import json
import os

import ollama

# ── Config ─────────────────────────────────────────────────────────────────────
FILE_PATH      = "resultado_ranking.json"   # sobreescrito por main.py por job
MAX_CONCURRENT = 5                          # ajustar según GPU/CPU disponible

semaforo        = asyncio.Semaphore(MAX_CONCURRENT)
cliente         = ollama.AsyncClient()
resultado_queue: asyncio.Queue = asyncio.Queue()


# ── Writer ─────────────────────────────────────────────────────────────────────
async def writer_task(total_cvs: int, oferta_raw: str):
    acumulado: list[dict] = []

    while len(acumulado) < total_cvs:
        resultado = await resultado_queue.get()
        acumulado.append(resultado)

        ranking_ordenado = sorted(acumulado, key=lambda x: x.get("score", 0), reverse=True)

        data_final = {
            "oferta": {
                "titulo":            "Evaluación de CVs",
                "descripcion":       oferta_raw[:200] + ("..." if len(oferta_raw) > 200 else ""),
                "total_candidatos":  len(ranking_ordenado),
            },
            "ranking": {
                f"puesto_{i+1}": cand
                for i, cand in enumerate(ranking_ordenado)
            },
        }

        tmp_path = FILE_PATH + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data_final, f, indent=4, ensure_ascii=False)
        os.replace(tmp_path, FILE_PATH)

        resultado_queue.task_done()


# ── Evaluador individual ───────────────────────────────────────────────────────
PROMPT_SISTEMA = (
    "Eres un experto en RRHH. Puntúa el CV del 1 al 100 según la oferta. "
    "Responde SOLO en JSON válido con estas claves exactas: "
    "nombre (string), score (int 1-100), puesto (string), razon (string, max 80 chars), "
    "experiencia (string), habilidades (array de strings), educacion (string)."
)


async def evaluar_cv_individual(oferta: str, id_cv: str, texto_cv: str, reintentos: int = 3):
    prompt_usuario = f"OFERTA:\n{oferta}\n\nCV:\n{texto_cv}"

    async with semaforo:
        for intento in range(reintentos):
            try:
                response = await cliente.chat(
                    model="llama3",
                    messages=[
                        {"role": "system", "content": PROMPT_SISTEMA},
                        {"role": "user",   "content": prompt_usuario},
                    ],
                    format="json",
                )

                data = json.loads(response["message"]["content"])
                data["id"]    = id_cv
                data["score"] = max(0, min(100, int(data.get("score", 0))))

                # Normalizar habilidades a lista
                habilidades = data.get("habilidades", [])
                if isinstance(habilidades, str):
                    habilidades = [h.strip() for h in habilidades.split(",")]
                data["habilidades"] = habilidades

                await resultado_queue.put(data)
                return data

            except Exception as e:
                if intento < reintentos - 1:
                    await asyncio.sleep(2 ** intento)
                else:
                    error_data = {"id": id_cv, "score": 0, "error": str(e), "habilidades": []}
                    await resultado_queue.put(error_data)
                    return error_data


# ── Orquestador ────────────────────────────────────────────────────────────────
async def procesar_todos(input_usuario: dict):
    oferta = input_usuario["oferta_trabajo"]
    cvs    = input_usuario["cvs"]

    if os.path.exists(FILE_PATH):
        os.remove(FILE_PATH)

    writer = asyncio.create_task(writer_task(len(cvs), oferta))

    await asyncio.gather(*[
        evaluar_cv_individual(oferta, id_cv, texto_cv)
        for id_cv, texto_cv in cvs.items()
    ])

    await writer