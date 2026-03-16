# Conception et développement de Disk Cloner, un système de clonage de disque: cas de Open Solaris

# Objectifs:
1. Comprendre la structure bas niveau d’un disque.
2. Manipuler les outils de clonage et de sauvegarde sous OpenSolaris.
3. Mettre en œuvre un interface graphique permettant d’apprécier la progression du clonage 

# Fonctionnalités attendues

1. Découverte des disques et partitions: Liste des disques physiques détectés, liste des systèmes de fichiers, indication de la taille.
2. Clonage disque → image: Cloner un disque ou une partition vers un fichier image (.img, .zfs, …), Barres de progression ou pourcentage, journalisation des opérations.
3. Clonage image → disque: Restaurer une image sur un disque cible.
4. Sécurité
   - Avertissements clairs avant toute opération destructive.
   - Confirmation explicite (ex: taper CLONER).
   - Refus de cloner si le disque est utilisé par le système actuel (sauf option experte).

# NB: README à mettre à jour progressivement par l'équipe.

# DISK CLONER — Guide d'installation complet
## OpenIndiana Hipster + Flask + Angular + Bootstrap

---

## ARCHITECTURE DU PROJET

```
diskcloner/
├── engine/
│   ├── clone_engine.c      ← Moteur C bas niveau (réimplémentation de dd)
│   └── Makefile            ← Compilation vers libclone.so
│
├── backend/
│   ├── app.py              ← API REST Flask
│   ├── engine_wrapper.py   ← Wrapper Python/ctypes vers libclone.so
│   └── requirements.txt    ← flask, flask-cors
│
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── app.module.ts
    │   │   ├── app-routing.module.ts
    │   │   ├── app.component.ts
    │   │   ├── models.ts
    │   │   ├── services/api.service.ts
    │   │   └── components/
    │   │       ├── navbar/
    │   │       ├── dashboard/          ← Liste des disques
    │   │       ├── clone-wizard/       ← Assistant 4 étapes
    │   │       ├── progress-monitor/   ← Barre de progression live
    │   │       ├── log-viewer/         ← Journaux en temps réel
    │   │       └── disk-list/          ← Composant partagé
    │   ├── index.html                  ← Bootstrap 5 + Bootstrap Icons
    │   └── main.ts
    ├── package.json
    ├── angular.json
    └── tsconfig.json
```

---

## ÉTAPE 1 — CONFIGURER LA VM OPENINDIANA

### 1.1 — Après l'installation de l'ISO OI-hipster-gui-20251026.iso

Ouvrir un terminal et passer en root :
```bash
su -
# ou
sudo -i
```

### 1.2 — Mettre à jour le système
```bash
pkg update
```

### 1.3 — Installer les outils de développement
```bash
# Compilateur C
pkg install developer/gcc

# Git (pour cloner le projet)
pkg install developer/versioning/git

# Python 3 + pip
pkg install runtime/python-311
pkg install runtime/python/pip

# Node.js + npm (pour Angular)
pkg install runtime/nodejs
```

### 1.4 — Vérifier les disques virtuels
Dans VirtualBox, ajoutez 2 disques virtuels avant de démarrer la VM :
- Disque A : 5-10 Go (servira de source)
- Disque B : 5-10 Go (servira de destination)

Vérification dans la VM :
```bash
ls /dev/rdsk/          # Liste tous les raw devices
# Vous devriez voir : c0t0d0, c0t1d0, c0t2d0, ...

format                  # Interface Solaris de gestion des disques (Ctrl+C pour quitter)
```

---

## ÉTAPE 2 — COMPILER LE MOTEUR C

```bash
# Se placer dans le dossier engine
cd /chemin/vers/diskcloner/engine

# Compiler la bibliothèque partagée
make

# Vérification
ls -la libclone.so
# → doit apparaître libclone.so

# Test de chargement (sans root)
make test
# → ✓ Bibliothèque chargée OK
```

**Ce que fait le Makefile :**
```
gcc -O2 -Wall -fPIC -D_LARGEFILE64_SOURCE -shared -o libclone.so clone_engine.c
```
- `-fPIC` : Position Independent Code, requis pour les .so
- `-D_LARGEFILE64_SOURCE` : Support des disques > 2 Go
- `-shared` : Produit une bibliothèque partagée (pas un exécutable)

---

