/*
 * clone_engine.c — Moteur de clonage bas niveau pour OpenSolaris/OpenIndiana
 *
 * Recrée le comportement de `dd` depuis zéro :
 *   - Lit les blocs depuis un raw device (/dev/rdsk/...)
 *   - Écrit bloc par bloc vers la destination
 *   - Calcule la progression en temps réel
 *   - Expose une API C simple appelée via ctypes (Python)
 *
 * Compilation sur OpenIndiana :
 *   gcc -O2 -Wall -shared -fPIC -o libclone.so clone_engine.c
 *
 * Droits requis : root (accès /dev/rdsk/)
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <time.h>

/* Solaris-specific headers */
#include <sys/types.h>
#include <sys/stat.h>
#include <sys/dkio.h>       /* DKIOCGMEDIAINFO — taille du disque */
#include <sys/vtoc.h>       /* Structure des partitions Solaris */
#include <sys/mnttab.h>     /* /etc/mnttab — disques montés */

/* ─── Constantes ─────────────────────────────────────────────── */
#define BLOCK_SIZE_DEFAULT  (1 * 1024 * 1024)   /* 1 Mo par défaut */
#define BLOCK_SIZE_MIN      512
#define BLOCK_SIZE_MAX      (64 * 1024 * 1024)  /* 64 Mo max */
#define MAX_DISKS           64
#define MAX_PATH_LEN        256
#define LOG_FILE            "/var/log/diskcloner.log"

/* ─── Codes de retour ────────────────────────────────────────── */
#define ERR_OK              0
#define ERR_OPEN_SRC        -1
#define ERR_OPEN_DST        -2
#define ERR_READ            -3
#define ERR_WRITE           -4
#define ERR_DISK_MOUNTED    -5
#define ERR_SYSTEM_DISK     -6
#define ERR_NO_PERM         -7
#define ERR_INVALID_PARAM   -8
#define ERR_IOCTL           -9

/* ─── Structures exportées (accessibles depuis Python/ctypes) ── */

/* Informations sur un disque */
typedef struct {
    char    path[MAX_PATH_LEN];       /* ex: /dev/rdsk/c0t0d0 */
    char    name[64];                 /* ex: c0t0d0 */
    uint64_t size_bytes;              /* taille totale en octets */
    char    size_human[32];           /* ex: "120.5 GB" */
    int     is_mounted;               /* 1 si monté, 0 sinon */
    char    mount_point[MAX_PATH_LEN];/* ex: "/" si monté */
    int     is_system_disk;           /* 1 si c'est le disque système */
} DiskInfo;

/* Liste des disques détectés */
typedef struct {
    DiskInfo disks[MAX_DISKS];
    int      count;
} DiskList;

/* Paramètres d'une opération de clonage */
typedef struct {
    char     src_path[MAX_PATH_LEN];  /* source : /dev/rdsk/c0t0d0 */
    char     dst_path[MAX_PATH_LEN];  /* destination : /dev/rdsk/c0t1d0 ou fichier */
    uint32_t block_size;              /* taille des blocs en octets */
    int      force;                   /* 1 = ignorer les warnings (option experte) */
} CloneParams;

/* État en temps réel du clonage (partagé avec Python via mmap/polling) */
typedef struct {
    uint64_t bytes_total;     /* total à copier */
    uint64_t bytes_done;      /* octets copiés jusqu'ici */
    double   percent;         /* 0.0 à 100.0 */
    double   speed_mbps;      /* vitesse en Mo/s */
    uint64_t elapsed_sec;     /* temps écoulé en secondes */
    uint64_t eta_sec;         /* temps restant estimé */
    int      status;          /* 0=idle, 1=running, 2=done, 3=error */
    char     message[256];    /* message d'état courant */
    int      error_code;      /* dernier code d'erreur */
} CloneStatus;

/* Variable globale de statut (accessible depuis Python) */
static CloneStatus g_status = {0};
static volatile int g_cancel = 0;  /* 1 pour annuler l'opération */

