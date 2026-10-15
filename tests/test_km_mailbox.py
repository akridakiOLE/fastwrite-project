"""KM-PRO-F4 · FastWrite «γραμματοκιβώτιο» — τεστ του km_mailbox.py (14/10/2026)

  python tests/test_km_mailbox.py              όλα τα τεστ (exit 0 = πράσινα)
  python tests/test_km_mailbox.py --mutate=N   μετάλλαξη N (exit 0 = ΠΙΑΣΤΗΚΕ)

Ο server εδώ είναι ψεύτικος αλλά ακολουθεί το src/km_acct.js (ίδια διαδρομές, ίδιες απαντήσεις).
Η κρυπτογραφία ελέγχεται ΚΑΙ απέναντι στο αληθινό site/km-crypto.js (node) — ίδια bytes και στις δύο μεριές.
Τα έγγραφα γράφονται στον ΑΛΗΘΙΝΟ DatabaseManager (db_manager.py) και περνούν από την ΑΛΗΘΙΝΗ
_extract_bill_data_from_doc του main_api.py (Xero ως έχει).
"""
import ast
import base64
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
ONLY = next((int(a.split("=")[1]) for a in sys.argv if a.startswith("--mutate=")), None)

MUT = [
    # Μ1 · 🔴 ο δείκτης γράφεται ΠΡΙΝ εφαρμοστεί η σελίδα (διακοπή = χαμένα τιμολόγια)
    ('            for e in pg["entries"]:\n', '            self.st.x("UPDATE km_link SET cursor = ? WHERE id = ?", (int(pg["next"]), l["id"]))\n            for e in pg["entries"]:\n'),
    # Μ2 · 🔴 η διόρθωση του λογιστή ΔΕΝ ισχύει αμέσως (μόνο στην ουρά)
    ("        self._apply_local(inv, lines, payload)\n", ""),
    # Μ3 · 🔴 γράμμα του Boss που φτάνει ΠΡΙΝ περάσει η διόρθωση την πατάει (η διόρθωση χάνεται)
    ("                    _overlay(hdr, lines, p)\n", ""),
    # Μ4 · 🔴 «άλλαξε η αντιστοίχιση» δεν σημαδεύεται
    ("                if mc:\n                    flag, note = 1, mc\n", "                if False:\n                    flag, note = 1, mc\n"),
    # Μ5 · 🔴 η σήμανση σβήνει μόνη της στο επόμενο γράμμα (πριν «το δει» ο λογιστής)
    ('                elif prev and prev["map_changed"]:\n                    flag, note = 1, prev["map_note"]', '                elif False:\n                    flag, note = 1, prev["map_note"]'),
    # Μ6 · 🔴 αναζήτηση χωρίς όριο σελίδας (όλα στη μνήμη)
    ("        size = max(1, min(int(size or 25), SEARCH_MAX_SIZE))\n        page = max(1, int(page or 1))\n        where, args = [\"i.deleted = 0\"], []",
     "        size = max(1, int(size or 25))\n        page = max(1, int(page or 1))\n        where, args = [\"i.deleted = 0\"], []"),
    # Μ7 · 🔴 το FastWrite «ξεχνά» τα _xero_ πεδία όταν ξαναέρθει το τιμολόγιο (διπλό push στο Xero)
    ('                    if k.startswith("_") and not k.startswith("_km_"):\n                        data[k] = v', '                    if False:\n                        data[k] = v'),
    # Μ8 · 🔴 ανακλημένος: συνεχίζει σαν να μην έγινε τίποτα
    ("        if stc == 410:\n            self.st.x(\"UPDATE km_link SET status = 'revoked', last_error = 'revoked' WHERE id = ?\", (l[\"id\"],))\n            return {\"link\": l[\"id\"], \"revoked\": True}",
     "        if False:\n            return {}"),
    # Μ9 · 🔴 κρυπτογραφία: σταθερό εφήμερο κλειδί (ίδιο AES για όλα)
    ("    eph = ec_new()\n    eph_raw = ec_pub_raw(eph)", "    global _EPH\n    eph = globals().get('_EPH') or ec_new(); _EPH = eph\n    eph_raw = ec_pub_raw(eph)"),
    # Μ10 · 🔴 σβησμένο από τον Boss μένει στην αναζήτηση
    ('        self.st.x("UPDATE km_invoices SET deleted = 1, updated_at = ? WHERE id = ?", (_now(), inv["id"]))', '        pass'),
    # Μ11 · 🔴 αναίρεση του Boss αγνοείται (η διόρθωση ξαναμπαίνει από πάνω)
    ('                if st == "undone":', '                if st == "never":'),
    # Μ12 · 🔴 θόρυβος: κωδικός που απλώς απέκτησε κεντρικό προϊόν σημαδεύεται
    ('    if old_pid != pid and not (implicit and (old_pname or "") == (pname or "")):', '    if old_pid != pid:'),
    # Μ13 · 🔴 κοινός χρήστης βλέπει τιμολόγια συνδέσεων ΑΛΛΟΥ χρήστη του ίδιου υπολογιστή
    ('            where.append("i.link_id IN (SELECT id FROM km_link WHERE user_id = ? OR user_id IS NULL)")\n            args.append(user_id)\n        if link_id:\n            where.append("i.link_id = ?"); args.append(int(link_id))\n        if supplier_id:',
     '            where.append("? IS NOT NULL")\n            args.append(user_id)\n        if link_id:\n            where.append("i.link_id = ?"); args.append(int(link_id))\n        if supplier_id:'),
    # Μ14 · 🔴 οι γραμμές του ευρετηρίου κειμένου μένουν ορφανές (παλιά έκδοση βρίσκεται στην αναζήτηση)
    ('                    self.st.conn.execute("DELETE FROM km_line_fts WHERE rowid IN (SELECT id FROM km_lines WHERE inv_id = ?)", (inv_id,))\n', '                    pass\n'),
    # Μ15 · 🔴 βιβλίο χωρίς συσκευασία «σβήνει» τη συσκευασία των γραμμών (ψεύτικη σήμανση «6 → —»)
    ("                if not pk and old:", "                if False:"),
    # Μ16 · 🔴 σύνδεσμος προς ξένο server γίνεται δεκτός
    ("        if origin.rstrip(\"/\") not in ALLOWED_ORIGINS:\n            return None, None\n", ""),
    # Μ17 · 🔴 χαλασμένο γράμμα σταματά τη ροή για πάντα (χωρίς καραντίνα)
    ("                    continue\n                self.apply(l, e, data, ring)", "                    raise\n                self.apply(l, e, data, ring)"),
    # Μ18 · 🔴 η ετικέτα του server κερδίζει το σφραγισμένο περιεχόμενο
    ('                    if not isinstance(data, dict) or data.get("kind") != e.get("kind") or (data.get("rid") or "_book") != e.get("rid"):',
     '                    if not isinstance(data, dict):'),
    # Μ19 · 🔴 διόρθωση χωρίς υπογραφή A
    ('            env = {"p": f["payload"], "av": av, "mac": hmac.new(ring[av], f["payload"].encode(), hashlib.sha256).hexdigest()}',
     '            env = {"p": f["payload"], "av": av, "mac": ""}'),
    # Μ20 · 🔴 «δεν πέρασε» αγνοείται (οι τιμές του λογιστή μένουν για πάντα)
    ('            elif f.get("status") == "rejected":', '            elif f.get("status") == "never":'),
    # Μ21 · 🔴 κείμενο του πελάτη ωμό στα «Έγγραφα»
    ('    return str(v).replace("<", "‹").replace(">", "›").replace(\'"\', "”")[:n]', '    return str(v)[:n]'),
    # Μ22 · 🔴 φωτογραφία που δεν κατέβηκε δεν ξαναδοκιμάζεται
    ("        self._retry_photos(l, ring)\n", ""),
    # Μ23 · 🔴 έγγραφο που άλλαξε στα «Έγγραφα» πατιέται σιωπηλά
    ('                if old.get("_km_fp") and old["_km_fp"] != self.fp(old):', '                if False:'),
    # Μ24 · 🔴 F5 · άδειο Σύνολο γίνεται δεκτό
    ('            if k == "total" and nv is None:\n                return {"ok": False, "error": "total_required"}', '            if False:\n                return {"ok": False, "error": "total_required"}'),
    # Μ25 · 🔴 F5 · NaN/Infinity στην κεφαλίδα
    ('            if isinstance(nv, float) and not (math.isfinite(nv) and abs(nv) < 1e9):\n                return {"ok": False, "error": "bad_number"}   # NaN', '            if False:\n                return {"ok": False, "error": "bad_number"}   # NaN'),
    # Μ26 · F5 · κείμενο γραμμής χωρίς όριο
    ('                return {"ok": False, "error": "too_long"}   # KM-PRO-F5 · ίδιο όριο με το κινητό (acctValOk)', '                pass'),
]

