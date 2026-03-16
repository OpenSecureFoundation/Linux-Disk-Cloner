import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { DiskInfo, HealthInfo } from '../../models';

@Component({
  selector: 'app-dashboard',
  template: `
<div class="container-fluid py-4">
  <div class="row mb-4">
    <div class="col">
      <h1 class="h3 text-white mb-1">
        <i class="bi bi-speedometer2 text-info me-2"></i>Tableau de bord
      </h1>
      <p class="text-secondary mb-0">Vue d'ensemble du système et des disques détectés</p>
    </div>
    <div class="col-auto">
      <button class="btn btn-outline-info btn-sm" (click)="refresh()" [disabled]="loading">
        <i class="bi bi-arrow-clockwise me-1" [class.spin]="loading"></i>Actualiser
      </button>
    </div>
  </div>

  <div class="alert alert-warning d-flex align-items-center mb-4" *ngIf="health?.warning">
    <i class="bi bi-exclamation-triangle-fill me-2 fs-5"></i>
    <div>{{ health!.warning }}</div>
  </div>

  <div class="alert alert-info d-flex align-items-center mb-4" *ngIf="health?.mock_mode">
    <i class="bi bi-info-circle-fill me-2 fs-5"></i>
    <div><strong>Mode simulation actif.</strong> Compilez le moteur C avec <code>make</code> dans <code>engine/</code>.</div>
  </div>

  <div class="row g-3 mb-4">
    <div class="col-6 col-md-3">
      <div class="card bg-dark border-info h-100">
        <div class="card-body d-flex justify-content-between align-items-start">
          <div>
            <p class="text-secondary small mb-1">Disques détectés</p>
            <h3 class="text-white mb-0">{{ disks.length }}</h3>
          </div>
          <div class="p-2 bg-info bg-opacity-10 rounded">
            <i class="bi bi-hdd-stack text-info fs-4"></i>
          </div>
        </div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="card bg-dark border-success h-100">
        <div class="card-body d-flex justify-content-between align-items-start">
          <div>
            <p class="text-secondary small mb-1">Disponibles</p>
            <h3 class="text-white mb-0">{{ availableDisks }}</h3>
          </div>
          <div class="p-2 bg-success bg-opacity-10 rounded">
            <i class="bi bi-hdd text-success fs-4"></i>
          </div>
        </div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="card bg-dark border-warning h-100">
        <div class="card-body d-flex justify-content-between align-items-start">
          <div>
            <p class="text-secondary small mb-1">Montés</p>
            <h3 class="text-white mb-0">{{ mountedDisks }}</h3>
          </div>
          <div class="p-2 bg-warning bg-opacity-10 rounded">
            <i class="bi bi-hdd-fill text-warning fs-4"></i>
          </div>
        </div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="card bg-dark border-danger h-100">
        <div class="card-body d-flex justify-content-between align-items-start">
          <div>
            <p class="text-secondary small mb-1">Système</p>
            <h3 class="text-white mb-0">{{ systemDisks }}</h3>
          </div>
          <div class="p-2 bg-danger bg-opacity-10 rounded">
            <i class="bi bi-shield-lock text-danger fs-4"></i>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="card bg-dark border-secondary mb-4">
    <div class="card-header d-flex justify-content-between align-items-center border-secondary">
      <h5 class="mb-0 text-white">
        <i class="bi bi-hdd-stack text-info me-2"></i>Disques raw détectés
      </h5>
      <button class="btn btn-info btn-sm" routerLink="/clone">
        <i class="bi bi-copy me-1"></i>Lancer un clonage
      </button>
    </div>
    <div class="card-body p-0">
      <div class="text-center py-5" *ngIf="loading">
        <div class="spinner-border text-info mb-3" style="width:3rem;height:3rem;"></div>
        <p class="text-secondary">Détection des disques...</p>
      </div>
      <div class="alert alert-danger m-3" *ngIf="errorMsg && !loading">
        <i class="bi bi-exclamation-triangle me-2"></i>{{ errorMsg }}
      </div>
      <div class="table-responsive" *ngIf="!loading && disks.length > 0">
        <table class="table table-dark table-hover align-middle mb-0">
          <thead class="table-secondary">
            <tr>
              <th class="ps-3">Périphérique</th>
              <th>Taille</th>
              <th>État</th>
              <th>Point de montage</th>
              <th class="text-center">Sécurité</th>
              <th class="text-center pe-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let disk of disks">
              <td class="ps-3">
                <div class="d-flex align-items-center gap-2">
                  <i class="bi bi-hdd fs-5"
                     [class.text-danger]="disk.is_system_disk"
                     [class.text-warning]="disk.is_mounted && !disk.is_system_disk"
                     [class.text-info]="!disk.is_mounted && !disk.is_system_disk"></i>
                  <div>
                    <div class="fw-bold text-white font-monospace">{{ disk.name }}</div>
                    <div class="text-secondary small">{{ disk.path }}</div>
                  </div>
                </div>
              </td>
              <td><span class="badge bg-secondary fs-6">{{ disk.size_human }}</span></td>
              <td>
                <span class="badge" [class]="disk.is_mounted ? 'bg-warning text-dark' : 'bg-success'">
                  {{ disk.is_mounted ? 'Monté' : 'Libre' }}
                </span>
              </td>
              <td>
                <span class="font-monospace text-secondary small" *ngIf="disk.mount_point">{{ disk.mount_point }}</span>
                <span class="text-secondary" *ngIf="!disk.mount_point">—</span>
              </td>
              <td class="text-center">
                <span class="badge bg-danger" *ngIf="disk.is_system_disk">Système</span>
                <span class="text-success" *ngIf="!disk.is_system_disk"><i class="bi bi-shield-check"></i></span>
              </td>
              <td class="text-center pe-3">
                <button class="btn btn-outline-info btn-sm"
                        (click)="startCloneFrom(disk)"
                        [disabled]="disk.is_system_disk">
                  <i class="bi bi-copy me-1"></i>Cloner
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="text-center py-5" *ngIf="!loading && disks.length === 0">
        <i class="bi bi-hdd-x text-secondary" style="font-size:3rem;"></i>
        <p class="text-secondary mt-3">Aucun disque raw détecté</p>
      </div>
    </div>
  </div>
</div>
  `,
})
export class DashboardComponent implements OnInit {
  disks: DiskInfo[] = [];
  health: HealthInfo | null = null;
  loading = true;
  errorMsg = '';

  get availableDisks() { return this.disks.filter(d => !d.is_mounted && !d.is_system_disk).length; }
  get mountedDisks() { return this.disks.filter(d => d.is_mounted).length; }
  get systemDisks() { return this.disks.filter(d => d.is_system_disk).length; }

  constructor(private api: ApiService, private router: Router) {}

  ngOnInit() { this.refresh(); }

  refresh() {
    this.loading = true;
    this.errorMsg = '';
    this.api.getHealth().subscribe({ next: h => this.health = h, error: () => {} });
    this.api.getDisks().subscribe({
      next: d => { this.disks = d; this.loading = false; },
      error: e => {
        this.errorMsg = `Impossible de contacter l'API Flask (${e.status || 'réseau'}).`;
        this.loading = false;
      },
    });
  }

  startCloneFrom(disk: DiskInfo) {
    this.router.navigate(['/clone'], { queryParams: { src: disk.path } });
  }
}