/* ─── Fonctions utilitaires internes ────────────────────────── */

static void log_message(const char *level, const char *fmt, ...) {
    FILE *f = fopen(LOG_FILE, "a");
    if (!f) return;

    time_t now = time(NULL);
    char ts[32];
    strftime(ts, sizeof(ts), "%Y-%m-%d %H:%M:%S", localtime(&now));

    fprintf(f, "[%s] [%s] ", ts, level);

    va_list args;
    va_start(args, fmt);
    vfprintf(f, fmt, args);
    va_end(args);

    fprintf(f, "\n");
    fclose(f);
}

/* Convertit une taille en octets en chaîne lisible (KB/MB/GB/TB) */
static void bytes_to_human(uint64_t bytes, char *out, size_t out_len) {
    const char *units[] = {"B", "KB", "MB", "GB", "TB"};
    double val = (double)bytes;
    int unit = 0;
    while (val >= 1024.0 && unit < 4) {
        val /= 1024.0;
        unit++;
    }
    snprintf(out, out_len, "%.1f %s", val, units[unit]);
}

/* Obtient la taille d'un raw device via ioctl Solaris */
static uint64_t get_disk_size(int fd) {
    struct dk_minfo info;
    memset(&info, 0, sizeof(info));
    if (ioctl(fd, DKIOCGMEDIAINFO, &info) == 0) {
        return (uint64_t)info.dki_capacity * (uint64_t)info.dki_lbsize;
    }
    /* Fallback : lseek vers la fin */
    off_t end = lseek(fd, 0, SEEK_END);
    if (end > 0) return (uint64_t)end;
    return 0;
}

/* Vérifie si un chemin de device est monté (via /etc/mnttab) */
static int is_device_mounted(const char *dev_path, char *mount_point_out) {
    FILE *f = fopen(MNTTAB, "r");  /* /etc/mnttab sur Solaris */
    if (!f) return 0;

    struct mnttab mnt;
    while (getmntent(f, &mnt) == 0) {
        /* Comparer avec /dev/dsk/ et /dev/rdsk/ */
        char dsk_path[MAX_PATH_LEN];
        snprintf(dsk_path, sizeof(dsk_path), "%s", mnt.mnt_special);

        /* Normaliser : /dev/rdsk/ <-> /dev/dsk/ */
        char normalized_dev[MAX_PATH_LEN];
        snprintf(normalized_dev, sizeof(normalized_dev), "%s", dev_path);

        if (strstr(normalized_dev, "/rdsk/")) {
            /* Remplacer /rdsk/ par /dsk/ pour la comparaison */
            char *p = strstr(normalized_dev, "/rdsk/");
            memmove(p + 4, p + 5, strlen(p + 5) + 1);
            memcpy(p + 1, "dsk", 3);
        }

        if (strcmp(dsk_path, normalized_dev) == 0 ||
            strcmp(mnt.mnt_special, dev_path) == 0) {
            if (mount_point_out)
                strncpy(mount_point_out, mnt.mnt_mountp, MAX_PATH_LEN - 1);
            fclose(f);
            return 1;
        }
    }
    fclose(f);
    return 0;
}

/* Vérifie si un device contient le système de fichiers racine */
static int is_system_disk(const char *dev_path) {
    struct stat st_root, st_dev;
    char mount_pt[MAX_PATH_LEN] = {0};

    if (stat("/", &st_root) != 0) return 0;

    /* Vérifier via mnttab si ce device est monté sur "/" */
    FILE *f = fopen(MNTTAB, "r");
    if (!f) return 0;

    struct mnttab mnt;
    while (getmntent(f, &mnt) == 0) {
        if (strcmp(mnt.mnt_mountp, "/") == 0) {
            if (strstr(dev_path, strrchr(mnt.mnt_special, '/') + 1) != NULL) {
                fclose(f);
                return 1;
            }
        }
    }
    fclose(f);
    return 0;
}

