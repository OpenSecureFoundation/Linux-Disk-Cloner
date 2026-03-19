import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
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
    </div>
  </div>

  <!-- Stepper -->
  <div class="card bg-dark border-secondary mb-4">
    <div class="card-body">
      <div class="d-flex justify-content-between align-items-center position-relative">
        <div class="position-absolute top-50 start-0 end-0 translate-middle-y"
             style="height:2px;background:#495057;z-index:0;margin:0 5%;"></div>
        <div *ngFor="let s of steps; let i = index"
             class="d-flex flex-column align-items-center position-relative" style="z-index:1;min-width:80px;">
          <div class="rounded-circle d-flex align-items-center justify-content-center fw-bold mb-1"
               style="width:40px;height:40px;"
               [style.background]="getStepBg(i)"
               [style.color]="getStepColor(i)"
               [style.border]="getStepBorder(i)">
            <i *ngIf="isStepDone(i)" class="bi bi-check-lg"></i>
            <span *ngIf="!isStepDone(i)">{{ i + 1 }}</span>
          </div>
          <small [class]="currentStepIndex === i ? 'text-info fw-bold' : 'text-secondary'">{{ s.label }}</small>
        </div>
      </div>
    </div>
  </div>

  <!-- Étape 1 : Source -->
  <div *ngIf="currentStep === 'select-source'">
    <div class="card bg-dark border-info">
      <div class="card-header border-info">
        <h5 class="mb-0 text-info"><i class="bi bi-hdd me-2"></i>Étape 1 — Sélectionner la SOURCE</h5>
      </div>
      <div class="card-body">
        <div class="spinner-border text-info" *ngIf="loadingDisks"></div>
        <div class="row g-3" *ngIf="!loadingDisks">
          <div class="col-12 col-md-6" *ngFor="let disk of disks">
            <div class="card border-2 h-100"
                 [class.border-info]="selectedSrc?.path === disk.path"
                 [class.border-secondary]="selectedSrc?.path !== disk.path"
                 [class.opacity-50]="disk.is_system_disk"
                 [style.cursor]="disk.is_system_disk ? 'not-allowed' : 'pointer'"
                 style="background:#1a1d20;"
                 (click)="!disk.is_system_disk && selectSrc(disk)">
              <div class="card-body">
                <div class="d-flex justify-content-between mb-2">
                  <i class="bi bi-hdd fs-2"
                     [class.text-danger]="disk.is_system_disk"
                     [class.text-info]="!disk.is_system_disk"></i>
                  <div class="d-flex gap-1">
                    <span class="badge bg-secondary">{{ disk.size_human }}</span>
                    <span class="badge bg-danger" *ngIf="disk.is_system_disk">Système</span>
                  </div>
                </div>
                <h6 class="font-monospace text-white mb-1">{{ disk.name }}</h6>
                <small class="text-secondary">{{ disk.path }}</small>
              </div>
            </div>
          </div>
        </div>
        <div class="mt-3">
          <label class="form-label text-secondary">Ou entrez un chemin manuellement :</label>
          <div class="input-group">
            <input type="text" class="form-control bg-dark border-secondary text-white"
                   placeholder="/dev/rdsk/c0t0d0"
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

  <!-- Étape 2 : Destination -->
  <div *ngIf="currentStep === 'select-dest'">
    <div class="card bg-dark border-warning">
      <div class="card-header border-warning">
        <h5 class="mb-0 text-warning"><i class="bi bi-hdd-fill me-2"></i>Étape 2 — Sélectionner la DESTINATION</h5>
      </div>
      <div class="card-body">
        <div class="alert alert-warning">
          <i class="bi bi-exclamation-triangle-fill me-2"></i>
          Le contenu de la destination sera <strong>intégralement écrasé</strong>.
        </div>
        <div class="row g-3">
          <div class="col-12 col-md-6" *ngFor="let disk of destinationDisks">
            <div class="card border-2 h-100"
                 [class.border-warning]="selectedDst?.path === disk.path"
                 [class.border-secondary]="selectedDst?.path !== disk.path"
                 [class.opacity-50]="!canBeDestination(disk)"
                 [style.cursor]="canBeDestination(disk) ? 'pointer' : 'not-allowed'"
                 style="background:#1a1d20;"
                 (click)="canBeDestination(disk) && selectDst(disk)">
              <div class="card-body">
                <div class="d-flex justify-content-between mb-2">
                  <i class="bi bi-hdd-fill fs-2"
                     [class.text-danger]="!canBeDestination(disk)"
                     [class.text-warning]="selectedDst?.path === disk.path && canBeDestination(disk)"
                     [class.text-secondary]="selectedDst?.path !== disk.path && canBeDestination(disk)"></i>
                  <div class="d-flex gap-1">
                    <span class="badge bg-secondary">{{ disk.size_human }}</span>
                    <span class="badge bg-danger" *ngIf="disk.is_system_disk">Système</span>
                    <span class="badge bg-danger" *ngIf="disk.is_mounted">Monté</span>
                  </div>
                </div>
                <h6 class="font-monospace text-white mb-1">{{ disk.name }}</h6>
                <small class="text-secondary">{{ disk.path }}</small>
              </div>
            </div>
          </div>
        </div>
        <div class="mt-3">
          <label class="form-label text-secondary">Ou spécifier un fichier image :</label>
          <div class="input-group">
            <input type="text" class="form-control bg-dark border-secondary text-white"
                   placeholder="/export/backup.img"
                   [(ngModel)]="customDstPath">
            <button class="btn btn-outline-warning" (click)="selectCustomDst()">Utiliser</button>
          </div>
        </div>
	<div class="mt-3">
	  <label class="form-label text-secondary fw-bold">Mode de clonage :</label>
	  <div class="d-flex gap-2 flex-wrap">
	    <div class="card border-2 p-3 text-center"
	         *ngFor="let m of modes"
	         [class.border-info]="selectedMode === m.value"
	         [class.border-secondary]="selectedMode !== m.value"
	         style="cursor:pointer;background:#1a1d20;min-width:140px;"
	         (click)="selectedMode = m.value">
	      <i class="bi fs-3 mb-1" [class]="m.icon" [class.text-info]="selectedMode === m.value"></i>
	      <div class="fw-bold text-white small">{{ m.label }}</div>
	      <small class="text-secondary">{{ m.desc }}</small>
	    </div>
	  </div>
	</div>
        <div class="mt-3">
          <label class="form-label text-secondary">Taille des blocs :</label>
          <select class="form-select bg-dark border-secondary text-white" [(ngModel)]="blockSize" style="width:auto;">
            <option value="65536">64 Ko</option>
            <option value="524288">512 Ko</option>
            <option value="1048576">1 Mo — recommandé</option>
            <option value="4194304">4 Mo</option>
          </select>
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

  <!-- Étape 3 : Confirmation -->
  <div *ngIf="currentStep === 'confirm'">
    <div class="card bg-dark border-danger">
      <div class="card-header border-danger">
        <h5 class="mb-0 text-danger"><i class="bi bi-shield-exclamation me-2"></i>Étape 3 — Confirmation</h5>
      </div>
      <div class="card-body">
        <div class="row g-3 mb-4">
          <div class="col-md-5">
            <div class="card bg-dark border-info text-center p-3">
              <small class="text-info">SOURCE</small>
              <i class="bi bi-hdd fs-1 text-info mt-2"></i>
              <h5 class="font-monospace text-white mt-2">{{ selectedSrc?.name }}</h5>
              <small class="text-secondary">{{ selectedSrc?.path }}</small>
            </div>
          </div>
          <div class="col-md-2 d-flex align-items-center justify-content-center">
            <i class="bi bi-arrow-right fs-1 text-secondary"></i>
          </div>
          <div class="col-md-5">
            <div class="card bg-dark border-danger text-center p-3">
              <small class="text-danger">DESTINATION (sera écrasée)</small>
              <i class="bi bi-hdd-fill fs-1 text-danger mt-2"></i>
              <h5 class="font-monospace text-white mt-2">{{ selectedDst?.name }}</h5>
              <small class="text-secondary">{{ selectedDst?.path }}</small>
            </div>
          </div>
        </div>
        <div class="alert alert-danger">
          <strong>Action irréversible !</strong> Le contenu de
          <strong class="font-monospace">{{ selectedDst?.path }}</strong> sera définitivement écrasé.
        </div>
        <div class="mt-3">
          <label class="form-label text-white fw-bold fs-5">
            Tapez <code class="text-danger fs-5">CLONER</code> pour confirmer :
          </label>
          <input type="text" class="form-control form-control-lg bg-dark border-secondary text-white font-monospace"
                 [class.border-success]="confirmText === 'CLONER'"
                 [class.border-danger]="confirmText.length > 0 && confirmText !== 'CLONER'"
                 placeholder="CLONER"
                 [(ngModel)]="confirmText">
        </div>
      </div>
      <div class="card-footer border-secondary d-flex justify-content-between">
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
    <div class="alert alert-danger mt-3" *ngIf="launchError">
      <i class="bi bi-exclamation-triangle me-2"></i>{{ launchError }}
    </div>
  </div>

  <!-- Étape 4 : Clonage en cours -->
  <div *ngIf="currentStep === 'cloning'">
    <div class="card bg-dark border-info text-center p-5">
      <div class="spinner-border text-info mx-auto mb-3" style="width:3rem;height:3rem;"></div>
      <h4 class="text-white">Clonage en cours...</h4>
      <p class="text-secondary">Rendez-vous sur la page <strong>Progression</strong> pour suivre l'avancement.</p>
     	<button class="btn btn-info mt-2" routerLink="/progress">
 	 Voir la progression
	</button>
	<button class="btn btn-info mt-2" routerLink="/dashboard">Tableau de bord</button>
    </div>
  </div>
