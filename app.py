"""
app.py — API REST Flask pour DiskCloner
======================================

Endpoints :
  GET  /api/disks              → Liste des disques détectés
  GET  /api/disks/<name>       → Infos d'un disque spécifique
  POST /api/clone              → Démarrer un clonage
  GET  /api/clone/status       → État en temps réel (polling)
  POST /api/clone/cancel       → Annuler le clonage en cours
  GET  /api/logs               → Dernières lignes du journal
  GET  /api/health             → Statut de l'application

Lancement :
  sudo python3 app.py           (root requis pour /dev/rdsk/)
  ou
  sudo flask run --host=0.0.0.0 --port=5000
"""

import os
import sys
import json
import time
from pathlib import Path
from flask import Flask, jsonify, request
from flask_cors import CORS

# Ajouter le répertoire courant au path pour importer engine_wrapper
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from engine_wrapper import DiskClonerEngine, CloneError

# ─── Initialisation ──────────────────────────────────────────────────────────

app = Flask(__name__)

# CORS : autoriser les requêtes depuis Angular (port 4200 en dev)
CORS(app, resources={
    r"/api/*": {
        "origins": ["http://localhost:4200", "http://127.0.0.1:4200"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
    }
})

# Instance unique du moteur (partagée entre toutes les requêtes)
engine = DiskClonerEngine(
    lib_path=os.path.join(os.path.dirname(__file__), "../engine/libclone.so")
)

LOG_FILE = "/var/log/diskcloner.log"

# ─── Helpers ─────────────────────────────────────────────────────────────────

def success(data=None, message="OK", code=200):
    return jsonify({"success": True, "message": message, "data": data}), code

def error(message, code=400, error_code=None):
    resp = {"success": False, "message": message}
    if error_code is not None:
        resp["error_code"] = error_code
    return jsonify(resp), code

# ─── Routes API ──────────────────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    """Vérification que l'API est up et que le moteur est chargé."""
    is_root = (os.getuid() == 0)
    return success({
        "version":      "1.0.0",
        "engine_ready": not engine._mock_mode,
        "mock_mode":    engine._mock_mode,
        "is_root":      is_root,
        "clone_running": engine.is_running(),
        "warning":      None if is_root else
                        "L'application ne tourne pas en root — les opérations réelles échoueront."
    })


@app.route("/api/disks", methods=["GET"])
def get_disks():
    """Retourne la liste de tous les disques raw détectés."""
    try:
        disks = engine.list_disks()
        return success([d.to_dict() for d in disks])
    except Exception as e:
        return error(f"Impossible de lister les disques: {str(e)}", 500)


@app.route("/api/disks/<disk_name>", methods=["GET"])
def get_disk(disk_name):
    """Retourne les infos d'un disque spécifique par son nom (ex: c0t0d0)."""
    # Validation basique du nom (éviter les path traversals)
    if not disk_name.replace("t", "").replace("d", "").replace("c", "").isdigit():
        return error("Nom de disque invalide", 400)

    path = f"/dev/rdsk/{disk_name}"
    try:
        disks = engine.list_disks()
        found = next((d for d in disks if d.name == disk_name or d.path == path), None)
        if not found:
            return error(f"Disque '{disk_name}' introuvable", 404)
        return success(found.to_dict())
    except Exception as e:
        return error(str(e), 500)


@app.route("/api/clone", methods=["POST"])
def start_clone():
    """
    Démarre une opération de clonage.

    Body JSON attendu :
    {
        "src":        "/dev/rdsk/c0t0d0",   // source (disque ou fichier)
        "dst":        "/dev/rdsk/c0t1d0",   // destination
        "block_size": 1048576,              // optionnel, défaut 1 Mo
        "force":      false,                // optionnel, ignorer les warnings
        "confirm":    "CLONER"              // OBLIGATOIRE — confirmation explicite
    }
    """
    data = request.get_json(silent=True)
    if not data:
        return error("Body JSON manquant", 400)

    # ── Validation de la confirmation ──
    confirm = data.get("confirm", "").strip()
    if confirm != "CLONER":
        return error(
            "Confirmation manquante. Vous devez envoyer { \"confirm\": \"CLONER\" } pour valider.",
            403
        )

    src = data.get("src", "").strip()
    dst = data.get("dst", "").strip()

    if not src or not dst:
        return error("Les champs 'src' et 'dst' sont obligatoires", 400)

    if src == dst:
        return error("La source et la destination sont identiques", 400)

    # Validation des chemins (raw devices ou fichiers .img/.zfs)
    valid_prefixes = ["/dev/rdsk/", "/dev/dsk/", "/tmp/", "/home/", "/export/"]
    valid_extensions = [".img", ".zfs", ".iso", ".raw"]

    src_ok = any(src.startswith(p) for p in valid_prefixes) or \
             any(src.endswith(e) for e in valid_extensions)
    dst_ok = any(dst.startswith(p) for p in valid_prefixes) or \
             any(dst.endswith(e) for e in valid_extensions)

    if not src_ok:
        return error(f"Chemin source invalide ou non autorisé: {src}", 400)
    if not dst_ok:
        return error(f"Chemin destination invalide ou non autorisé: {dst}", 400)

    block_size = int(data.get("block_size", 1024 * 1024))
    force      = bool(data.get("force", False))

    # ── Lancement du clonage ──
    if engine.is_running():
        return error("Un clonage est déjà en cours", 409)

    started = engine.clone_async(
        src=src,
        dst=dst,
        block_size=block_size,
        force=force,
    )

    if not started:
        return error("Impossible de démarrer le clonage", 500)

    return success({
        "src":        src,
        "dst":        dst,
        "block_size": block_size,
        "force":      force,
    }, message="Clonage démarré", code=202)


@app.route("/api/clone/status", methods=["GET"])
def clone_status():
    """
    Retourne l'état en temps réel du clonage.
    L'interface Angular poll cet endpoint toutes les secondes.
    """
    status = engine.get_status()
    return success(status.to_dict())


@app.route("/api/clone/cancel", methods=["POST"])
def cancel_clone():
    """Annule le clonage en cours."""
    if not engine.is_running():
        return error("Aucun clonage en cours", 400)
    engine.cancel()
    return success(message="Annulation demandée")


@app.route("/api/logs", methods=["GET"])
def get_logs():
    """Retourne les N dernières lignes du fichier de log."""
    n = min(int(request.args.get("n", 100)), 500)
    try:
        if os.path.exists(LOG_FILE):
            with open(LOG_FILE, "r") as f:
                lines = f.readlines()
            return success({"lines": lines[-n:], "total": len(lines)})
        return success({"lines": [], "total": 0})
    except Exception as e:
        return error(f"Impossible de lire les logs: {str(e)}", 500)


@app.route("/api/logs/clear", methods=["POST"])
def clear_logs():
    """Vide le fichier de log."""
    try:
        open(LOG_FILE, "w").close()
        return success(message="Logs effacés")
    except PermissionError:
        return error("Permission refusée pour effacer les logs", 403)


# ─── Error handlers ──────────────────────────────────────────────────────────

@app.errorhandler(404)
def not_found(e):
    return error("Endpoint introuvable", 404)

@app.errorhandler(405)
def method_not_allowed(e):
    return error("Méthode HTTP non autorisée", 405)

@app.errorhandler(500)
def internal_error(e):
    return error(f"Erreur interne: {str(e)}", 500)


# ─── Point d'entrée ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    if os.getuid() != 0:
        print("⚠️  ATTENTION: Ce serveur devrait tourner en root pour accéder à /dev/rdsk/")
        print("   Lancez avec : sudo python3 app.py")
        print("   En mode mock (simulation) pour le développement...\n")

    print("🚀 DiskCloner API démarrée sur http://0.0.0.0:5000")
    print(f"   Mode: {'RÉEL (Solaris)' if not engine._mock_mode else 'SIMULATION (dev)'}")
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=False,     # Ne JAMAIS mettre True en production avec root
        threaded=True,   # Indispensable pour le polling status en parallèle
    )