SRC = (ROOT / "km_mailbox.py").read_text(encoding="utf8")
if ONLY is not None:
    m = MUT[ONLY - 1] if 0 < ONLY <= len(MUT) else None
    if not m or m[0] not in SRC:
        print("Η ΜΕΤΑΛΛΑΞΗ Μ%s ΔΕΝ ΒΡΗΚΕ ΣΤΟΧΟ" % ONLY)
        sys.exit(1)
    SRC = SRC.replace(m[0], m[1], 1)
TMP = Path(tempfile.mkdtemp(prefix="kmmb-"))
(TMP / "km_mailbox_t.py").write_text(SRC, encoding="utf8")
os.environ["FASTWRITE_KM_ORIGIN"] = "https://x.test"      # ο «server» της δοκιμής — ΜΟΝΟ αυτός προστίθεται στη λίστα
spec = importlib.util.spec_from_file_location("km_mailbox_t", TMP / "km_mailbox_t.py")
K = importlib.util.module_from_spec(spec)
spec.loader.exec_module(K)
from db_manager import DatabaseManager  # noqa: E402

PASS = FAIL = 0


def ok(c, m):
    global PASS, FAIL
    if c:
        PASS += 1
        print("  ✔ " + m)
    else:
        FAIL += 1
        print("  ✘ " + m)


# ── Xero: η ΑΛΗΘΙΝΗ συνάρτηση του main_api.py (χωρίς να φορτωθεί όλο το main_api) ──
def _xero_fns():
    tree = ast.parse((ROOT / "main_api.py").read_text(encoding="utf8"))
    want = {"_extract_bill_data_from_doc", "_compose_line_item_description", "_normalize_currency"}
    def literal(n):
        try:
            ast.literal_eval(n.value)
            return True
        except Exception:
            return False
    body = [n for n in tree.body if (isinstance(n, ast.FunctionDef) and n.name in want) or
            (isinstance(n, ast.Assign) and all(isinstance(t, ast.Name) and t.id.startswith("_") for t in n.targets) and literal(n))]
    mod = ast.Module(body=body, type_ignores=[])
    ns = {}
    exec(compile(mod, "main_api_xero", "exec"), ns)
    return ns


XERO = _xero_fns()


# ── ψεύτικος server (ίδιο συμβόλαιο με το src/km_acct.js) ──
class FakeServer:
    def __init__(self):
        self.code = "c" * 32
        self.acct = None              # {"id","auth","pub","status","wrap_a"}
        self.mail = []                # [{"seq","rid","kind","a_ver","body"}]
        self.photos = {}
        self.fixes = {}               # id → {"meta","status"}
        self.seq = 0
        self.pro = True
        self.boss = K.ec_new()
        self.boss_pub = base64.b64encode(K.ec_pub_raw(self.boss)).decode()
        self.ring = {1: os.urandom(32)}
        self.calls = []

    def give_key(self):
        pub = base64.b64decode(self.acct["pub"])
        self.acct["wrap_a"] = base64.b64encode(K.seal_to(pub, json.dumps({str(k): v.hex() for k, v in self.ring.items()}).encode())).decode()
        self.acct["status"] = "active"

    def post(self, rid, kind, obj, av=None):
        av = av or max(self.ring)
        self.mail = [m for m in self.mail if m["rid"] != rid]       # μία έκδοση ανά τιμολόγιο
        self.seq += 1
        self.mail.append({"seq": self.seq, "rid": rid, "kind": kind, "a_ver": av, "at": "x",
                          "body": base64.b64encode(K.seal(self.ring[av], json.dumps(obj).encode())).decode()})

    def call(self, method, url, headers=None, body=None):
        path = url.split("/api/km/")[1]
        self.calls.append(method + " " + path.split("?")[0])
        if path == "pro/a/join":
            b = json.loads(body)
            if b["code"] != self.code or self.acct:
                return 404, {"ok": False, "error": "bad_invite"}
            self.acct = {"id": "a" * 32, "auth": b["acct_auth"], "pub": b["pub"], "status": "joined", "wrap_a": None, "office": b.get("office")}
            return 200, {"ok": True, "acct_id": "a" * 32, "name": "Λογιστήριο", "boss_pub": self.boss_pub}
        if not self.acct or headers.get("X-Km-Acct-Auth") != self.acct["auth"]:
            return 403, {"ok": False, "error": "forbidden"}
        if self.acct["status"] == "revoked":
            return 410, {"ok": False, "error": "revoked"}
        if path == "pro/a/me":
            return 200, {"ok": True, "pro": self.pro, "boss_pub": self.boss_pub,
                         "me": {"status": self.acct["status"], "wrap_a": self.acct["wrap_a"]}, "head": self.seq}
        if path.startswith("pro/a/mail"):
            q = dict(x.split("=") for x in path.split("?")[1].split("&"))
            after, limit = int(q["after"]), int(q["limit"])
            rows = [m for m in sorted(self.mail, key=lambda m: m["seq"]) if m["seq"] > after]
            page = rows[:limit]
            return 200, {"ok": True, "entries": page, "next": page[-1]["seq"] if page else after, "more": len(rows) > limit}
        if path.startswith("pro/a/photo"):
            pid = path.split("id=")[1]
            if pid not in self.photos:
                return 404, {"ok": False}
            return 200, self.photos[pid]
        if path == "pro/a/fix":
            b = json.loads(body)
            self.fixes[b["id"]] = {"meta": b["meta"], "status": "pending"}
            return 200, {"ok": True}
        if path == "pro/a/fixes":
            return 200, {"ok": True, "fixes": [{"id": k, "status": v["status"]} for k, v in self.fixes.items()]}
        return 404, {"ok": False, "error": "not_found"}

    def open_env(self, fid):
        return json.loads(K.open_with(self.boss, base64.b64decode(self.fixes[fid]["meta"])).decode())

    def open_fix(self, fid):
        return json.loads(self.open_env(fid)["p"])


