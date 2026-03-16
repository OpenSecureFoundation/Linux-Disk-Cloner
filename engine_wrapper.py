"""
engine_wrapper.py — Wrapper Python/ctypes pour libclone.so

Expose le moteur C comme un module Python propre.
Utilisé par l'API Flask pour piloter les opérations de clonage.

Utilisation :
    from engine_wrapper import DiskClonerEngine
    engine = DiskClonerEngine()
    disks = engine.list_disks()
    engine.clone_async(src='/dev/rdsk/c0t0d0', dst='/dev/rdsk/c0t1d0')
    status = engine.get_status()
"""

import ctypes
import ctypes.util
import os
import threading
import time
from dataclasses import dataclass, field
from typing import Optional, List, Callable
from enum import IntEnum

# ─── Chemin vers la bibliothèque compilée ────────────────────────────────────
_LIB_PATHS = [
    os.path.join(os.path.dirname(__file__), "libclone.so"),
    "/usr/local/lib/libclone.so",
    "./libclone.so",
]

# ─── Codes d'erreur (mirroir du C) ───────────────────────────────────────────
class CloneError(IntEnum):
    OK             =  0
    OPEN_SRC       = -1
    OPEN_DST       = -2
    READ           = -3
    WRITE          = -4
    DISK_MOUNTED   = -5
    SYSTEM_DISK    = -6
    NO_PERM        = -7
    INVALID_PARAM  = -8
    IOCTL          = -9

ERROR_MESSAGES = {
    CloneError.OPEN_SRC:      "Impossible d'ouvrir le disque source",
    CloneError.OPEN_DST:      "Impossible d'ouvrir le disque destination",
    CloneError.READ:          "Erreur de lecture sur la source",
    CloneError.WRITE:         "Erreur d'écriture sur la destination",
    CloneError.DISK_MOUNTED:  "Le disque destination est actuellement monté",
    CloneError.SYSTEM_DISK:   "Opération refusée : disque système détecté",
    CloneError.NO_PERM:       "Droits insuffisants — lancez avec sudo",
    CloneError.INVALID_PARAM: "Paramètres invalides",
    CloneError.IOCTL:         "Erreur d'accès hardware (ioctl)",
}

# ─── Structures ctypes (miroir exact des structs C) ──────────────────────────

MAX_PATH_LEN = 256

class CDiskInfo(ctypes.Structure):
    """Miroir de struct DiskInfo en C"""
    _fields_ = [
        ("path",          ctypes.c_char * MAX_PATH_LEN),
        ("name",          ctypes.c_char * 64),
        ("size_bytes",    ctypes.c_uint64),
        ("size_human",    ctypes.c_char * 32),
        ("is_mounted",    ctypes.c_int),
        ("mount_point",   ctypes.c_char * MAX_PATH_LEN),
        ("is_system_disk", ctypes.c_int),
    ]

class CDiskList(ctypes.Structure):
    """Miroir de struct DiskList en C"""
    _fields_ = [
        ("disks", CDiskInfo * 64),
        ("count", ctypes.c_int),
    ]

class CCloneParams(ctypes.Structure):
    """Miroir de struct CloneParams en C"""
    _fields_ = [
        ("src_path",   ctypes.c_char * MAX_PATH_LEN),
        ("dst_path",   ctypes.c_char * MAX_PATH_LEN),
        ("block_size", ctypes.c_uint32),
        ("force",      ctypes.c_int),
    ]

class CCloneStatus(ctypes.Structure):
    """Miroir de struct CloneStatus en C"""
    _fields_ = [
        ("bytes_total",  ctypes.c_uint64),
        ("bytes_done",   ctypes.c_uint64),
        ("percent",      ctypes.c_double),
        ("speed_mbps",   ctypes.c_double),
        ("elapsed_sec",  ctypes.c_uint64),
        ("eta_sec",      ctypes.c_uint64),
        ("status",       ctypes.c_int),
        ("message",      ctypes.c_char * 256),
        ("error_code",   ctypes.c_int),
    ]

# ─── Dataclasses Python (retournées par l'API publique) ─────────────────────