/* ─── API publique exportée vers Python/ctypes ──────────────── */

/*
 * list_disks() — Liste tous les raw devices disponibles dans /dev/rdsk/
 * Retourne le nombre de disques trouvés, remplit *list
 */
int list_disks(DiskList *list) {
    if (!list) return ERR_INVALID_PARAM;
    memset(list, 0, sizeof(DiskList));

    /* Sur Solaris, les raw devices sont dans /dev/rdsk/
     * Format : c<ctrl>t<target>d<disk>  (sans slice = disque entier)
     * Exemple : c0t0d0, c0t1d0, c1t0d0
     */
    FILE *cmd = popen("ls /dev/rdsk/ 2>/dev/null | grep -E '^c[0-9]+t[0-9]+d[0-9]+$'", "r");
    if (!cmd) return ERR_INVALID_PARAM;

    char name[64];
    int count = 0;

    while (fgets(name, sizeof(name), cmd) && count < MAX_DISKS) {
        /* Supprimer le \n */
        name[strcspn(name, "\n")] = 0;
        if (strlen(name) == 0) continue;

        DiskInfo *disk = &list->disks[count];
        strncpy(disk->name, name, sizeof(disk->name) - 1);
        snprintf(disk->path, sizeof(disk->path), "/dev/rdsk/%s", name);

        /* Ouvrir le device pour obtenir sa taille */
        int fd = open(disk->path, O_RDONLY | O_NDELAY);
        if (fd >= 0) {
            disk->size_bytes = get_disk_size(fd);
            close(fd);
        }
        bytes_to_human(disk->size_bytes, disk->size_human, sizeof(disk->size_human));

        /* Vérifier si monté */
        disk->is_mounted = is_device_mounted(disk->path, disk->mount_point);
        disk->is_system_disk = is_system_disk(disk->path);

        count++;
    }
    pclose(cmd);

    list->count = count;
    log_message("INFO", "list_disks: %d disques détectés", count);
    return count;
}

/*
 * clone_disk() — Opération principale de clonage
 *
 * Lit depuis params->src_path, écrit vers params->dst_path
 * Met à jour g_status en temps réel (lu par Python via get_status)
 * Retourne ERR_OK (0) ou un code d'erreur négatif
 */