</div>
  `,
})
export class CloneWizardComponent implements OnInit {
  steps = [
    { key: 'select-source', label: 'Source' },
    { key: 'select-dest', label: 'Destination' },
    { key: 'confirm', label: 'Confirmation' },
    { key: 'cloning', label: 'Clonage' },
  ];

  currentStep: CloneStep = 'select-source';
  disks: DiskInfo[] = [];
  loadingDisks = true;
  selectedSrc: DiskInfo | null = null;
  selectedDst: DiskInfo | null = null;
  customSrcPath = '';
  customDstPath = '';
  confirmText = '';
  blockSize = 1048576;
  launching = false;
  launchError = '';
  selectedMode = 1;
  compress = false;
  modes = [
    { value: 1, label: 'Disk → Image', icon: 'bi-hdd-fill', desc: 'Sauvegarde vers .img' },
    { value: 2, label: 'Image → Disk', icon: 'bi-arrow-down-circle', desc: 'Restaurer une image' },
    { value: 3, label: 'Disk → Disk', icon: 'bi-arrow-left-right', desc: 'Clonage direct' },
  ];

  get currentStepIndex() { return this.steps.findIndex(s => s.key === this.currentStep); }
  get destinationDisks() { return this.disks.filter(d => d.path !== this.selectedSrc?.path); }

  constructor(private api: ApiService, private route: ActivatedRoute, private router: Router) {}

  ngOnInit() {
    this.api.getDisks().subscribe({
      next: d => {
        this.disks = d;
        this.loadingDisks = false;
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

  selectSrc(d: DiskInfo) { this.selectedSrc = d; }
  selectDst(d: DiskInfo) { this.selectedDst = d; }

  selectCustomSrc() {
    if (this.customSrcPath.trim()) {
      this.selectedSrc = {
        path: this.customSrcPath.trim(),
        name: this.customSrcPath.trim().split('/').pop() || 'custom',
        size_bytes: 0, size_human: '?',
        is_mounted: false, mount_point: '', 
	is_system_disk: false,
	filesystem: '',
      };
    }
  }

  selectCustomDst() {
    if (this.customDstPath.trim()) {
      this.selectedDst = {
        path: this.customDstPath.trim(),
        name: this.customDstPath.trim().split('/').pop() || 'output',
        size_bytes: 0, size_human: 'Nouveau fichier',
        is_mounted: false, mount_point: '', 
	is_system_disk: false, filesystem: '',
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
    return (this.isStepDone(i) || i === this.currentStepIndex) ? '#000' : '#6c757d';
  }
  getStepBorder(i: number): string {
    if (this.isStepDone(i)) return '2px solid #198754';
    if (i === this.currentStepIndex) return '2px solid #0dcaf0';
    return '2px solid #495057';
  }
  isStepDone(i: number): boolean { return i < this.currentStepIndex; }

  launchClone() {
    if (!this.selectedSrc || !this.selectedDst || this.confirmText !== 'CLONER') return;
    this.launching = true;
    this.launchError = '';
    this.api.startClone({
      src: this.selectedSrc.path,
      dst: this.selectedDst.path,
      block_size: this.blockSize,
      force: false,
      confirm: 'CLONER',
      mode: this.selectedMode,
      compress: this.compress,
    }).subscribe({
      next: () => { this.launching = false; this.currentStep = 'cloning'; },
      error: e => { this.launching = false; this.launchError = e.error?.message || `Erreur ${e.status}`; },
    });
  }
}
