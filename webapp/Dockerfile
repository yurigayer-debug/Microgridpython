# Simulador Híbrido PySAM – imagem única (frontend React compilado + API FastAPI + PySAM)
# Construir a partir da RAIZ do repositório (para incluir os CSVs do Octave):
#   docker compose -f webapp/docker-compose.yml up --build
#   ou: docker build -f webapp/Dockerfile -t simulador-hibrido .

# ---------- 1) frontend ----------
FROM node:22.11.0-bookworm-slim AS frontend
WORKDIR /src
COPY webapp/frontend/package.json webapp/frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY webapp/frontend/ ./
RUN npm run build

# ---------- 2) API + PySAM ----------
FROM python:3.13.1-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /srv/webapp
COPY webapp/requirements.txt ./
RUN pip install -r requirements.txt
COPY webapp/app ./app
COPY --from=frontend /src/dist ./frontend/dist
# dados do projeto Octave (fonte "CSV do Octave" e comparação da otimização)
COPY perfil_carga_e_solar.csv relatorio_completo_on_grid.csv relatorio_completo_off_grid.csv /srv/
RUN useradd --create-home --uid 1000 app && chown -R app /srv
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/esquema')"
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