@dataclass
class DiskInfo:
    path:           str
    name:           str
    size_bytes:     int
    size_human:     str
    is_mounted:     bool
    mount_point:    str
    is_system_disk: bool

    def to_dict(self):
        return {
            "path":           self.path,
            "name":           self.name,
            "size_bytes":     self.size_bytes,
            "size_human":     self.size_human,
            "is_mounted":     self.is_mounted,
            "mount_point":    self.mount_point,
            "is_system_disk": self.is_system_disk,
        }

@dataclass
class CloneStatus:
    bytes_total:  int     = 0
    bytes_done:   int     = 0
    percent:      float   = 0.0
    speed_mbps:   float   = 0.0
    elapsed_sec:  int     = 0
    eta_sec:      int     = 0
    status:       str     = "idle"   # idle | running | done | error
    message:      str     = ""
    error_code:   int     = 0
    error_message: str    = ""

    def to_dict(self):
        return {
            "bytes_total":   self.bytes_total,
            "bytes_done":    self.bytes_done,
            "percent":       round(self.percent, 2),
            "speed_mbps":    round(self.speed_mbps, 2),
            "elapsed_sec":   self.elapsed_sec,
            "eta_sec":       self.eta_sec,
            "status":        self.status,
            "message":       self.message,
            "error_code":    self.error_code,
            "error_message": self.error_message,
        }

# ─── Classe principale ───────────────────────────────────────────────────────

