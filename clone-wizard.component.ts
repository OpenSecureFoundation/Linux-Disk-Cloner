// clone-wizard.component.ts — Assistant de clonage en 4 étapes
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { DiskInfo, CloneStep } from '../../models';

@Component({
  selector: 'app-clone-wizard',
  template: `
<div class="container-fluid py-4">

  <div class="row mb-4">
    <div class="col">
      <h1 class="h3 text-white mb-1">
        <i class="bi bi-copy text-info me-2"></i>Assistant de clonage
      </h1>
      <p class="text-secondary mb-0">Clonage sécurisé étape par étape</p>
    </div>
  </div>

  <!-- Stepper Bootstrap -->
  <div class="card bg-dark border-secondary mb-4">
    <div class="card-body">
      <div class="d-flex justify-content-between align-items-center position-relative">
        <!-- Ligne de connexion -->
        <div class="position-absolute top-50 start-0 end-0 translate-middle-y"
             style="height:2px;background:#495057;z-index:0;margin:0 5%;"></div>

        <div *ngFor="let s of steps; let i = index"
             class="d-flex flex-column align-items-center position-relative"
             style="z-index:1; min-width:80px;">
          <div class="rounded-circle d-flex align-items-center justify-content-center fw-bold mb-1"
               style="width:40px;height:40px;"
               [style.background]="getStepBg(i)"
               [style.color]="getStepColor(i)"
               [style.border]="getStepBorder(i)">
            <i *ngIf="isStepDone(i)" class="bi bi-check-lg"></i>
            <span *ngIf="!isStepDone(i)">{{ i + 1 }}</span>
          </div>
          <small [class]="currentStepIndex === i ? 'text-info fw-bold' : 'text-secondary'">
            {{ s.label }}
          </small>
        </div>
      </div>
    </div>
  </div>

  <!-- ═══ Étape 1 : Source ═══ -->
  <div *ngIf="currentStep === 'select-source'">
    <div class="card bg-dark border-info">
      <div class="card-header border-info">
        <h5 class="mb-0 text-info"><i class="bi bi-hdd me-2"></i>Étape 1 — Sélectionner le disque SOURCE</h5>
      </div>
      <div class="card-body">
        <p class="text-secondary">Le disque source sera <strong class="text-white">lu</strong> et copié. Il ne sera <strong class="text-success">pas modifié</strong>.</p>
        <div class="spinner-border text-info" *ngIf="loadingDisks"></div>
        <div class="row g-3" *ngIf="!loadingDisks">
          <div class="col-12 col-md-6 col-xl-4" *ngFor="let disk of disks">
            <div class="card border-2 cursor-pointer h-100"
                 [class.border-info]="selectedSrc?.path === disk.path"
                 [class.border-secondary]="selectedSrc?.path !== disk.path"
                 [class.opacity-50]="disk.is_system_disk"
                 style="cursor:pointer;background:#1a1d20;"
                 (click)="!disk.is_system_disk && selectSrc(disk)">
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-start mb-2">
                  <i class="bi bi-hdd fs-2"
                     [class.text-danger]="disk.is_system_disk"
                     [class.text-warning]="disk.is_mounted && !disk.is_system_disk"
                     [class.text-info]="!disk.is_mounted && !disk.is_system_disk"></i>
                  <div class="d-flex gap-1 flex-wrap justify-content-end">
                    <span class="badge bg-secondary">{{ disk.size_human }}</span>
                    <span class="badge bg-danger" *ngIf="disk.is_system_disk">Système</span>
                    <span class="badge bg-warning text-dark" *ngIf="disk.is_mounted && !disk.is_system_disk">Monté</span>
                  </div>
                </div>
                <h6 class="font-monospace text-white mb-1">{{ disk.name }}</h6>
                <small class="text-secondary">{{ disk.path }}</small>
                <div class="mt-2" *ngIf="disk.is_system_disk">
                  <small class="text-danger"><i class="bi bi-shield-lock me-1"></i>Disque système — non sélectionnable comme source</small>
                </div>
              </div>
              <div class="card-footer border-0 text-end" *ngIf="selectedSrc?.path === disk.path">
                <span class="text-info"><i class="bi bi-check-circle-fill me-1"></i>Sélectionné</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Source personnalisée (fichier image) -->
        <div class="mt-3">
          <label class="form-label text-secondary">Ou entrez un chemin manuellement (ex: /export/backup.img)</label>
          <div class="input-group">
            <span class="input-group-text bg-dark border-secondary text-info">
              <i class="bi bi-folder2"></i>
            </span>
            <input type="text" class="form-control bg-dark border-secondary text-white"
                   placeholder="/dev/rdsk/c0t0d0  ou  /export/image.img"
                   [(ngModel)]="customSrcPath">
            <button class="btn btn-outline-info" (click)="selectCustomSrc()">Utiliser</button>
          </div>
        </div>
      </div>
      <div class="card-footer border-secondary d-flex justify-content-end">
        <button class="btn btn-info" [disabled]="!selectedSrc" (click)="goNext()">
          Suivant <i class="bi bi-arrow-right ms-1"></i>
        </button>
      </div>
    </div>
  </div>

  <!-- ═══ Étape 2 : Destination ═══ -->
  <div *ngIf="currentStep === 'select-dest'">
    <div class="card bg-dark border-warning">
      <div class="card-header border-warning">
        <h5 class="mb-0 text-warning"><i class="bi bi-hdd-fill me-2"></i>Étape 2 — Sélectionner la DESTINATION</h5>
      </div>
      <div class="card-body">
        <div class="alert alert-warning d-flex align-items-center">
          <i class="bi bi-exclamation-triangle-fill fs-4 me-3 flex-shrink-0"></i>
          <div>
            <strong>Attention !</strong> Le contenu du disque destination sera <strong>intégralement écrasé</strong>.
            Cette opération est <strong>irréversible</strong>. Vérifiez attentivement votre choix.
          </div>
        </div>

        <!-- Résumé de la source -->
        <div class="alert alert-dark border border-info mb-3" *ngIf="selectedSrc">
          <small class="text-secondary">SOURCE</small>
          <div class="d-flex align-items-center gap-2 mt-1">
            <i class="bi bi-hdd text-info fs-5"></i>
            <span class="font-monospace text-white">{{ selectedSrc.path }}</span>
            <span class="badge bg-secondary">{{ selectedSrc.size_human }}</span>
          </div>
        </div>

        <div class="row g-3" *ngIf="!loadingDisks">
          <div class="col-12 col-md-6 col-xl-4" *ngFor="let disk of destinationDisks">
            <div class="card border-2 h-100"
                 [class.border-warning]="selectedDst?.path === disk.path"
                 [class.border-secondary]="selectedDst?.path !== disk.path"
                 [class.opacity-50]="!canBeDestination(disk)"
                 [style.cursor]="canBeDestination(disk) ? 'pointer' : 'not-allowed'"
                 style="background:#1a1d20;"
                 (click)="canBeDestination(disk) && selectDst(disk)">
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-start mb-2">
                  <i class="bi bi-hdd-fill fs-2"
                     [class.text-danger]="disk.is_system_disk || disk.is_mounted"
                     [class.text-warning]="selectedDst?.path === disk.path"
                     [class.text-secondary]="!canBeDestination(disk)"></i>
                  <div class="d-flex gap-1 flex-wrap justify-content-end">
                    <span class="badge bg-secondary">{{ disk.size_human }}</span>
                    <span class="badge bg-danger" *ngIf="disk.is_system_disk">Système</span>
                    <span class="badge bg-danger" *ngIf="disk.is_mounted">Monté</span>
                  </div>
                </div>
                <h6 class="font-monospace text-white mb-1">{{ disk.name }}</h6>
                <small class="text-secondary">{{ disk.path }}</small>
                <div class="mt-2" *ngIf="!canBeDestination(disk)">
                  <small class="text-danger">
                    <i class="bi bi-x-circle me-1"></i>
                    {{ disk.is_system_disk ? 'Disque système' : disk.is_mounted ? 'Disque monté' : disk.path === selectedSrc?.path ? 'Même disque que la source' : 'Non disponible' }}
                  </small>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Destination personnalisée -->
        <div class="mt-3">
          <label class="form-label text-secondary">Ou spécifier un fichier image destination :</label>
          <div class="input-group">
            <span class="input-group-text bg-dark border-secondary text-warning">
              <i class="bi bi-file-earmark-binary"></i>
            </span>
            <input type="text" class="form-control bg-dark border-secondary text-white"
                   placeholder="/export/backup_$(date).img"
                   [(ngModel)]="customDstPath">
            <button class="btn btn-outline-warning" (click)="selectCustomDst()">Utiliser</button>
          </div>
        </div>

        <!-- Options avancées -->
        <div class="mt-3">
          <div class="form-check form-switch">
            <input class="form-check-input" type="checkbox" id="forceCheck" [(ngModel)]="forceMode">
            <label class="form-check-label text-secondary" for="forceCheck">
              <i class="bi bi-exclamation-octagon text-danger me-1"></i>
              Mode expert — ignorer les vérifications de sécurité (dangereux)
            </label>
          </div>
          <div class="mt-2">
            <label class="form-label text-secondary">Taille des blocs :</label>
            <select class="form-select bg-dark border-secondary text-white" [(ngModel)]="blockSize" style="width:auto;">
              <option value="65536">64 Ko — compatible maximum</option>
              <option value="524288">512 Ko</option>
              <option value="1048576" selected>1 Mo — recommandé</option>
              <option value="4194304">4 Mo — disques rapides</option>
              <option value="16777216">16 Mo — SSD NVMe</option>
            </select>
          </div>
        </div>
      </div>
      <div class="card-footer border-secondary d-flex justify-content-between">
        <button class="btn btn-outline-secondary" (click)="goPrev()">
          <i class="bi bi-arrow-left me-1"></i>Retour
        </button>
        <button class="btn btn-warning text-dark" [disabled]="!selectedDst" (click)="goNext()">
          Suivant <i class="bi bi-arrow-right ms-1"></i>
        </button>
      </div>
    </div>
  </div>

  <!-- ═══ Étape 3 : Confirmation ═══ -->
  <div *ngIf="currentStep === 'confirm'">
    <div class="card bg-dark border-danger">
      <div class="card-header border-danger">
        <h5 class="mb-0 text-danger">
          <i class="bi bi-shield-exclamation me-2"></i>Étape 3 — Confirmation de sécurité
        </h5>
      </div>
      <div class="card-body">

        <!-- Résumé de l'opération -->
        <div class="row g-3 mb-4">
          <div class="col-md-5">
            <div class="card bg-dark border-info h-100">
              <div class="card-body text-center">
                <small class="text-info text-uppercase letter-spacing">Source (lecture seule)</small>
                <div class="mt-2"><i class="bi bi-hdd fs-1 text-info"></i></div>
                <h5 class="font-monospace text-white mt-2">{{ selectedSrc?.name }}</h5>
                <p class="text-secondary small mb-0">{{ selectedSrc?.path }}</p>
                <span class="badge bg-info text-dark mt-1">{{ selectedSrc?.size_human }}</span>
              </div>
            </div>
          </div>
          <div class="col-md-2 d-flex align-items-center justify-content-center">
            <div class="text-center">
              <i class="bi bi-arrow-right fs-1 text-secondary"></i>
              <div class="text-secondary small">Vers</div>
            </div>
          </div>
          <div class="col-md-5">
            <div class="card bg-dark border-danger h-100">
              <div class="card-body text-center">
                <small class="text-danger text-uppercase">Destination (sera écrasée)</small>
                <div class="mt-2"><i class="bi bi-hdd-fill fs-1 text-danger"></i></div>
                <h5 class="font-monospace text-white mt-2">{{ selectedDst?.name || 'fichier' }}</h5>
                <p class="text-secondary small mb-0">{{ selectedDst?.path }}</p>
                <span class="badge bg-danger mt-1">{{ selectedDst?.size_human || 'Image' }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="alert alert-danger">
          <h6 class="alert-heading"><i class="bi bi-exclamation-octagon-fill me-2"></i>Action irréversible</h6>
          <p class="mb-0">
            Le contenu de <strong class="font-monospace">{{ selectedDst?.path }}</strong> sera 
            <strong>définitivement et irrémédiablement écrasé</strong> par une copie bit à bit de 
            <strong class="font-monospace">{{ selectedSrc?.path }}</strong>.
            Il n'existe aucune fonction d'annulation une fois l'opération démarrée.
          </p>
        </div>

        <!-- Saisie de confirmation -->
        <div class="mt-3">
          <label class="form-label text-white fw-bold fs-5">
            Tapez <code class="text-danger fs-5">CLONER</code> pour confirmer :
          </label>
          <input type="text" class="form-control form-control-lg bg-dark border-secondary text-white font-monospace"
                 [class.border-success]="confirmText === 'CLONER'"
                 [class.border-danger]="confirmText.length > 0 && confirmText !== 'CLONER'"
                 placeholder="CLONER"
                 [(ngModel)]="confirmText"
                 autofocus>
          <div class="mt-1" *ngIf="confirmText.length > 0 && confirmText !== 'CLONER'">
            <small class="text-danger">
              <i class="bi bi-x-circle me-1"></i>Tapez exactement "CLONER" en majuscules
            </small>
          </div>
          <div class="mt-1" *ngIf="confirmText === 'CLONER'">
            <small class="text-success">
              <i class="bi bi-check-circle me-1"></i>Confirmation validée
            </small>
          </div>
        </div>
      </div>
      <div class="card-footer border-secondary d-flex justify-content-between align-items-center">
        <button class="btn btn-outline-secondary" (click)="goPrev()">
          <i class="bi bi-arrow-left me-1"></i>Retour
        </button>
        <button class="btn btn-danger btn-lg"
                [disabled]="confirmText !== 'CLONER' || launching"
                (click)="launchClone()">
          <span *ngIf="launching" class="spinner-border spinner-border-sm me-2"></span>
          <i *ngIf="!launching" class="bi bi-play-fill me-2"></i>
          {{ launching ? 'Démarrage...' : 'Lancer le clonage' }}
        </button>
      </div>
    </div>
  </div>

  <!-- Erreur de démarrage -->
  <div class="alert alert-danger mt-3" *ngIf="launchError">
    <i class="bi bi-exclamation-triangle me-2"></i>{{ launchError }}
  </div>

</div>
  `,
})
export class CloneWizardComponent implements OnInit, OnDestroy {

