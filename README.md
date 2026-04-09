# CV Ranker
 
Sistema de selección de candidatos basado en IA local. Procesa lotes de CVs en formato ZIP, los evalúa frente a una oferta de trabajo y genera un ranking numerado con puntuación, justificación y análisis de habilidades.
 
Todo el procesamiento ocurre on-premise. Ningún dato de candidato sale del servidor.
 
![Estado](https://img.shields.io/badge/estado-pendiente%20de%20despliegue-orange)
![Python](https://img.shields.io/badge/Python-3.11-blue?logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-≥0.111-009688?logo=fastapi)
![Docker](https://img.shields.io/badge/Docker-Compose%20v2-2496ED?logo=docker)
 
---
 
## Requisitos
 
- Docker >= 24 y Docker Compose v2
- 6 GB de espacio en disco (imagen + modelo llama3)
- 16 GB de RAM recomendados para inferencia en CPU
 
---
 
## Instalación
 
```bash
git clone https://github.com/PabloGonzGar/cv-analyze.git
cd cv-analyze
cp .env.example .env
```
 
Edita `.env` con credenciales seguras:
 
```env
SECRET_KEY=$(openssl rand -hex 32)   # mínimo 32 caracteres
ADMIN_PASSWORD=tu_contraseña_segura  # no puede ser: admin, password, 1234...
```
 
Levanta el sistema:
 
```bash
docker compose --env-file .env up -d --build
```
 
La primera ejecución descarga el modelo llama3 (~4 GB). El sistema está listo cuando `http://localhost/api/health` responde correctamente. Accede desde el navegador en `http://localhost`.
 
---
 
## Arquitectura
 
```
NAVEGADOR
    │ HTTP/80
    ▼
NGINX               — SPA estática + proxy inverso
    │ HTTP/8000 (red interna Docker)
    ▼
FASTAPI             — API REST, autenticación JWT, extracción de CVs
    │ HTTP/11434 (red interna Docker)
    ▼
OLLAMA (llama3)     — Inferencia local, sin APIs externas
```
 
Los puertos 8000 y 11434 no se exponen al exterior.
 
---
 
## API
 
| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/login` | No | Obtener token JWT |
| GET | `/api/health` | No | Health check |
| POST | `/api/upload` | JWT | Subir ZIP + descripción del puesto |
| GET | `/api/status/{id}` | JWT | Progreso del análisis |
| GET | `/api/results/{id}` | JWT | Ranking completo en JSON |
| GET | `/api/me` | JWT | Usuario autenticado |
 
---
 
## Despliegue en producción
 
El sistema está preparado para Oracle Cloud Free Tier (VM.Standard.A1.Flex, 4 vCPUs ARM, 24 GB RAM, siempre gratuita).
 
```bash
# En la VM, tras instalar Docker:
git clone https://github.com/PabloGonzGar/cv-analyze.git
cd cv-analyze && cp .env.example .env
# Editar .env con SECRET_KEY y ADMIN_PASSWORD
docker compose --env-file .env up -d --build
```
 
Para HTTPS, configura un subdominio en [DuckDNS](https://www.duckdns.org/) e instala [Caddy](https://caddyserver.com/), que gestiona el certificado Let's Encrypt automáticamente.
 
---
 
## Limitaciones conocidas
 
- Velocidad de inferencia en CPU: aproximadamente 30-45 segundos por CV con llama3 Q4_0.
- CVs escaneados sin capa de texto tendrán extracción parcial o nula.
 
---
 
## Autores
 
Pablo Segundo González García, Jorge Gómez López, Antonio Pérez Carmona 