## ÉTAPE 3 — LANCER LE BACKEND FLASK

```bash
# Installer les dépendances Python
cd /chemin/vers/diskcloner/backend
pip install -r requirements.txt

# Lancer en root (OBLIGATOIRE pour accéder à /dev/rdsk/)
sudo python3 app.py
```

Vous devriez voir :
```
🚀 DiskCloner API démarrée sur http://0.0.0.0:5000
   Mode: RÉEL (Solaris)
```

**Test rapide de l'API :**
```bash
# Dans un autre terminal
curl http://localhost:5000/api/health
curl http://localhost:5000/api/disks
```

---

## ÉTAPE 4 — LANCER LE FRONTEND ANGULAR

```bash
cd /chemin/vers/diskcloner/frontend

# Installer les dépendances Angular
npm install

# Lancer le serveur de développement
npm start
# → Angular Live Development Server : http://localhost:4200
```

Ouvrir Firefox/Chrome sur OpenIndiana : **http://localhost:4200**

---

## ÉTAPE 5 — UTILISER L'APPLICATION

### 5.1 — Tableau de bord
- Voir tous les disques détectés avec leur taille, état (monté/libre), protection système
- Cliquer "Cloner" sur un disque pour démarrer l'assistant

### 5.2 — Assistant de clonage (4 étapes)
1. **Source** : Sélectionner le disque à copier
2. **Destination** : Choisir le disque ou fichier image destination
3. **Confirmation** : Taper exactement `CLONER` pour valider (sécurité obligatoire)
4. **Clonage** : Suivi en temps réel

### 5.3 — Suivi de progression
- Barre de progression avec pourcentage
- Vitesse en Mo/s
- Temps écoulé + temps restant estimé
- Graphique de vitesse en temps réel
- Bouton Annuler

### 5.4 — Journaux
- Toutes les opérations sont journalisées dans `/var/log/diskcloner.log`
- Visualisation avec filtres INFO/ERROR/WARN
- Recherche dans les logs

---

## EXEMPLE D'UTILISATION RÉELLE

### Cloner un disque entier vers un autre disque
```
Source      : /dev/rdsk/c0t1d0   (Disque A — 5 Go)
Destination : /dev/rdsk/c0t2d0   (Disque B — 5 Go)
Block size  : 1 Mo
```

### Cloner un disque vers un fichier image
```
Source      : /dev/rdsk/c0t1d0
Destination : /export/backup_disk_A.img
```

### Restaurer une image vers un disque
```
Source      : /export/backup_disk_A.img
Destination : /dev/rdsk/c0t2d0
```

---

## COMPILATION MANUELLE (sans Makefile)

```bash
gcc -O2 -Wall -Wextra \
    -fPIC \
    -D_LARGEFILE64_SOURCE \
    -D_FILE_OFFSET_BITS=64 \
    -shared \
    -o libclone.so \
    clone_engine.c

# Vérifier les symboles exportés
nm -D libclone.so | grep -E "clone_disk|list_disks|get_status|cancel_clone"
```

---

## DÉVELOPPEMENT SUR LINUX/WINDOWS (sans Solaris)

Le projet inclut un **mode simulation** automatique.
Si `libclone.so` est absent, `engine_wrapper.py` active la simulation :
- Des disques fictifs sont retournés
- Le clonage simule une progression de 0 à 100% avec des valeurs réalistes
- Idéal pour développer l'interface sans OpenSolaris

```bash
# Sur Linux/macOS — backend en mode simulation
cd backend
pip install flask flask-cors
python3 app.py   # Sans sudo — mode mock auto

# Frontend pareil
cd frontend
npm install && npm start
```

---

## DÉPANNAGE

### "Impossible d'ouvrir /dev/rdsk/..."
→ L'API Flask ne tourne pas en root. Relancez avec `sudo python3 app.py`

### "libclone.so introuvable"
→ Le moteur C n'est pas compilé. `cd engine && make`

### Erreur CORS sur Angular
→ Vérifiez que le backend tourne sur le port 5000 et que l'URL dans `api.service.ts` est correcte

### "Disque monté — opération refusée"
→ C'est une protection de sécurité. Démontez le disque avant : `umount /dev/dsk/c0t1d0`

### npm introuvable sur OpenIndiana
```bash
pkg install runtime/nodejs
npm install -g @angular/cli
```
