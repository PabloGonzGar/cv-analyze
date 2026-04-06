"""
auth.py — Autenticación JWT + SQLite para CV Ranker
"""
import os
import sqlite3
from datetime import datetime, timedelta

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

# ── Configuración ──────────────────────────────────────────────────────────────
# Las variables de entorno son OBLIGATORIAS en producción.
# Si no están definidas, el servidor no arranca.
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY no está definida. "
        "Crea un archivo .env con SECRET_KEY=<valor> y arranca con "
        "'docker compose --env-file .env up'."
    )

if len(SECRET_KEY) < 32:
    raise RuntimeError(
        f"SECRET_KEY demasiado corta ({len(SECRET_KEY)} chars). "
        "Mínimo 32 caracteres. Genera una con: openssl rand -hex 32"
    )

ALGORITHM                   = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 días

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")

# La BD se guarda en el volumen persistente montado en /app/data
DB_PATH = os.path.join(os.path.dirname(__file__), "data", "auth.db")


# ── Base de datos ───────────────────────────────────────────────────────────────
def init_db():
    """Crea la tabla users y el usuario admin por defecto si no existen."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

    # ADMIN_PASSWORD obligatoria y con mínimo de seguridad
    admin_password = os.getenv("ADMIN_PASSWORD")
    if not admin_password:
        raise RuntimeError(
            "ADMIN_PASSWORD no está definida. "
            "Añádela al .env: ADMIN_PASSWORD=<password_segura>"
        )
    if admin_password.lower() in ("admin", "password", "1234", "123456", "admin123"):
        raise RuntimeError(
            "ADMIN_PASSWORD es demasiado obvia. "
            "Usa una contraseña segura (mínimo 8 caracteres, no 'admin')."
        )

    conn = sqlite3.connect(DB_PATH)
    cur  = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            username        TEXT UNIQUE NOT NULL,
            hashed_password TEXT NOT NULL
        )
    """)

    # Usuario admin por defecto
    cur.execute("SELECT id FROM users WHERE username = 'admin'")
    if not cur.fetchone():
        hashed = hash_password(admin_password)
        cur.execute(
            "INSERT INTO users (username, hashed_password) VALUES (?, ?)",
            ("admin", hashed)
        )
        print("[AUTH] Usuario admin creado correctamente.")

    conn.commit()
    conn.close()


def get_user_db(username: str) -> dict | None:
    conn = sqlite3.connect(DB_PATH)
    cur  = conn.cursor()
    cur.execute(
        "SELECT username, hashed_password FROM users WHERE username = ?",
        (username,)
    )
    row = cur.fetchone()
    conn.close()
    return {"username": row[0], "hashed_password": row[1]} if row else None


# ── Contraseñas ─────────────────────────────────────────────────────────────────
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ── JWT ─────────────────────────────────────────────────────────────────────────
def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    payload = data.copy()
    expire  = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    payload.update({"exp": expire})
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# ── Dependencia FastAPI ─────────────────────────────────────────────────────────
async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales inválidas o sesión expirada",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload  = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            raise exc
    except JWTError:
        raise exc

    user = get_user_db(username)
    if not user:
        raise exc
    return user