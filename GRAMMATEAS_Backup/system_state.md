# ΓΡΑΜΜΑΤΕΑΣ AI - MASTER SYSTEM STATE
Ημερομηνία Εξαγωγής: 2026-03-03 14:07:18

Αυτό το αρχείο περιέχει την πλήρη αρχιτεκτονική (Backend & Infrastructure) του συστήματος. Χρησιμοποιείται για την απόλυτη επαναφορά του πλαισίου (context) σε νέα συνεδρία AI.

## Αρχείο: key_manager.py
```python
import os
from cryptography.fernet import Fernet

class KeyManager:
    def __init__(self, key_file="/app/projects/.machine.key", payload_file="/app/projects/.gemini_api.enc"):
        self.key_file = key_file
        self.payload_file = payload_file
        self.fernet = Fernet(self._get_or_create_machine_key())

    def _get_or_create_machine_key(self) -> bytes:
        if os.path.exists(self.key_file):
            with open(self.key_file, "rb") as f:
                return f.read()
        key = Fernet.generate_key()
        with open(self.key_file, "wb") as f:
            f.write(key)
        os.chmod(self.key_file, 0o600)
        return key

    def save_api_key(self, api_key: str):
        encrypted = self.fernet.encrypt(api_key.encode())
        with open(self.payload_file, "wb") as f:
            f.write(encrypted)
        os.chmod(self.payload_file, 0o600)

    def load_api_key(self) -> str | None:
        if not os.path.exists(self.payload_file):
            return None
        with open(self.payload_file, "rb") as f:
            encrypted = f.read()
        try:
            return self.fernet.decrypt(encrypted).decode()
        except Exception:
            return None
```

## Αρχείο: main_api.py
```python
from support_agent import process_ticket_bg
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import shutil
import sys
import time
import sqlite3

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from db_manager import DBManager
from key_manager import KeyManager
from orchestrator import Orchestrator

app = FastAPI(title="Grammateas API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

db = DBManager()
km = KeyManager()
orch = Orchestrator()

class KeyPayload(BaseModel):
    api_key: str

@app.post("/save_key")
def save_key(payload: KeyPayload):
    km.save_api_key(payload.api_key)
    return {"status": "success", "message": "API Key saved securely."}

@app.post("/upload")
def upload_file(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    os.makedirs("/app/projects/tmp", exist_ok=True)
    unique_filename = f"{int(time.time())}_{file.filename}"
    file_location = f"/app/projects/tmp/{unique_filename}"

    with open(file_location, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    doc_id = db.add_document(unique_filename, status="processing")
    fields = ["ΑΦΜ", "Καθαρή Αξία", "Σύνολο ΦΠΑ", "Τελικό Ποσό", "Ημερομηνία"]
    background_tasks.add_task(orch.run_pipeline, unique_filename, fields)

    return {"status": "success", "doc_id": doc_id, "filename": unique_filename}

@app.get("/get_results")
def get_results(filename: str):
    with sqlite3.connect("/app/projects/grammar.db") as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.execute("SELECT * FROM documents WHERE filename=?", (filename,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Document not found")
        return {"status": "success", "data": dict(row)}

@app.get("/history")
def get_history():
    with sqlite3.connect("/app/projects/grammar.db") as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.execute("SELECT * FROM documents ORDER BY id DESC")
        rows = cursor.fetchall()
        return {"status": "success", "data": [dict(r) for r in rows]}

class TicketReq(BaseModel):
    subject: str
    priority: str
    message: str

@app.post("/support")
async def create_ticket(req: TicketReq, background_tasks: BackgroundTasks):
    with sqlite3.connect("/app/projects/grammar.db") as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO tickets (subject, priority, message) VALUES (?, ?, ?)",
                       (req.subject, req.priority, req.message))
        ticket_id = cursor.lastrowid
        conn.commit()

    key = None
    for m in ['load_key', 'get_key', 'get_api_key', 'get', 'read_key']:
        if hasattr(KeyManager, m):
            key = getattr(KeyManager, m)()
            break
    background_tasks.add_task(process_ticket_bg, ticket_id, req.subject, req.message, key)
    return {"status": "success", "ticket_id": ticket_id}

@app.get("/tickets")
async def get_tickets():
    with sqlite3.connect("/app/projects/grammar.db") as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM tickets ORDER BY id DESC")
        rows = cursor.fetchall()
        return {"data": [dict(r) for r in rows]}

@app.get("/documents")
async def get_documents():
    return {"data": db.get_all_documents() if hasattr(db, 'get_all_documents') else []}

@app.get('/documents')
async def get_documents():
    return {'data': db.get_all_documents()}

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)

```

