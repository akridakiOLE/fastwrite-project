import urllib.request
# Διάβασε το υπάρχον main_api.py και πρόσθεσε το UI endpoint
content = open("/app/projects/main_api.py").read()
if "/ui" not in content:
    addition = '''
@app.get("/ui")
@app.get("/ui/")
def serve_ui():
    return send_file("/app/projects/static/index.html")
'''
    open("/app/projects/main_api.py","w").write(content + addition)
    print("OK - UI endpoint added")
else:
    print("Already exists")