int clone_disk(const CloneParams *params) {
    if (!params) return ERR_INVALID_PARAM;

    g_cancel = 0;
    memset(&g_status, 0, sizeof(g_status));
    g_status.status = 1; /* running */
    snprintf(g_status.message, sizeof(g_status.message), "Initialisation...");

    log_message("INFO", "clone_disk: src=%s dst=%s bs=%u force=%d",
                params->src_path, params->dst_path,
                params->block_size, params->force);

    /* ── Vérifications de sécurité ── */
    if (!params->force) {
        /* 1. Vérifier que la destination n'est PAS montée */
        char mnt_pt[MAX_PATH_LEN] = {0};
        if (is_device_mounted(params->dst_path, mnt_pt)) {
            g_status.status = 3;
            g_status.error_code = ERR_DISK_MOUNTED;
            snprintf(g_status.message, sizeof(g_status.message),
                     "ERREUR: Disque destination monté sur '%s'. Démontez-le d'abord.", mnt_pt);
            log_message("ERROR", "Destination montée sur %s", mnt_pt);
            return ERR_DISK_MOUNTED;
        }

        /* 2. Vérifier que la destination n'est pas le disque système */
        if (is_system_disk(params->dst_path)) {
            g_status.status = 3;
            g_status.error_code = ERR_SYSTEM_DISK;
            snprintf(g_status.message, sizeof(g_status.message),
                     "ERREUR: Opération refusée. La destination contient le système actif.");
            log_message("ERROR", "Tentative d'écriture sur le disque système");
            return ERR_SYSTEM_DISK;
        }
    }

    /* ── Vérification des droits ── */
    if (getuid() != 0) {
        g_status.status = 3;
        g_status.error_code = ERR_NO_PERM;
        snprintf(g_status.message, sizeof(g_status.message),
                 "ERREUR: Droits insuffisants. Lancez avec sudo.");
        return ERR_NO_PERM;
    }

    /* ── Ouverture des fichiers ── */
    int fd_src = open(params->src_path, O_RDONLY);
    if (fd_src < 0) {
        g_status.status = 3;
        g_status.error_code = ERR_OPEN_SRC;
        snprintf(g_status.message, sizeof(g_status.message),
                 "ERREUR: Impossible d'ouvrir la source: %s", strerror(errno));
        log_message("ERROR", "open src %s: %s", params->src_path, strerror(errno));
        return ERR_OPEN_SRC;
    }

    /* Déterminer si la destination est un fichier ou un device */
    int dst_flags = O_WRONLY;
    struct stat st;
    if (stat(params->dst_path, &st) == 0 && S_ISREG(st.st_mode)) {
        dst_flags |= O_CREAT | O_TRUNC;
    }

    int fd_dst = open(params->dst_path, dst_flags, 0644);
    if (fd_dst < 0) {
        close(fd_src);
        g_status.status = 3;
        g_status.error_code = ERR_OPEN_DST;
        snprintf(g_status.message, sizeof(g_status.message),
                 "ERREUR: Impossible d'ouvrir la destination: %s", strerror(errno));
        log_message("ERROR", "open dst %s: %s", params->dst_path, strerror(errno));
        return ERR_OPEN_DST;
    }

    /* ── Obtenir la taille totale ── */
    uint64_t total = get_disk_size(fd_src);
    if (total == 0) {
        /* Fallback : taille du fichier source */
        struct stat st_src;
        fstat(fd_src, &st_src);
        total = (uint64_t)st_src.st_size;
    }

    g_status.bytes_total = total;

    /* ── Préparer le buffer ── */
    uint32_t bs = params->block_size;
    if (bs < BLOCK_SIZE_MIN || bs > BLOCK_SIZE_MAX)
        bs = BLOCK_SIZE_DEFAULT;

    uint8_t *buf = (uint8_t *)malloc(bs);
    if (!buf) {
        close(fd_src);
        close(fd_dst);
        g_status.status = 3;
        snprintf(g_status.message, sizeof(g_status.message),
                 "ERREUR: Mémoire insuffisante pour le buffer (%u octets)", bs);
        return ERR_INVALID_PARAM;
    }

    char total_str[32];
    bytes_to_human(total, total_str, sizeof(total_str));
    log_message("INFO", "Démarrage clonage: %s -> %s, total=%s, bs=%u",
                params->src_path, params->dst_path, total_str, bs);

    /* ── BOUCLE PRINCIPALE DE COPIE ── */
    uint64_t bytes_done = 0;
    ssize_t  n_read;
    struct timespec t_start, t_now;
    clock_gettime(CLOCK_MONOTONIC, &t_start);

    while (!g_cancel) {
        /* Lecture d'un bloc */
        n_read = read(fd_src, buf, bs);

        if (n_read == 0) break;       /* Fin de source */

        if (n_read < 0) {
            if (errno == EINTR) continue;  /* Signal interrompu, réessayer */
            free(buf);
            close(fd_src);
            close(fd_dst);
            g_status.status = 3;
            g_status.error_code = ERR_READ;
            snprintf(g_status.message, sizeof(g_status.message),
                     "ERREUR lecture à l'octet %llu: %s",
                     (unsigned long long)bytes_done, strerror(errno));
            log_message("ERROR", "read error at byte %llu: %s",
                        (unsigned long long)bytes_done, strerror(errno));
            return ERR_READ;
        }

        /* Écriture du bloc */
        ssize_t n_written = 0;
        while (n_written < n_read) {
            ssize_t w = write(fd_dst, buf + n_written, n_read - n_written);
            if (w < 0) {
                if (errno == EINTR) continue;
                free(buf);
                close(fd_src);
                close(fd_dst);
                g_status.status = 3;
                g_status.error_code = ERR_WRITE;
                snprintf(g_status.message, sizeof(g_status.message),
                         "ERREUR écriture à l'octet %llu: %s",
                         (unsigned long long)bytes_done, strerror(errno));
                log_message("ERROR", "write error: %s", strerror(errno));
                return ERR_WRITE;
            }
            n_written += w;
        }

        bytes_done += (uint64_t)n_read;

        /* ── Mise à jour du statut (toutes les ~100 Mo ou 1 seconde) ── */
        clock_gettime(CLOCK_MONOTONIC, &t_now);
        double elapsed = (t_now.tv_sec - t_start.tv_sec) +
                         (t_now.tv_nsec - t_start.tv_nsec) / 1e9;

        g_status.bytes_done   = bytes_done;
        g_status.elapsed_sec  = (uint64_t)elapsed;

        if (total > 0) {
            g_status.percent = (double)bytes_done / (double)total * 100.0;
        }

        if (elapsed > 0.1) {
            g_status.speed_mbps = (double)bytes_done / (1024.0 * 1024.0) / elapsed;
            if (g_status.speed_mbps > 0 && total > bytes_done) {
                double remaining = (double)(total - bytes_done) / (1024.0 * 1024.0);
                g_status.eta_sec = (uint64_t)(remaining / g_status.speed_mbps);
            }
        }

        char done_str[32], total_str2[32];
        bytes_to_human(bytes_done, done_str, sizeof(done_str));
        bytes_to_human(total, total_str2, sizeof(total_str2));
        snprintf(g_status.message, sizeof(g_status.message),
                 "Copie en cours... %s / %s (%.1f Mo/s)",
                 done_str, total_str2, g_status.speed_mbps);
    }

    /* ── Finalisation ── */
    free(buf);
    fsync(fd_dst);   /* Flush vers le disque physique */
    close(fd_src);
    close(fd_dst);

    if (g_cancel) {
        g_status.status = 3;
        snprintf(g_status.message, sizeof(g_status.message), "Opération annulée par l'utilisateur.");
        log_message("INFO", "Clonage annulé après %llu octets",
                    (unsigned long long)bytes_done);
        return ERR_INVALID_PARAM;
    }

    g_status.status  = 2;  /* done */
    g_status.percent = 100.0;
    g_status.bytes_done = g_status.bytes_total;
    char done_str[32];
    bytes_to_human(bytes_done, done_str, sizeof(done_str));
    snprintf(g_status.message, sizeof(g_status.message),
             "Clonage terminé avec succès ! %s copiés.", done_str);
    log_message("INFO", "Clonage terminé: %llu octets", (unsigned long long)bytes_done);

    return ERR_OK;
}

/*
 * get_status() — Copie le statut courant dans *out (appelé par Python en polling)
 */
void get_status(CloneStatus *out) {
    if (out) memcpy(out, &g_status, sizeof(CloneStatus));
}

/*
 * cancel_clone() — Annule l'opération en cours
 */
void cancel_clone(void) {
    g_cancel = 1;
    log_message("INFO", "Annulation demandée");
}

/*
 * get_disk_info() — Obtient les infos d'un seul disque par son chemin
 */
int get_disk_info(const char *path, DiskInfo *out) {
    if (!path || !out) return ERR_INVALID_PARAM;
    memset(out, 0, sizeof(DiskInfo));

    strncpy(out->path, path, MAX_PATH_LEN - 1);
    const char *slash = strrchr(path, '/');
    if (slash) strncpy(out->name, slash + 1, 63);

    int fd = open(path, O_RDONLY | O_NDELAY);
    if (fd < 0) return ERR_OPEN_SRC;

    out->size_bytes = get_disk_size(fd);
    close(fd);

    bytes_to_human(out->size_bytes, out->size_human, sizeof(out->size_human));
    out->is_mounted    = is_device_mounted(path, out->mount_point);
    out->is_system_disk = is_system_disk(path);

    return ERR_OK;
}
