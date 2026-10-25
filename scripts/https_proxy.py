"""Lightweight SSL Reverse Proxy for HireNeuron Verity.
Terminates TLS using cert.pem and key.pem on port 3443 and forwards to Next.js on port 3000.
Enables physical mobile smartphones on the same Wi-Fi network to access camera/mic via HTTPS.
"""
import ssl, http.server, urllib.request, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CERT_FILE = ROOT / 'cert.pem'
KEY_FILE = ROOT / 'key.pem'

class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self._proxy('GET')

    def do_POST(self):
        self._proxy('POST')

    def do_PATCH(self):
        self._proxy('PATCH')

    def do_DELETE(self):
        self._proxy('DELETE')

    def _proxy(self, method):
        url = f'http://127.0.0.1:3000{self.path}'
        content_len = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_len) if content_len > 0 else None
        
        req_headers = {k: v for k, v in self.headers.items() if k.lower() not in ('host', 'content-length')}
        req = urllib.request.Request(url, data=body, headers=req_headers, method=method)
        
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                self.send_response(resp.status)
                for k, v in resp.getheaders():
                    if k.lower() not in ('transfer-encoding', 'content-encoding'):
                        self.send_header(k, v)
                self.end_headers()
                self.wfile.write(resp.read())
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            for k, v in e.headers.items():
                if k.lower() not in ('transfer-encoding', 'content-encoding'):
                    self.send_header(k, v)
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as ex:
            self.send_response(502)
            self.end_headers()
            self.wfile.write(str(ex).encode())

def run():
    if not CERT_FILE.exists() or not KEY_FILE.exists():
        print(f"Missing SSL cert files: {CERT_FILE}, {KEY_FILE}")
        sys.exit(1)
        
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=str(CERT_FILE), keyfile=str(KEY_FILE))
    
    server_address = ('0.0.0.0', 3443)
    httpd = http.server.HTTPServer(server_address, ProxyHandler)
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
    print("HTTPS Reverse Proxy active on https://0.0.0.0:3443 (Forwarding to http://127.0.0.1:3000)")
    httpd.serve_forever()

if __name__ == '__main__':
    run()
