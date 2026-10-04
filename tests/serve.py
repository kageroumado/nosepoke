"""Serve local game assets with capacity for parallel browser tests."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys


class TestServer(ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True


class AssetHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"


root = Path(__file__).resolve().parents[1]
handler = partial(AssetHandler, directory=str(root))
with TestServer(("127.0.0.1", int(sys.argv[1])), handler) as server:
    server.serve_forever()