class DiskClonerEngine:
    """
    Interface Python vers le moteur de clonage C (libclone.so).

    Toutes les opérations longues (clone_async) tournent dans un thread
    séparé pour ne pas bloquer l'API Flask.
    """

    def __init__(self, lib_path: Optional[str] = None):
        self._lib = self._load_library(lib_path)
        self._setup_signatures()
        self._clone_thread: Optional[threading.Thread] = None
        self._mock_mode = False  # True si libclone.so absent (dev sur Linux)

    def _load_library(self, lib_path: Optional[str]) -> Optional[ctypes.CDLL]:
        """Charge libclone.so depuis les chemins connus."""
        paths = [lib_path] + _LIB_PATHS if lib_path else _LIB_PATHS
        for p in paths:
            if p and os.path.exists(p):
                try:
                    lib = ctypes.CDLL(p)
                    print(f"[DiskClonerEngine] Bibliothèque chargée: {p}")
                    return lib
                except OSError as e:
                    print(f"[DiskClonerEngine] Erreur chargement {p}: {e}")

        # Mode mock pour développement sur Linux/macOS sans Solaris
        print("[DiskClonerEngine] ATTENTION: libclone.so introuvable — mode simulation activé")
        self._mock_mode = True
        return None

    def _setup_signatures(self):
        """Déclare les types de retour et paramètres des fonctions C."""
        if not self._lib:
            return
        # int list_disks(DiskList *list)
        self._lib.list_disks.restype  = ctypes.c_int
        self._lib.list_disks.argtypes = [ctypes.POINTER(CDiskList)]

        # int clone_disk(const CloneParams *params)
        self._lib.clone_disk.restype  = ctypes.c_int
        self._lib.clone_disk.argtypes = [ctypes.POINTER(CCloneParams)]

        # void get_status(CloneStatus *out)
        self._lib.get_status.restype  = None
        self._lib.get_status.argtypes = [ctypes.POINTER(CCloneStatus)]

        # void cancel_clone(void)
        self._lib.cancel_clone.restype  = None
        self._lib.cancel_clone.argtypes = []

        # int get_disk_info(const char *path, DiskInfo *out)
        self._lib.get_disk_info.restype  = ctypes.c_int
        self._lib.get_disk_info.argtypes = [ctypes.c_char_p, ctypes.POINTER(CDiskInfo)]

    # ── API publique ─────────────────────────────────────────────────────────

    def list_disks(self) -> List[DiskInfo]:
        """Retourne la liste des disques raw détectés."""
        if self._mock_mode:
            return self._mock_list_disks()

        disk_list = CDiskList()
        count = self._lib.list_disks(ctypes.byref(disk_list))

        result = []
        for i in range(max(0, count)):
            d = disk_list.disks[i]
            result.append(DiskInfo(
                path=d.path.decode("utf-8", errors="replace"),
                name=d.name.decode("utf-8", errors="replace"),
                size_bytes=d.size_bytes,
                size_human=d.size_human.decode("utf-8", errors="replace"),
                is_mounted=bool(d.is_mounted),
                mount_point=d.mount_point.decode("utf-8", errors="replace"),
                is_system_disk=bool(d.is_system_disk),
            ))
        return result

    def clone_async(
        self,
        src: str,
        dst: str,
        block_size: int = 1024 * 1024,
        force: bool = False,
        on_complete: Optional[Callable] = None,
    ) -> bool:
        """
        Lance le clonage dans un thread séparé.
        Retourne True si démarré, False si déjà en cours.
        La progression est accessible via get_status().
        """
        if self._clone_thread and self._clone_thread.is_alive():
            return False  # Déjà en cours

        def _run():
            if self._mock_mode:
                self._mock_clone(src, dst)
            else:
                params = CCloneParams()
                params.src_path   = src.encode("utf-8")
                params.dst_path   = dst.encode("utf-8")
                params.block_size = ctypes.c_uint32(block_size)
                params.force      = ctypes.c_int(1 if force else 0)
                self._lib.clone_disk(ctypes.byref(params))
            if on_complete:
                on_complete(self.get_status())

        self._clone_thread = threading.Thread(target=_run, daemon=True)
        self._clone_thread.start()
        return True

    def get_status(self) -> CloneStatus:
        """Retourne l'état courant de l'opération."""
        if self._mock_mode:
            return self._mock_status

        c_status = CCloneStatus()
        self._lib.get_status(ctypes.byref(c_status))

        status_map = {0: "idle", 1: "running", 2: "done", 3: "error"}
        st = CloneStatus(
            bytes_total  = c_status.bytes_total,
            bytes_done   = c_status.bytes_done,
            percent      = c_status.percent,
            speed_mbps   = c_status.speed_mbps,
            elapsed_sec  = c_status.elapsed_sec,
            eta_sec      = c_status.eta_sec,
            status       = status_map.get(c_status.status, "idle"),
            message      = c_status.message.decode("utf-8", errors="replace"),
            error_code   = c_status.error_code,
        )
        if st.error_code in [e.value for e in CloneError]:
            st.error_message = ERROR_MESSAGES.get(CloneError(st.error_code), "Erreur inconnue")
        return st

    def cancel(self):
        """Annule l'opération en cours."""
        if self._mock_mode:
            self._mock_cancel = True
            return
        if self._lib:
            self._lib.cancel_clone()

    def is_running(self) -> bool:
        return self._clone_thread is not None and self._clone_thread.is_alive()

    # ── Mode simulation (développement sans OpenSolaris) ─────────────────────

    def _mock_list_disks(self) -> List[DiskInfo]:
        """Retourne des disques fictifs pour le développement."""
        return [
            DiskInfo("/dev/rdsk/c0t0d0", "c0t0d0", 128_000_000_000,
                     "119.2 GB", True, "/", True),
            DiskInfo("/dev/rdsk/c0t1d0", "c0t1d0", 256_000_000_000,
                     "238.4 GB", False, "", False),
            DiskInfo("/dev/rdsk/c1t0d0", "c1t0d0", 500_000_000_000,
                     "465.7 GB", False, "", False),
        ]

    def _mock_clone(self, src: str, dst: str):
        """Simule une progression de clonage pour le développement."""
        import random
        self._mock_cancel = False
        total = 128_000_000_000
        self._mock_status = CloneStatus(
            bytes_total=total, status="running", message="Démarrage simulation..."
        )
        for i in range(101):
            if getattr(self, '_mock_cancel', False):
                self._mock_status.status = "error"
                self._mock_status.message = "Annulé"
                return
            done = int(total * i / 100)
            speed = random.uniform(80, 200)
            self._mock_status = CloneStatus(
                bytes_total=total,
                bytes_done=done,
                percent=float(i),
                speed_mbps=speed,
                elapsed_sec=i * 2,
                eta_sec=max(0, (100 - i) * 2),
                status="running" if i < 100 else "done",
                message=f"Copie en cours... {i}% ({speed:.1f} Mo/s)" if i < 100 else "Terminé !",
            )
            time.sleep(0.15)

    _mock_status = CloneStatus()
    _mock_cancel = False