## Αρχείο: file_processor.py
```python
import os
import fitz

class FileProcessor:
    def __init__(self, output_dir="/app/projects/tmp"):
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)

    def process_file(self, file_path: str) -> list[str]:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        ext = file_path.lower()
        if ext.endswith(".pdf"):
            return self._convert_pdf_to_images(file_path)
        elif ext.endswith((".png", ".jpg", ".jpeg")):
            return [file_path]
        raise ValueError(f"Unsupported file type: {ext}")

    def _convert_pdf_to_images(self, pdf_path: str) -> list[str]:
        doc = fitz.open(pdf_path)
        image_paths = []
        base_name = os.path.splitext(os.path.basename(pdf_path))[0]

        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            matrix = fitz.Matrix(2.0, 2.0)
            pix = page.get_pixmap(matrix=matrix)
            output_path = os.path.join(self.output_dir, f"{base_name}_page_{page_num + 1}.png")
            pix.save(output_path)
            image_paths.append(output_path)

        doc.close()
        return image_paths

```

## Αρχείο: schema_builder.py
```python
class SchemaBuilder:
    def build_schema(self, fields: list):
        properties = {field: {"type": "string"} for field in fields}
        return {
            "type": "array",
            "description": "Λίστα που περιέχει τα δομημένα δεδομένα για ΟΛΑ τα διακριτά παραστατικά του εγγράφου. Εάν ένα παραστατικό εκτείνεται σε πολλές σελίδες, ενοποίησε τα δεδομένα του σε ένα (1) αντικείμενο.",
            "items": {
                "type": "object",
                "properties": properties,
                "required": fields
            }
        }

```

## Αρχείο: Dockerfile
```python
FROM python:3.11-slim
WORKDIR /app/projects
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir cryptography pymupdf google-genai pandas openpyxl fastapi uvicorn python-multipart httpx pydantic
EXPOSE 8000
CMD ["uvicorn", "main_api:app", "--host", "0.0.0.0", "--port", "8000"]

```

## Αρχείο: db_manager.py
```python
import sqlite3
from contextlib import contextmanager

class DBManager:
    def __init__(self, db_path="/app/projects/grammar.db"):
        self.db_path = db_path
        self.initialize_db()

    @contextmanager
    def get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try: yield conn
        finally: conn.close()

    def initialize_db(self):
        with self.get_connection() as conn:
            conn.execute("CREATE TABLE IF NOT EXISTS documents (id INTEGER PRIMARY KEY, filename TEXT UNIQUE, status TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
            conn.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")
            conn.execute("CREATE TABLE IF NOT EXISTS templates (id INTEGER PRIMARY KEY, name TEXT UNIQUE, fields_json TEXT)")
            conn.commit()

    def add_document(self, filename, status="pending"):
        with self.get_connection() as conn:
            cursor = conn.execute("INSERT INTO documents (filename, status) VALUES (?, ?)", (filename, status))
            conn.commit()
            return cursor.lastrowid

    def get_document(self, filename):
        with self.get_connection() as conn:
            cursor = conn.execute("SELECT * FROM documents WHERE filename = ?", (filename,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def delete_document(self, filename):
        with self.get_connection() as conn:
            cursor = conn.execute("DELETE FROM documents WHERE filename = ?", (filename,))
            conn.commit()
            return cursor.rowcount > 0

    def get_all_documents(self):
        with self.get_connection() as conn:
            cursor = conn.execute('SELECT * FROM documents ORDER BY id DESC')
            return [dict(r) for r in cursor.fetchall()]

```

## Αρχείο: validator.py
```python
class ValidationEngine:
    def validate_financials(self, extracted_data: dict, net_key="net_value", vat_key="vat_value", total_key="total_value") -> tuple[bool, str]:
        if not isinstance(extracted_data, dict):
            return False, "Needs Human Review - Invalid Data Format"
        try:
            net = float(extracted_data.get(net_key, 0.0))
            vat = float(extracted_data.get(vat_key, 0.0))
            total = float(extracted_data.get(total_key, 0.0))
            if net == 0.0 and total == 0.0:
                return True, "Valid"
            if abs((net + vat) - total) > 0.05:
                return False, "Needs Human Review"
            return True, "Valid"
        except (ValueError, TypeError):
            return False, "Needs Human Review"

```

## Αρχείο: fix_nginx.py
```python
import re
path = '/etc/nginx/sites-available/grammateas'
with open(path, 'r') as f:
    conf = f.read()

conf = re.sub(r'\s*location /docs\b[^}]+\}', '', conf)
conf = re.sub(r'\s*location /openapi\.json\b[^}]+\}', '', conf)

api_rules = """
    location /docs {
        proxy_pass http://127.0.0.1:8000/docs;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /openapi.json {
        proxy_pass http://127.0.0.1:8000/openapi.json;
        proxy_set_header Host $host;
    }
"""

conf = conf.replace('location / {', api_rules.strip() + '\n\n    location / {')

with open(path, 'w') as f:
    f.write(conf)

```