  steps = [
    { key: 'select-source', label: 'Source' },
    { key: 'select-dest',   label: 'Destination' },
    { key: 'confirm',       label: 'Confirmation' },
    { key: 'cloning',       label: 'Clonage' },
  ];

  currentStep: CloneStep = 'select-source';
  disks:        DiskInfo[] = [];
  loadingDisks  = true;
  selectedSrc:  DiskInfo | null = null;
  selectedDst:  DiskInfo | null = null;
  customSrcPath = '';
  customDstPath = '';
  confirmText   = '';
  blockSize     = 1048576;
  forceMode     = false;
  launching     = false;
  launchError   = '';

  get currentStepIndex(): number {
    return this.steps.findIndex(s => s.key === this.currentStep);
  }

  get destinationDisks(): DiskInfo[] {
    return this.disks.filter(d => d.path !== this.selectedSrc?.path);
  }

  constructor(private api: ApiService, private route: ActivatedRoute) {}

  ngOnInit() {
    this.api.getDisks().subscribe({
      next: d => {
        this.disks = d;
        this.loadingDisks = false;
        // Pré-sélection si on arrive depuis le dashboard
        this.route.queryParams.subscribe(p => {
          if (p['src']) {
            const pre = d.find(x => x.path === p['src']);
            if (pre) this.selectedSrc = pre;
          }
        });
      },
      error: () => this.loadingDisks = false,
    });
  }
  ngOnDestroy() {}

