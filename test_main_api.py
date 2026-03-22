"""
Unit Tests - Module 8: Flask API Server
Χρησιμοποιεί το test client του Flask — χωρίς πραγματικό web server.
"""
import sys, io, json, unittest, tempfile
from pathlib import Path
sys.path.insert(0, "/app/projects")

import main_api
_TMP = tempfile.mkdtemp()
main_api.DB_PATH       = Path(_TMP) / "test.db"
main_api.SECRETS_DIR   = Path(_TMP) / "secrets"
main_api.UPLOAD_DIR    = Path(_TMP) / "uploads"
main_api.PROCESSED_DIR = Path(_TMP) / "processed"
main_api.EXPORT_DIR    = Path(_TMP) / "exports"
for _d in [main_api.UPLOAD_DIR, main_api.PROCESSED_DIR, main_api.EXPORT_DIR]:
    _d.mkdir(parents=True, exist_ok=True)

from db_manager  import DatabaseManager
from key_manager import KeyManager
from exporter    import DocumentExporter
main_api.db       = DatabaseManager(db_path=str(main_api.DB_PATH))
main_api.key_mgr  = KeyManager(key_dir=str(main_api.SECRETS_DIR))
main_api.exporter = DocumentExporter(export_dir=main_api.EXPORT_DIR)

client = main_api.app.test_client()
main_api.app.config["TESTING"] = True

def make_pdf_bytes():
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.drawString(72, 700, "Test Invoice"); c.showPage(); c.save()
    return buf.getvalue()

def upload_pdf(name="test.pdf"):
    r = client.post("/api/upload",
        data={"file": (io.BytesIO(make_pdf_bytes()), name)},
        content_type="multipart/form-data")
    assert r.status_code == 200, r.get_data(as_text=True)
    return r.get_json()["doc_id"]


class TestRoot(unittest.TestCase):
    def test_root_200(self):
        r = client.get("/"); self.assertEqual(r.status_code, 200)
    def test_root_app_name(self):
        self.assertIn("FastWrite", client.get("/").get_json()["app"])
    def test_root_domain(self):
        self.assertIn("fastwrite.duckdns.org", client.get("/").get_json()["domain"])
    def test_health_200(self):
        r = client.get("/health"); self.assertEqual(r.status_code, 200)
    def test_health_has_status(self):
        self.assertIn("status", client.get("/health").get_json())
    def test_health_has_checks(self):
        d = client.get("/health").get_json()
        self.assertIn("checks", d); self.assertIn("database", d["checks"])

class TestKeys(unittest.TestCase):
    def test_save_key_200(self):
        r = client.post("/api/keys/save",
            json={"service":"gemini","api_key":"fake_key_abc"})
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.get_json()["success"])
    def test_key_status_200(self):
        self.assertEqual(client.get("/api/keys/status").status_code, 200)
    def test_gemini_ready_after_save(self):
        client.post("/api/keys/save", json={"service":"gemini","api_key":"k"})
        self.assertTrue(client.get("/api/keys/status").get_json()["gemini_ready"])
    def test_save_empty_key_400(self):
        r = client.post("/api/keys/save", json={"service":"gemini","api_key":""})
        self.assertEqual(r.status_code, 400)
    def test_delete_key_200(self):
        client.post("/api/keys/save", json={"service":"gemini","api_key":"del_k"})
        r = client.delete("/api/keys/gemini")
        self.assertEqual(r.status_code, 200); self.assertTrue(r.get_json()["success"])
    def test_delete_missing_key_404(self):
        r = client.delete("/api/keys/nonexistent_xyz")
        self.assertEqual(r.status_code, 404)

class TestTemplates(unittest.TestCase):
    TMPL = {"name":"test_tmpl","fields":[
        {"name":"ΑΦΜ","type":"string","required":True},
        {"name":"Ποσό","type":"number","required":True},
        {"name":"Ημ/νία","type":"date","required":False},
    ]}
    def test_save_template_200(self):
        r = client.post("/api/templates", json=self.TMPL)
        self.assertEqual(r.status_code, 200); self.assertTrue(r.get_json()["success"])
    def test_save_template_returns_schema(self):
        r = client.post("/api/templates", json=self.TMPL)
        schema = r.get_json()["json_schema"]
        self.assertEqual(schema["type"], "object")
        self.assertFalse(schema["additionalProperties"])
    def test_list_templates_200(self):
        r = client.get("/api/templates")
        self.assertEqual(r.status_code, 200); self.assertIn("templates", r.get_json())
    def test_get_template_200(self):
        client.post("/api/templates", json=self.TMPL)
        r = client.get(f"/api/templates/{self.TMPL['name']}")
        self.assertEqual(r.status_code, 200)
    def test_get_missing_template_404(self):
        self.assertEqual(client.get("/api/templates/does_not_exist_xyz").status_code, 404)
    def test_save_invalid_type_400(self):
        r = client.post("/api/templates",
            json={"name":"bad","fields":[{"name":"x","type":"bad_type"}]})
        self.assertEqual(r.status_code, 400)