## Αρχείο: orchestrator.py
```python
import os
import json
import sqlite3
from file_processor import FileProcessor
from schema_builder import SchemaBuilder
from ai_extractor import AIExtractor
from validator import ValidationEngine
from key_manager import KeyManager

class Orchestrator:
    def __init__(self, db_path="/app/projects/grammar.db"):
        self.db_path = db_path

    def update_db(self, filename: str, status: str, data: list = None):
        with sqlite3.connect(self.db_path) as conn:
            if data is not None:
                data_str = json.dumps(data, ensure_ascii=False)
                conn.execute("UPDATE documents SET status=?, extracted_data=? WHERE filename=?", (status, data_str, filename))
            else:
                conn.execute("UPDATE documents SET status=? WHERE filename=?", (status, filename))
            conn.commit()

    def run_pipeline(self, filename: str, fields: list):
        km = KeyManager()
        if not (api_key := km.load_api_key()):
            self.update_db(filename, "Error: Missing API Key")
            return None

        try:
            images = FileProcessor().process_file(f"/app/projects/tmp/{filename}")
            schema = SchemaBuilder().build_schema(fields)
            extractor = AIExtractor(api_key)
            validator = ValidationEngine()

            raw = extractor.extract_data(images, schema)
            clean_json = raw.replace("```json", "").replace("```", "").strip()
            data_array = json.loads(clean_json)

            if not isinstance(data_array, list):
                data_array = [data_array]

            all_results = []
            overall_status = "Valid"

            for idx, item in enumerate(data_array):
                _, status = validator.validate_financials(item)
                if status != "Valid": overall_status = "Needs Human Review"
                all_results.append({
                    "invoice_index": f"Παραστατικό #{idx + 1}",
                    "data": item,
                    "status": status
                })

            self.update_db(filename, overall_status, all_results)
            return all_results
        except Exception as e:
            self.update_db(filename, f"Error: {str(e)}")
            return None

```

## Αρχείο: ai_extractor.py
```python
from google import genai
from google.genai import types

class AIExtractor:
    def __init__(self, api_key: str):
        self.client = genai.Client(api_key=api_key)

    def extract_data(self, image_paths: list, schema: dict) -> str:
        uploaded_files = []
        try:
            for path in image_paths:
                uploaded_files.append(self.client.files.upload(file=path))

            prompt = (
                "Είσαι ένας αυστηρός ελεγκτής οικονομικών δεδομένων. Αναλύεις ένα σύνολο εικόνων (σελίδες εγγράφου). "
                "ΚΑΝΟΝΕΣ ΕΞΑΓΩΓΗΣ (Διάβασε προσεκτικά): "
                "1. Το αρχείο περιέχει ΠΟΛΛΑΠΛΑ, ΔΙΑΦΟΡΕΤΙΚΑ τιμολόγια. "
                "2. Πρέπει να εξάγεις μια λίστα (JSON Array) με ΟΛΑ τα τιμολόγια. "
                "3. ΑΠΑΓΟΡΕΥΕΤΑΙ ΑΥΣΤΗΡΑ να συγχωνεύσεις διαφορετικά τιμολόγια. Εάν ο ΑΦΜ, η Ημερομηνία, ή τα Σύνολα διαφέρουν από σελίδα σε σελίδα, ΠΡΕΠΕΙ να δημιουργήσεις ΝΕΟ, ξεχωριστό αντικείμενο στη λίστα. "
                "4. ΕΝΟΠΟΙΗΣΗ (merge) επιτρέπεται ΜΟΝΟ εάν μια σελίδα είναι ξεκάθαρα η συνέχεια της προηγούμενης (π.χ. σελίδα 1/2 και 2/2 του ΙΔΙΟΥ παραστατικού, στον ΙΔΙΟ πελάτη/ΑΦΜ, με τα τελικά σύνολα να βρίσκονται στη 2η σελίδα). "
                "Επίστρεψε ΑΥΣΤΗΡΑ τον πίνακα με τα δεδομένα."
            )

            response = self.client.models.generate_content(
                model='gemini-2.5-flash',
                contents=uploaded_files + [prompt],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=schema,
                    temperature=0.0 # Μηδενική θερμοκρασία για αποφυγή παραισθήσεων (Hallucinations)
                ),
            )
            return response.text

        finally:
            for uf in uploaded_files:
                try:
                    self.client.files.delete(name=uf.name)
                except Exception:
                    pass

```

## Αρχείο: docker-compose.yml
```python
services:
  grammateas_backend:
    container_name: grammateas_core
    build: .
    ports:
      - "8000:8000"
    environment:
      - SUPPORT_API_KEY=AIzaSyDBsG0wcU2Ejy3iBdeebW9XdS05iwdtsbE
    volumes:
      - .:/app/projects
    restart: always

  grammateas_frontend:
    container_name: grammateas_ui
    build:
      context: ./web_ui
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://grammateas.ddns.net:8000
    depends_on:
      - grammateas_backend
    restart: always

```

## Αρχείο: Dockerfile
```python
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN rm -rf app
EXPOSE 3000
CMD ["npm", "run", "dev"]

```