def key(sup, code):
    return K.norm(sup) + "|c:" + K.code_key(code)


def inv(rid, sup, number, date, lines, fixes=None, total=None, approved="manual", ph=None):
    net = round(sum(l[3] * l[4] for l in lines), 2)
    vat = round(net * 0.19, 2)
    return {"v": 1, "kind": "inv", "rid": rid, "ph": ph if ph is not None else [rid],
            "rec": {"supplier": sup, "sup_vat": "10123456X", "number": number, "date": date, "invDate": 0, "net": net, "vat": vat,
                    "total": total if total is not None else round(net + vat, 2), "approved": approved, "by": None, "fixes": fixes or [],
                    "lines": [{"code": l[0], "desc": l[1], "unit": l[2], "qty": l[3], "unit_price": l[4], "disc_pct": None,
                               "line_net": round(l[3] * l[4], 2), "vat_pct": 19, "pack": l[6] if len(l) > 6 else None, "base_price": None,
                               "key": (K.norm(sup) + "|c:" + K.code_key(l[0])), "pid": l[5], "pname": l[7] if len(l) > 7 else l[1]} for l in lines]}}


def main():
    base = Path(tempfile.mkdtemp(prefix="kmmb-base-"))
    srv = FakeServer()
    db = DatabaseManager(str(base / "app.db"))
    uid = db.create_user("logistis", "x", role="user")
    other = db.create_user("allos", "x", role="user")
    st = K.Store(base / "data" / "kostometro.db")
    mb = K.Mailbox(st, base, net=srv, docs=K.DocsBridge(db))

    # ── κρυπτογραφία ──
    a = K.ec_new()
    sealed = K.seal_to(K.ec_pub_raw(a), "ίδιο".encode())
    ok(K.open_with(a, sealed).decode() == "ίδιο", "κρυπτο: σφράγισμα προς δημόσιο κλειδί → ανοίγει με το ιδιωτικό")
    s2 = K.seal_to(K.ec_pub_raw(a), "ίδιο".encode())
    ok(sealed[:65] != s2[:65], "🔴 κρυπτο: εφήμερο κλειδί ανά σφράγισμα")
    try:
        K.open_with(K.ec_new(), sealed)
        ok(False, "🔴 κρυπτο: άλλο ιδιωτικό κλειδί ΔΕΝ ανοίγει")
    except Exception:
        ok(True, "🔴 κρυπτο: άλλο ιδιωτικό κλειδί ΔΕΝ ανοίγει")
    # απέναντι στο ΑΛΗΘΙΝΟ km-crypto.js (WebCrypto του node)
    node = shutil.which("node")
    if node:
        js = (ROOT / "site" / "km-crypto.js").read_text(encoding="utf8")
        pyk = K.ec_new()
        script = js + """
(async () => {
  const pub = kmUnB64(process.argv[2]);
  const toPy = await kmSealTo(pub, new TextEncoder().encode("από το κινητό ✓"));
  const kp = await kmEcNew();
  const jwk = await kmEcPrivJwk(kp.privateKey);
  const out = { toPy: kmB64(toPy), pub: kmB64(await kmEcPubRaw(kp.publicKey)), jwk };
  const A = crypto.getRandomValues(new Uint8Array(32));
  out.A = [...A].map((x) => x.toString(16).padStart(2, "0")).join("");
  out.sym = kmB64(await kmSeal(await kmImportK(A), new TextEncoder().encode("γράμμα")));
  process.stdout.write(JSON.stringify(out));
})();"""
        f = TMP / "x.js"
        f.write_text("globalThis.window = globalThis;\n" + script, encoding="utf8")
        r = subprocess.run([node, str(f), base64.b64encode(K.ec_pub_raw(pyk)).decode()], capture_output=True, text=True, timeout=60)
        o = json.loads(r.stdout)
        ok(K.open_with(pyk, base64.b64decode(o["toPy"])).decode() == "από το κινητό ✓", "🔴 διαλειτουργία: ό,τι σφραγίζει το κινητό (WebCrypto) το ανοίγει το FastWrite (Python)")
        ok(K.open_sym(bytes.fromhex(o["A"]), base64.b64decode(o["sym"])).decode() == "γράμμα", "🔴 διαλειτουργία: γράμμα με A (kmSeal) → ανοίγει στο FastWrite")
        back = base64.b64encode(K.seal_to(base64.b64decode(o["pub"]), "από τον λογιστή".encode())).decode()
        f2 = TMP / "y.js"
        f2.write_text("globalThis.window = globalThis;\n" + js + """
(async () => { const k = await kmEcImportPriv(JSON.parse(process.argv[2]));
  process.stdout.write(new TextDecoder().decode(await kmOpenWith(k, kmUnB64(process.argv[3])))); })();""", encoding="utf8")
        r2 = subprocess.run([node, str(f2), json.dumps(o["jwk"]), back], capture_output=True, text=True, timeout=60, encoding="utf8")
        ok(r2.stdout == "από τον λογιστή", "🔴 διαλειτουργία: διόρθωση σφραγισμένη στο FastWrite → ανοίγει στο κινητό του Boss")
    else:
        ok(False, "node δεν βρέθηκε — η διαλειτουργία δεν ελέγχθηκε")

    # ── σύνδεση ──
    ok(K.parse_invite("https://fastwrite-staging.stavrosfkallenos.workers.dev/kostometro/#km_acct=" + "c" * 32) ==
       ("https://fastwrite-staging.stavrosfkallenos.workers.dev/api/km/", "c" * 32), "σύνδεσμος staging → API του staging + κωδικός")
    ok(K.parse_invite("http://evil.example/kostometro/#km_acct=" + "c" * 32) == (None, None) and
       K.parse_invite("https://fastwrite.tech.evil.example/#km_acct=" + "c" * 32) == (None, None), "🔴 σύνδεσμος προς ΞΕΝΟ server → απορρίπτεται (ο κωδικός δεν φεύγει ποτέ εκεί)")
    ok(K.parse_invite("C" * 32)[1] == "c" * 32 and K.parse_invite("C" * 32)[0].endswith("/api/km/"), "σκέτος κωδικός → προεπιλεγμένο fastwrite.tech")
    ok(K.parse_invite("καλημέρα")[1] is None, "κείμενο χωρίς κωδικό → τίποτα")
    r = mb.connect("https://x.test/kostometro/#km_acct=" + "c" * 32, office="Christofi & Co", user_id=uid)
    ok(r["ok"] and r["link"]["status"] == "joined", "σύνδεση: μπήκε, περιμένει ενεργοποίηση")
    ok(srv.acct["pub"].startswith("B") and len(base64.b64decode(srv.acct["pub"])) == 65, "στέλνει ΜΟΝΟ δημόσιο κλειδί P-256 (65 bytes)")
    link = st.one("SELECT * FROM km_link")
    pem, au = K.unprotect(link["priv_pem"]), K.unprotect(link["auth"])
    ok("PRIVATE KEY" in pem and len(au) == 64, "το ιδιωτικό κλειδί και ο κωδικός μένουν ΜΟΝΟ στον υπολογιστή")
    if os.name == "nt":
        ok(link["priv_pem"].startswith("dpapi:") and "PRIVATE KEY" not in link["priv_pem"] and link["auth"].startswith("dpapi:"),
           "🔴 Windows: κλειδί + κωδικός κλειδωμένα με DPAPI στον δίσκο (όχι καθαρό κείμενο)")
    r = mb.sync_all()
    ok(r[0].get("waiting"), "πριν το κλειδί A: «περιμένει» — τίποτα δεν κατεβαίνει")

    # ── γράμματα ──
    srv.give_key()
    srv.photos["r1"] = K.seal(srv.ring[1], b"\xff\xd8JPEG-1")
    srv.post("r1", "inv", inv("r1", "ΟΡΙΖΩΝ", "ΤΔΑ 4411", "2026-10-02", [["K100", "ΓΑΛΑ ΦΡΕΣΚΟ 1LT", "ΛΤ", 10, 1.5, key("ΟΡΙΖΩΝ", "K100"), {"per": 1, "base": "L"}],
                                                                       ["K200", "ΑΛΕΥΡΙ ΣΑΚΙ 25KG", "ΤΕΜ", 2, 20.0, key("ΟΡΙΖΩΝ", "K200"), {"per": 25, "base": "kg"}]]))
    srv.post("r2", "inv", inv("r2", "ΑΚΤΗ", "INV-0777", "2026-10-05", [["G-77", "ΓΑΛΑ ΦΡΕΣΚΟ 6x1LT", "ΚΙΒ", 2, 8.7, key("ΑΚΤΗ", "G-77"), {"per": 6, "base": "L"}]], approved="auto"))
    srv.post("_book", "book", {"v": 1, "kind": "book", "biz": "Ταβέρνα Ακτή", "items": {}, "prods": {}})
    for i in range(3, 160):                               # όγκος: πολλές σελίδες
        srv.post("v%d" % i, "inv", inv("v%d" % i, "ΠΡΟΜ %d" % (i % 7), "N%d" % i, "2026-09-%02d" % (1 + i % 28), [["X%d" % i, "ΕΙΔΟΣ %d" % i, "ΤΕΜ", 1, 1.0 + i, None]], ph=[]))
    r = mb.sync_all()
    ok(r[0].get("got") == 160, "ο λογιστής κατέβασε 160 γράμματα σε σελίδες (%s)" % r[0].get("got"))
    ok(sum(1 for c in srv.calls if c == "GET pro/a/mail") >= 2, "🔴 σε ΣΕΛΙΔΕΣ (πολλά αιτήματα «μετά το Ν»), ποτέ όλα μαζί")
    link = st.one("SELECT * FROM km_link")
    ok(link["biz"] == "Ταβέρνα Ακτή" and link["cursor"] == srv.seq and link["status"] == "active", "η επιχείρηση πήρε όνομα από το βιβλίο · ο δείκτης στο τέλος")
    i1 = st.one("SELECT * FROM km_invoices WHERE rid = 'r1'")
    ok(i1 and i1["supplier"] == "ΟΡΙΖΩΝ" and i1["number"] == "ΤΔΑ 4411" and i1["inv_date"] == "2026-10-02" and abs(i1["total"] - 65.45) < 0.001, "τιμολόγιο: προμηθευτής, αριθμός, ημερομηνία, σύνολο")
    ok(len(st.q("SELECT * FROM km_lines WHERE inv_id = ?", (i1["id"],))) == 2, "οι γραμμές στον πίνακα γραμμών (όχι σε JSON)")
    ok(st.one("SELECT approved FROM km_invoices WHERE rid = 'r2'")["approved"] == "auto", "αυτόματη έγκριση σημαδεύεται χωριστά (§9.8 Ε)")
    pf = base / "kostometro" / str(link["id"]) / "r1.jpg"
    ok(pf.exists() and pf.read_bytes() == b"\xff\xd8JPEG-1", "η φωτογραφία κατέβηκε και άνοιξε με το A")
    # έγγραφο FastWrite + Xero ως έχει
    doc = db.get_document(i1["doc_id"])
    data = json.loads(doc["result_json"])
    ok(doc["status"] == "Pending" and doc["user_id"] == uid and doc["file_path"] == str(pf), "έγγραφο FastWrite: «Pending» (ένα βήμα πριν το Approved), με τη φωτογραφία, στον σωστό χρήστη")
    bill = XERO["_extract_bill_data_from_doc"](data)
    ok(bill["supplier_name"] == "ΟΡΙΖΩΝ" and bill["invoice_number"] == "ΤΔΑ 4411" and bill["invoice_date"] == "2026-10-02" and
       len(bill["line_items"]) == 2 and bill["line_items"][0]["unit_amount"] == 1.5 and bill["line_items"][0]["quantity"] == 10,
       "🔴 Xero ως έχει: η ΑΛΗΘΙΝΗ _extract_bill_data_from_doc βγάζει προμηθευτή, αριθμό, ημερομηνία και 2 γραμμές")

    # 🔴 διακοπή στη μέση: γράμμα με κλειδί που ΔΕΝ έχουμε ακόμα → ο δείκτης ΔΕΝ προχωρά, τίποτα δεν χάνεται
    cur0 = st.one("SELECT cursor FROM km_link")["cursor"]
    srv.ring[2] = os.urandom(32)
    srv.post("w1", "inv", inv("w1", "ΝΕΟΣ", "W-1", "2026-10-07", [["Z1", "ΖΑΧΑΡΗ 1KG", "ΤΕΜ", 3, 1.2, None]], ph=[]), av=2)
    mb.sync_all()
    ok(st.one("SELECT cursor FROM km_link")["cursor"] == cur0 and not st.one("SELECT id FROM km_invoices WHERE rid = 'w1'"), "🔴 γράμμα που δεν ανοίγει → ο δείκτης ΔΕΝ προχωρά (ξαναδοκιμάζεται)")
    srv.give_key()
    mb.sync_all()
    ok(st.one("SELECT id FROM km_invoices WHERE rid = 'w1'") is not None, "μόλις έρθει το νέο κλειδί → το γράμμα μπαίνει")
    srv.post("w1", "del", {"v": 1, "kind": "del", "rid": "w1"})
    mb.sync_all()

    # ── αναζήτηση ──
    s = mb.search(page=1, size=25, user_id=uid)
    ok(s["total"] == 159 and len(s["items"]) == 25 and s["pages"] == 7, "αναζήτηση: σελίδα 25 από 159 (7 σελίδες)")
    ok(mb.search(size=10000)["size"] == K.SEARCH_MAX_SIZE, "🔴 μέγεθος σελίδας με ταβάνι (%d)" % K.SEARCH_MAX_SIZE)
    ok(mb.search(q="οριζων")["total"] == 1, "αναζήτηση χωρίς τόνους/κεφαλαία: «οριζων» → 1")
    ok(mb.search(q="γαλα")["total"] == 2, "αναζήτηση μέσα στις γραμμές: «γαλα» → 2 τιμολόγια")
    ok(mb.search(q="G77")["total"] == 1 and mb.search(q="g-77")["total"] == 1, "κωδικός σε μία μορφή: «G77» = «g-77»")
    ok(mb.search_lines(q="αλευρι")["total"] == 1, "αναζήτηση γραμμών: «αλευρι» → 1 γραμμή")
    ok(mb.search(date_from="2026-10-01", date_to="2026-10-31")["total"] == 2, "φίλτρο ημερομηνίας")
    ok(mb.search(user_id=other)["total"] == 0, "🔴 άλλος χρήστης του ίδιου υπολογιστή δεν βλέπει τις συνδέσεις μου")
    plan = st.q("EXPLAIN QUERY PLAN SELECT * FROM km_invoices i WHERE i.link_id = 1 AND i.deleted = 0 AND i.inv_date >= '2026-10-01' ORDER BY i.inv_date DESC LIMIT 25")
    ok(any("km_inv_date" in str(p.get("detail")) for p in plan), "🔴 η αναζήτηση ημερομηνίας χρησιμοποιεί ευρετήριο (όχι σάρωση πίνακα)")

    # ── διόρθωση λογιστή: ισχύει ΑΜΕΣΩΣ ──
    r = mb.fix(i1["id"], h={"total": "65,70"}, l=[{"i": 0, "f": "unit_price", "n": "1,55"}, {"i": 1, "f": "qty", "n": "2"}])
    ok(r["ok"] and r["h"] == {"total": [65.45, 65.7]} and r["l"] == [{"i": 0, "f": "unit_price", "o": 1.5, "n": 1.55}], "διόρθωση: μόνο ό,τι άλλαξε (σύνολο + τιμή γραμμής 1)")
    i1 = st.one("SELECT * FROM km_invoices WHERE rid = 'r1'")
    l0 = st.one("SELECT * FROM km_lines WHERE inv_id = ? AND n = 0", (i1["id"],))
    ok(abs(i1["total"] - 65.7) < 1e-9 and abs(l0["unit_price"] - 1.55) < 1e-9 and l0["fixed"] == 1 and i1["fix_state"] == "pending", "🔴 ισχύει ΑΜΕΣΩΣ στους πίνακες (σύνολο 65,70 · τιμή 1,55 · σημάδι)")
    ok(abs(l0["base_price"] - 1.55) < 1e-9, "η τιμή μονάδας ξαναϋπολογίζεται (1,55 €/λτ)")
    data = json.loads(db.get_document(i1["doc_id"])["result_json"])
    ok(data["total"] == 65.7 and data["line_items"][0]["unit_price"] == 1.55, "🔴 ισχύει ΑΜΕΣΩΣ και στο έγγραφο (εξαγωγές / Xero)")
    ok(not mb.fix(i1["id"], h={"total": "65,70"})["ok"], "ίδια τιμή → «δεν άλλαξε τίποτα»")
    # KM-PRO-F5 · ό,τι δεν θα δεχόταν το κινητό (acctValOk) ΔΕΝ γράφεται ούτε εδώ — αλλιώς οι δύο πλευρές χωρίζουν
    ok(mb.fix(i1["id"], h={"total": ""}).get("error") == "total_required", "🔴 F5 · το Σύνολο δεν αδειάζει (θα έβγαζε το τιμολόγιο από το λογιστήριο)")
    ok(mb.fix(i1["id"], h={"total": "nan"}).get("error") == "bad_number" and mb.fix(i1["id"], h={"net": "1e400"}).get("error") == "bad_number", "🔴 F5 · NaN / Infinity → bad_number")
    ok(mb.fix(i1["id"], l=[{"i": 0, "f": "qty", "n": "1e12"}]).get("error") == "bad_number", "F5 · τεράστιος αριθμός γραμμής → bad_number")
    ok(mb.fix(i1["id"], l=[{"i": 0, "f": "desc", "n": "x" * 201}]).get("error") == "too_long" and mb.fix(i1["id"], h={"number": "y" * 201}).get("error") == "too_long", "F5 · κείμενο > 200 → too_long")
    ok(abs(st.one("SELECT total FROM km_invoices WHERE rid = 'r1'")["total"] - 65.7) < 1e-9, "F5 · οι απορριφθείσες διορθώσεις δεν άγγιξαν τίποτα")
    # ο Boss στέλνει ΠΑΛΙΑ έκδοση (δεν έχει περάσει ακόμα τη διόρθωση) → η διόρθωση ΜΕΝΕΙ
    srv.post("r1", "inv", inv("r1", "ΟΡΙΖΩΝ", "ΤΔΑ 4411", "2026-10-02", [["K100", "ΓΑΛΑ ΦΡΕΣΚΟ 1LT", "ΛΤ", 10, 1.5, key("ΟΡΙΖΩΝ", "K100"), {"per": 1, "base": "L"}],
                                                                       ["K200", "ΑΛΕΥΡΙ ΣΑΚΙ 25KG", "ΤΕΜ", 2, 20.0, key("ΟΡΙΖΩΝ", "K200"), {"per": 25, "base": "kg"}]]))
    mb.sync_all()
    fid = r["id"]
    ok(srv.fixes.get(fid, {}).get("status") == "pending", "η διόρθωση έφυγε για τον Boss (σφραγισμένη)")
    envx = srv.open_env(fid)
    import hmac as _h, hashlib as _hl
    ok(envx["mac"] == _h.new(srv.ring[envx["av"]], envx["p"].encode(), _hl.sha256).hexdigest(), "🔴 η διόρθωση φέρει υπογραφή με το A (HMAC) — ο server δεν μπορεί να φτιάξει ψεύτικη")
    fx = srv.open_fix(fid)
    ok(fx["rid"] == "r1" and fx["h"]["total"] == [65.45, 65.7] and fx["l"][0]["n"] == 1.55 and fx["by"] == "Christofi & Co", "ο Boss ανοίγει τη διόρθωση: τι, από τι σε τι, από ποιον")
    i1 = st.one("SELECT * FROM km_invoices WHERE rid = 'r1'")
    ok(abs(i1["total"] - 65.7) < 1e-9 and abs(st.one("SELECT unit_price FROM km_lines WHERE inv_id = ? AND n = 0", (i1["id"],))["unit_price"] - 1.55) < 1e-9,
       "🔴 γράμμα του Boss ΠΡΙΝ περάσει η διόρθωση → η διόρθωση ΔΕΝ χάνεται")
    # ο Boss την πέρασε
    srv.fixes[fid]["status"] = "applied"
    srv.post("r1", "inv", inv("r1", "ΟΡΙΖΩΝ", "ΤΔΑ 4411", "2026-10-02", [["K100", "ΓΑΛΑ ΦΡΕΣΚΟ 1LT", "ΛΤ", 10, 1.55, key("ΟΡΙΖΩΝ", "K100"), {"per": 1, "base": "L"}],
                                                                       ["K200", "ΑΛΕΥΡΙ ΣΑΚΙ 25KG", "ΤΕΜ", 2, 20.0, key("ΟΡΙΖΩΝ", "K200"), {"per": 25, "base": "kg"}]],
                                   total=65.7, fixes=[{"id": fid, "st": "applied", "by": "Christofi & Co", "at": 1}]))
    mb.sync_all()
    i1 = st.one("SELECT * FROM km_invoices WHERE rid = 'r1'")
    ok(i1["fix_state"] == "applied" and st.one("SELECT state FROM km_fix_out WHERE id = ?", (fid,))["state"] == "applied", "✔ ο Boss την πέρασε → «η διόρθωσή σου πέρασε»")
    # ο Boss την αναίρεσε
    srv.fixes[fid]["status"] = "undone"
    srv.post("r1", "inv", inv("r1", "ΟΡΙΖΩΝ", "ΤΔΑ 4411", "2026-10-02", [["K100", "ΓΑΛΑ ΦΡΕΣΚΟ 1LT", "ΛΤ", 10, 1.5, key("ΟΡΙΖΩΝ", "K100"), {"per": 1, "base": "L"}],
                                                                       ["K200", "ΑΛΕΥΡΙ ΣΑΚΙ 25KG", "ΤΕΜ", 2, 20.0, key("ΟΡΙΖΩΝ", "K200"), {"per": 25, "base": "kg"}]],
                                   fixes=[{"id": fid, "st": "undone", "by": "Christofi & Co", "at": 1}]))
    mb.sync_all()
    i1 = st.one("SELECT * FROM km_invoices WHERE rid = 'r1'")
    ok(i1["fix_state"] == "undone" and abs(i1["total"] - 65.45) < 1e-9 and "αναίρεσε" in (i1["fix_note"] or ""), "🔴 ↩ αναίρεση του Boss → η τιμή γυρίζει (65,45) και ο λογιστής το βλέπει")
    data = json.loads(db.get_document(i1["doc_id"])["result_json"])
    ok(data["total"] == 65.45 and data["line_items"][0]["unit_price"] == 1.5, "η αναίρεση φτάνει και στο έγγραφο (εξαγωγές)")

    # ── «άλλαξε η αντιστοίχιση» ──
    i2 = st.one("SELECT * FROM km_invoices WHERE rid = 'r2'")
    db.update_document_status(i2["doc_id"], "Completed", json.dumps(dict(json.loads(db.get_document(i2["doc_id"])["result_json"]), _xero_invoice_id="XERO-1")))
    srv.post("_book", "book", {"v": 1, "kind": "book", "biz": "Ταβέρνα Ακτή",
                               "items": {key("ΟΡΙΖΩΝ", "K100"): {"sup": "ΟΡΙΖΩΝ", "code": "K100", "name": "ΓΑΛΑ ΦΡΕΣΚΟ 1LT", "pid": "PGALA", "pack": {"per": 1, "base": "L"}},
                                         key("ΑΚΤΗ", "G-77"): {"sup": "ΑΚΤΗ", "code": "G-77", "name": "ΓΑΛΑ ΦΡΕΣΚΟ 6x1LT", "pid": "PGALA", "pack": {"per": 6, "base": "L"}}},
                               "prods": {"PGALA": "ΓΑΛΑ ΦΡΕΣΚΟ 1LT"}})
    mb.sync_all()
    i2 = st.one("SELECT * FROM km_invoices WHERE rid = 'r2'")
    g = st.one("SELECT * FROM km_lines WHERE inv_id = ?", (i2["id"],))
    ok(i2["map_changed"] == 1 and g["map_changed"] == 1 and "ΓΑΛΑ ΦΡΕΣΚΟ 6x1LT" in g["map_note"] and "ΓΑΛΑ ΦΡΕΣΚΟ 1LT" in g["map_note"] and g["pid"] == "PGALA",
       "🔴 «ίδιο με» στο κινητό → η παλιά γραμμή ΑΚΤΗ G-77 σημαδεύεται «άλλαξε η αντιστοίχιση» (από τι σε τι)")
    i1 = st.one("SELECT * FROM km_invoices WHERE rid = 'r1'")
    ok(i1["map_changed"] == 0, "🔴 χωρίς θόρυβο: ο ΟΡΙΖΩΝ K100 απλώς έγινε κεντρικό προϊόν με το ΙΔΙΟ όνομα → καμία σήμανση")
    ok(mb.search(flag="map")["total"] == 1, "φίλτρο «⚠ άλλαξε η αντιστοίχιση» → 1")
    # ξαναέρχεται το ίδιο τιμολόγιο (με τη νέα αντιστοίχιση): η σήμανση ΜΕΝΕΙ ως «Το είδα»
    srv.post("r2", "inv", inv("r2", "ΑΚΤΗ", "INV-0777", "2026-10-05", [["G-77", "ΓΑΛΑ ΦΡΕΣΚΟ 6x1LT", "ΚΙΒ", 2, 8.7, "PGALA", {"per": 6, "base": "L"}]], approved="auto"))
    mb.sync_all()
    ok(st.one("SELECT map_changed FROM km_invoices WHERE rid = 'r2'")["map_changed"] == 1, "η σήμανση μένει ως να πατήσει ο λογιστής «Το είδα»")
    ok(json.loads(db.get_document(i2["doc_id"])["result_json"]).get("_xero_invoice_id") == "XERO-1", "🔴 ό,τι έγραψε το FastWrite (Xero) ΜΕΝΕΙ όταν ξαναέρθει το τιμολόγιο")
    mb.seen(i2["id"])
    ok(st.one("SELECT map_changed FROM km_invoices WHERE rid = 'r2'")["map_changed"] == 0, "«✔ Το είδα» → η σήμανση φεύγει")
    # αλλαγή που έρχεται ΜΟΝΟ με το τιμολόγιο (πριν φτάσει το βιβλίο)
    srv.post("r1", "inv", inv("r1", "ΟΡΙΖΩΝ", "ΤΔΑ 4411", "2026-10-02", [["K100", "ΓΑΛΑ ΦΡΕΣΚΟ 1LT", "ΛΤ", 10, 1.5, "PGALA", {"per": 1, "base": "L"}, "ΓΑΛΑ ΦΡΕΣΚΟ 1LT"],
                                                                       ["K200", "ΑΛΕΥΡΙ ΣΑΚΙ 25KG", "ΤΕΜ", 2, 20.0, "PALEV", {"per": 25, "base": "kg"}, "ΑΛΕΥΡΙ ΓΕΝΙΚΟ"]]))
    mb.sync_all()
    k2 = st.one("SELECT ln.* FROM km_lines ln JOIN km_invoices i ON i.id = ln.inv_id WHERE i.rid = 'r1' AND ln.n = 1")
    ok(k2["map_changed"] == 1 and k2["pid"] == "PALEV", "🔴 αλλαγή αντιστοίχισης που έρχεται μόνο με το τιμολόγιο → σημαδεύεται κι αυτή")
    mb.seen(k2["inv_id"])
    # συσκευασία που αλλάζει (6 → 12) = αλλαγή
    srv.post("_book", "book", {"v": 1, "kind": "book", "biz": "Ταβέρνα Ακτή",
                               "items": {key("ΑΚΤΗ", "G-77"): {"sup": "ΑΚΤΗ", "code": "G-77", "name": "ΓΑΛΑ", "pid": "PGALA", "pack": {"per": 12, "base": "L"}}}, "prods": {"PGALA": "ΓΑΛΑ ΦΡΕΣΚΟ 1LT"}})
    mb.sync_all()
    g = st.one("SELECT * FROM km_lines WHERE inv_id = ?", (i2["id"],))
    ok(g["map_changed"] == 1 and "συσκευασία 6 → 12" in g["map_note"] and abs(g["base_price"] - 0.725) < 1e-9, "συσκευασία 6 → 12: σήμανση + νέα τιμή μονάδας (0,725 €/λτ)")

    mb.seen(i2["id"])
    srv.post("_book", "book", {"v": 1, "kind": "book", "biz": "Ταβέρνα Ακτή",
                               "items": {key("ΑΚΤΗ", "G-77"): {"sup": "ΑΚΤΗ", "code": "G-77", "name": "ΓΑΛΑ", "pid": "PGALA", "pack": None}}, "prods": {"PGALA": "ΓΑΛΑ ΦΡΕΣΚΟ 1LT"}})
    mb.sync_all()
    g = st.one("SELECT * FROM km_lines WHERE inv_id = ?", (i2["id"],))
    ok(g["map_changed"] == 0 and g["per"] == 12, "βιβλίο ΧΩΡΙΣ επιβεβαιωμένη συσκευασία → κρατιέται αυτή της γραμμής (όχι «12 → —»)")
    # ένας κωδικός = ένα μικρό γράμμα «item» (κλίμακα: όχι όλο το βιβλίο σε κάθε αλλαγή)
    srv.post("i_g77", "item", {"v": 1, "kind": "item", "rid": "i_g77", "key": key("ΑΚΤΗ", "G-77"), "sup": "ΑΚΤΗ", "code": "G-77",
                               "name": "ΓΑΛΑ ΦΡΕΣΚΟ 6x1LT", "pid": "PGALA2", "pname": "ΓΑΛΑ ΑΓΕΛΑΔΟΣ", "pack": {"per": 12, "base": "L"}})
    mb.sync_all()
    g = st.one("SELECT * FROM km_lines WHERE inv_id = ?", (i2["id"],))
    ok(g["map_changed"] == 1 and g["pid"] == "PGALA2" and "ΓΑΛΑ ΑΓΕΛΑΔΟΣ" in g["map_note"], "γράμμα «item» (ένας κωδικός) → σήμανση στις γραμμές του")
    mb.seen(i2["id"])
    # ── σβησμένο από τον Boss ──
    before = mb.search(q="N5")["total"]
    srv.post("v5", "del", {"v": 1, "kind": "del", "rid": "v5"})
    mb.sync_all()
    ok(before >= 1 and mb.search(q="N5")["total"] == before - 1 and st.one("SELECT deleted FROM km_invoices WHERE rid = 'v5'")["deleted"] == 1, "σβησμένο από τον Boss → φεύγει από την αναζήτηση")
    srv.post("r2", "del", {"v": 1, "kind": "del", "rid": "r2"})
    mb.sync_all()
    ok(db.get_document(i2["doc_id"]) and json.loads(db.get_document(i2["doc_id"])["result_json"]).get("_km_deleted"), "🔴 σβησμένο που ΗΔΗ πήγε στο Xero: το έγγραφο μένει, με σήμανση")
    # ΦΤΣ καθαρό
    ok(mb.search_lines(q="αλευρι")["total"] == 1 and
       st.one("SELECT COUNT(*) AS n FROM km_line_fts")["n"] == st.one("SELECT COUNT(*) AS n FROM km_lines")["n"],
       "🔴 κάθε νέα έκδοση: η παλιά δεν μένει στο ευρετήριο κειμένου (ούτε ορφανές εγγραφές)")

    # ── καραντίνα: χαλασμένο γράμμα / ετικέτα που δεν ταιριάζει → καταγράφεται, η ροή ΣΥΝΕΧΙΖΕΙ ──
    srv.seq += 1
    srv.mail.append({"seq": srv.seq, "rid": "bad1", "kind": "inv", "a_ver": max(srv.ring), "at": "x", "body": base64.b64encode(os.urandom(64)).decode()})
    srv.post("v7", "del", {"v": 1, "kind": "inv", "rid": "OTHER"})      # ο server λέει «del v7», μέσα γράφει άλλο
    srv.post("ok9", "inv", inv("ok9", "ΜΕΤΑ", "M-9", "2026-10-08", [["Q1", "ΜΕΤΑ ΤΗΝ ΚΑΡΑΝΤΙΝΑ", "ΤΕΜ", 1, 2.0, None]], ph=[]))
    mb.sync_all()
    ok(st.one("SELECT COUNT(*) AS n FROM km_bad")["n"] == 2 and st.one("SELECT id FROM km_invoices WHERE rid = 'ok9'") is not None,
       "🔴 χαλασμένο γράμμα ή ετικέτα server ≠ περιεχόμενο → καραντίνα, και τα επόμενα μπαίνουν κανονικά")
    ok(st.one("SELECT deleted FROM km_invoices WHERE rid = 'v7'")["deleted"] == 0, "🔴 ο server ΔΕΝ μπορεί να σβήσει τιμολόγιο αλλάζοντας την ετικέτα")
    # ── κακόβουλο κείμενο από τον πελάτη ──
    srv.post("x1", "inv", inv("x1", "<img src=x onerror=alert(1)>", "<b>1</b>", "<script>", [["<i>", "<svg onload=1>", "ΤΕΜ", 1, 1.0, None]], ph=["../../etc", "ok_id"]))
    mb.sync_all()
    x1 = st.one("SELECT * FROM km_invoices WHERE rid = 'x1'")
    dd = json.loads(db.get_document(x1["doc_id"])["result_json"])
    ok("<" not in db.get_document(x1["doc_id"])["filename"] and "<" not in dd["supplier_name"] and "<" not in dd["line_items"][0]["description"],
       "🔴 κείμενο του πελάτη με <script>/<img> δεν μπαίνει ωμό στα «Έγγραφα»")
    ok(x1["inv_date"] != "<script>" and json.loads(x1["photos"]) == ["ok_id"], "🔴 ημερομηνία μόνο ΕΕΕΕ-ΜΜ-ΗΗ · id φωτογραφίας με «../» πετιέται")
    # ── φωτογραφία που δεν κατέβηκε → ξαναδοκιμάζεται ──
    srv.post("p1", "inv", inv("p1", "ΦΩΤΟ", "F-1", "2026-10-09", [["Z9", "ΦΩΤΟΓΡΑΦΙΑ ΑΡΓΟΤΕΡΑ", "ΤΕΜ", 1, 1.0, None]], ph=["p1"]))
    mb.sync_all()
    ok(st.one("SELECT COUNT(*) AS n FROM km_photo_need WHERE pid = 'p1'")["n"] == 1, "φωτογραφία που δεν βρέθηκε → μπαίνει στη λίστα «ξαναδοκίμασε»")
    srv.photos["p1"] = K.seal(srv.ring[max(srv.ring)], b"\xff\xd8LATE")
    mb.sync_all()
    p1 = st.one("SELECT * FROM km_invoices WHERE rid = 'p1'")
    ok(st.one("SELECT COUNT(*) AS n FROM km_photo_need WHERE pid = 'p1'")["n"] == 0 and (db.get_document(p1["doc_id"])["file_path"] or "").endswith("p1.jpg"),
       "🔴 στον επόμενο γύρο κατεβαίνει και μπαίνει στο έγγραφο")
    # ── διόρθωση που ο Boss ΑΠΕΡΡΙΨΕ (είχε αλλάξει το τιμολόγιο στο μεταξύ) → γυρνάμε στις τιμές του Boss ──
    rx = mb.fix(p1["id"], h={"total": "99"})
    mb.sync_all()
    ok(abs(st.one("SELECT total FROM km_invoices WHERE id = ?", (p1["id"],))["total"] - 99) < 1e-9, "(η διόρθωση ισχύει τοπικά)")
    srv.fixes[rx["id"]]["status"] = "rejected"
    mb.sync_all()
    p1 = st.one("SELECT * FROM km_invoices WHERE rid = 'p1'")
    ok(p1["fix_state"] == "rejected" and abs(p1["total"] - 1.19) < 1e-9 and "ΔΕΝ πέρασε" in p1["fix_note"], "🔴 «δεν πέρασε» → πίσω στις τιμές του Boss (1,19), με εξήγηση")
    # ── έγγραφο που άλλαξε στα «Έγγραφα» → δεν το πατάμε σιωπηλά ──
    d1 = db.get_document(p1["doc_id"])
    dj = json.loads(d1["result_json"]); dj["total"] = 5.0
    db.update_document_status(d1["id"], d1["status"], json.dumps(dj))
    srv.post("p1", "inv", inv("p1", "ΦΩΤΟ", "F-1", "2026-10-09", [["Z9", "ΦΩΤΟΓΡΑΦΙΑ ΑΡΓΟΤΕΡΑ", "ΤΕΜ", 2, 1.0, None]], ph=["p1"]))
    mb.sync_all()
    p1 = st.one("SELECT * FROM km_invoices WHERE rid = 'p1'")
    ok(json.loads(db.get_document(p1["doc_id"])["result_json"])["total"] == 5.0 and "άλλαξε" in (p1["doc_note"] or ""),
       "🔴 το έγγραφο που διόρθωσε ο λογιστής στα «Έγγραφα» ΔΕΝ γράφεται από πάνω — φαίνεται σημείωση")
    ok(mb.search(q='"')["ok"] and mb.search(q='"γαλα')["ok"], "αναζήτηση με «\"» δεν σπάει")

    # ── ανάκληση ──
    srv.acct["status"] = "revoked"
    r = mb.sync_all()
    ok(r[0].get("revoked") and st.one("SELECT status FROM km_link")["status"] == "revoked", "🔴 ανάκληση → η σύνδεση κλείνει")
    ok(mb.search(user_id=uid)["total"] > 100, "τα τιμολόγια ΜΕΝΟΥΝ στο λογιστήριο (είναι τα βιβλία του πελάτη)")
    ok(not mb.fix(i1["id"], h={"total": "1"})["ok"], "ανακλημένη σύνδεση: καμία νέα διόρθωση")

    print("\n%d ✔ · %d ✘" % (PASS, FAIL))
    st.conn.close()
    db.close()


try:
    main()
except Exception as e:  # noqa
    import traceback
    traceback.print_exc()
    print("  ✘ ΚΑΤΑΡΡΕΥΣΗ: %s" % e)
    sys.exit(0 if ONLY is not None else 1)
if ONLY is not None:
    sys.exit(0 if FAIL else 1)
sys.exit(1 if FAIL else 0)
