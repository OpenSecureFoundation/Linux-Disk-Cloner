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