  selectSrc(d: DiskInfo)   { this.selectedSrc = d; }
  selectDst(d: DiskInfo)   { this.selectedDst = d; }

  selectCustomSrc() {
    if (this.customSrcPath.trim()) {
      this.selectedSrc = {
        path: this.customSrcPath.trim(),
        name: this.customSrcPath.trim().split('/').pop() || 'custom',
        size_bytes: 0, size_human: '?',
        is_mounted: false, mount_point: '', is_system_disk: false,
      };
    }
  }

  selectCustomDst() {
    if (this.customDstPath.trim()) {
      this.selectedDst = {
        path: this.customDstPath.trim(),
        name: this.customDstPath.trim().split('/').pop() || 'output',
        size_bytes: 0, size_human: 'Nouveau fichier',
        is_mounted: false, mount_point: '', is_system_disk: false,
      };
    }
  }

  canBeDestination(d: DiskInfo): boolean {
    return !d.is_system_disk && !d.is_mounted && d.path !== this.selectedSrc?.path;
  }

  goNext() {
    const order: CloneStep[] = ['select-source', 'select-dest', 'confirm', 'cloning', 'done'];
    const i = order.indexOf(this.currentStep);
    if (i < order.length - 1) this.currentStep = order[i + 1];
  }

  goPrev() {
    const order: CloneStep[] = ['select-source', 'select-dest', 'confirm', 'cloning', 'done'];
    const i = order.indexOf(this.currentStep);
    if (i > 0) this.currentStep = order[i - 1];
  }