class TestUpload(unittest.TestCase):
    def test_upload_pdf_200(self):
        r = client.post("/api/upload",
            data={"file": (io.BytesIO(make_pdf_bytes()), "inv.pdf")},
            content_type="multipart/form-data")
        self.assertEqual(r.status_code, 200); self.assertTrue(r.get_json()["success"])
    def test_upload_returns_doc_id(self):
        r = client.post("/api/upload",
            data={"file": (io.BytesIO(make_pdf_bytes()), "inv2.pdf")},
            content_type="multipart/form-data")
        self.assertIn("doc_id", r.get_json())
    def test_upload_wrong_format_400(self):
        r = client.post("/api/upload",
            data={"file": (io.BytesIO(b"fake"), "doc.docx")},
            content_type="multipart/form-data")
        self.assertEqual(r.status_code, 400)
    def test_upload_png_200(self):
        from PIL import Image
        buf = io.BytesIO(); Image.new("RGB",(50,50),"white").save(buf,format="PNG")
        r = client.post("/api/upload",
            data={"file": (io.BytesIO(buf.getvalue()), "scan.png")},
            content_type="multipart/form-data")
        self.assertEqual(r.status_code, 200)
    def test_upload_with_schema_name(self):
        r = client.post("/api/upload",
            data={"file":(io.BytesIO(make_pdf_bytes()),"inv3.pdf"),"schema_name":"v1"},
            content_type="multipart/form-data")
        self.assertEqual(r.get_json()["schema_name"], "v1")

class TestDocuments(unittest.TestCase):
    def test_list_docs_200(self):
        r = client.get("/api/documents")
        self.assertEqual(r.status_code, 200); self.assertIn("documents", r.get_json())
    def test_get_doc_200(self):
        doc_id = upload_pdf("get_test.pdf")
        r = client.get(f"/api/documents/{doc_id}")
        self.assertEqual(r.status_code, 200); self.assertEqual(r.get_json()["id"], doc_id)
    def test_get_missing_doc_404(self):
        self.assertEqual(client.get("/api/documents/99999").status_code, 404)
    def test_delete_doc_200(self):
        doc_id = upload_pdf("del_test.pdf")
        r = client.delete(f"/api/documents/{doc_id}")
        self.assertEqual(r.status_code, 200); self.assertTrue(r.get_json()["success"])
    def test_delete_missing_doc_404(self):
        self.assertEqual(client.delete("/api/documents/99999").status_code, 404)
    def test_list_docs_status_filter(self):
        upload_pdf("filter.pdf")
        r = client.get("/api/documents?status=Pending")
        self.assertEqual(r.status_code, 200)
        for d in r.get_json()["documents"]:
            self.assertEqual(d["status"], "Pending")

class TestSearchStats(unittest.TestCase):
    def setUp(self):
        upload_pdf("sa.pdf"); upload_pdf("sb.pdf")
    def test_search_200(self):
        r = client.get("/api/search")
        self.assertEqual(r.status_code, 200); self.assertIn("documents", r.get_json())
    def test_search_with_query_200(self):
        self.assertEqual(client.get("/api/search?q=sa").status_code, 200)
    def test_search_status_filter(self):
        r = client.get("/api/search?status=Pending")
        for d in r.get_json()["documents"]: self.assertEqual(d["status"], "Pending")
    def test_stats_200(self):
        r = client.get("/api/stats")
        self.assertEqual(r.status_code, 200); self.assertIn("total", r.get_json())
    def test_stats_total_is_int(self):
        self.assertIsInstance(client.get("/api/stats").get_json()["total"], int)

class TestExport(unittest.TestCase):
    def setUp(self):
        upload_pdf("exp_test.pdf")
    def test_export_csv_200(self):
        r = client.post("/api/export/csv", json={})
        self.assertEqual(r.status_code, 200)
        self.assertIn("text/csv", r.content_type)
    def test_export_xlsx_200(self):
        r = client.post("/api/export/xlsx", json={})
        self.assertEqual(r.status_code, 200)
        self.assertIn("spreadsheetml", r.content_type)
    def test_export_csv_not_empty(self):
        r = client.post("/api/export/csv", json={})
        self.assertGreater(len(r.data), 0)
    def test_export_xlsx_not_empty(self):
        r = client.post("/api/export/xlsx", json={})
        self.assertGreater(len(r.data), 0)


if __name__ == "__main__":
    print("=" * 60)
    print("MODULE 8 - Unit Tests: Flask API Server")
    print("⚡ Flask TestClient — Χωρίς πραγματικό web server")
    print("=" * 60)
    loader = unittest.TestLoader()
    suite  = unittest.TestSuite()
    for cls in [TestRoot,TestKeys,TestTemplates,TestUpload,
                TestDocuments,TestSearchStats,TestExport]:
        suite.addTests(loader.loadTestsFromTestCase(cls))
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    print("\n" + "=" * 60)
    if result.wasSuccessful():
        print(f"✅ ΕΠΙΤΥΧΙΑ: {result.testsRun}/{result.testsRun} tests πέρασαν!")
        print("🏆 ΟΛΑ τα Modules ολοκληρώθηκαν επιτυχώς!")
    else:
        print(f"❌ ΑΠΟΤΥΧΙΑ: {len(result.failures)+len(result.errors)} tests απέτυχαν.")
        sys.exit(1)
    print("=" * 60)
