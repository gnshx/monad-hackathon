import os
import sys
import mimetypes
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 3000
WEB_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), 'apps', 'web'))

mimetypes.init()
mimetypes.add_type('text/javascript', '.js')
mimetypes.add_type('text/javascript', '.mjs')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('image/jpeg', '.jpg')
mimetypes.add_type('image/jpeg', '.jpeg')
mimetypes.add_type('application/json', '.json')

class AgentTrustHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def do_GET(self):
        # Fallback for root or clean SPA routes
        clean_path = self.path.split('?')[0]
        local_path = os.path.join(WEB_DIR, clean_path.lstrip('/'))

        # Check public directory as well
        public_path = os.path.join(WEB_DIR, 'public', clean_path.lstrip('/'))
        if not os.path.exists(local_path) and os.path.exists(public_path):
            self.path = '/public' + self.path

        return super().do_GET()

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

def run():
    server_address = ('0.0.0.0', PORT)
    httpd = HTTPServer(server_address, AgentTrustHandler)
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    print(f"AgentTrust Dashboard running natively on host at: http://localhost:{PORT}")
    print(f"Serving from: {WEB_DIR}")
    sys.stdout.flush()
    httpd.serve_forever()

if __name__ == '__main__':
    run()
