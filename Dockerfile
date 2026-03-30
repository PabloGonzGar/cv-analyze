FROM python:3.11-slim

# Evitar que Python escriba archivos .pyc y forzar salida estándar sin buffer
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Instalar dependencias del sistema necesarias
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copiar el archivo de requerimientos
COPY backend/requirements.txt /app/

# Instalar los paquetes de Python
RUN pip install --no-cache-dir -r requirements.txt

# Copiar la carpeta frontend (el backend sirve estos archivos estáticos)
COPY frontend /app/frontend

# Copiar el código del backend
COPY backend /app/backend

# Cambiar el directorio de trabajo al backend donde está main.py
WORKDIR /app/backend

# Exponer el puerto de FastAPI
EXPOSE 8000

# Ejecutar el servidor Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
