import http.server
import socket
import os
import webbrowser

PORT = 8080
DIRECTORY = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web-app")

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # En-têtes pour autoriser les PWA et Service Workers
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

def get_local_ips():
    addresses = set()
    try:
        addresses.update(
            entry[4][0]
            for entry in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)
        )
    except OSError:
        pass

    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("8.8.8.8", 80))
        addresses.add(probe.getsockname()[0])
    except OSError:
        pass
    finally:
        probe.close()

    usable = sorted(
        address for address in addresses
        if not address.startswith(("127.", "169.254.")) and address != "0.0.0.0"
    )
    return usable or ["127.0.0.1"]

def main():
    try:
        httpd = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    except OSError as error:
        print(f"Impossible de démarrer le serveur sur le port {PORT} : {error}")
        print("Vérifiez qu'aucune autre application n'utilise ce port.")
        return 1

    with httpd:
        print("=" * 65)
        print("      VÉLOTRAINER - SERVEUR LOCAL POUR VAN RYSEL D100")
        print("=" * 65)
        print("\n[+] Serveur démarré et à l'écoute sur le réseau local.")
        print(f"\n -> Sur ce PC : http://localhost:{PORT}/")
        print(" -> Sur la TV ou le smartphone (même Wi-Fi) :")
        for address in get_local_ips():
            print(f"    http://{address}:{PORT}/")
        print("\nGardez cette fenêtre ouverte pendant l'utilisation.")
        print("Si la TV ne se connecte pas, autorisez Python sur le réseau")
        print("privé dans le Pare-feu Windows et vérifiez le Wi-Fi de la TV.")
        print("\nAppuyez sur Ctrl+C pour arrêter le serveur.\n")

        webbrowser.open(f"http://localhost:{PORT}/")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nArrêt du serveur.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