  getStepBg(i: number): string {
    if (this.isStepDone(i)) return '#198754';
    if (i === this.currentStepIndex) return '#0dcaf0';
    return 'transparent';
  }
  getStepColor(i: number): string {
    if (this.isStepDone(i) || i === this.currentStepIndex) return '#000';
    return '#6c757d';
  }
  getStepBorder(i: number): string {
    if (this.isStepDone(i)) return '2px solid #198754';
    if (i === this.currentStepIndex) return '2px solid #0dcaf0';
    return '2px solid #495057';
  }
  isStepDone(i: number): boolean {
    return i < this.currentStepIndex;
  }

  launchClone() {
    if (!this.selectedSrc || !this.selectedDst || this.confirmText !== 'CLONER') return;
    this.launching  = true;
    this.launchError = '';

    this.api.startClone({
      src:        this.selectedSrc.path,
      dst:        this.selectedDst.path,
      block_size: this.blockSize,
      force:      this.forceMode,
      confirm:    'CLONER',
    }).subscribe({
      next: () => {
        this.launching = false;
        this.currentStep = 'cloning';
      },
      error: e => {
        this.launching  = false;
        this.launchError = e.error?.message || `Erreur ${e.status} — vérifiez que le backend Flask tourne en root.`;
      },
    });
  }
}
