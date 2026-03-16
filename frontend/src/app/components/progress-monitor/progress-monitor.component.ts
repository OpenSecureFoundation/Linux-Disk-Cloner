import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { CloneStatus } from '../../models';

@Component({
  selector: 'app-progress-monitor',
  template: `
<div class="container-fluid py-4">
  <div class="row justify-content-center">
    <div class="col-lg-9">
      <div class="d-flex align-items-center gap-3 mb-4">
        <h1 class="h3 text-white mb-0">
          <i class="bi bi-activity text-info me-2"></i>Progression
        </h1>
        <span class="badge fs-6" [class]="statusBadgeClass">{{ statusLabel }}</span>
      </div>

      <div class="card bg-dark border-info mb-4">
        <div class="card-body">
          <div class="text-center py-4" *ngIf="!status || status.status === 'idle'">
            <i class="bi bi-hdd-stack text-secondary" style="font-size:3rem;"></i>
            <p class="text-secondary mt-3">En attente d'une opération...</p>
            <button class="btn btn-info" routerLink="/clone">
              <i class="bi bi-copy me-1"></i>Lancer un clonage
            </button>
          </div>

          <div *ngIf="status && status.status !== 'idle'">
            <div class="alert mb-4"
                 [class.alert-info]="status.status === 'running'"
                 [class.alert-success]="status.status === 'done'"
                 [class.alert-danger]="status.status === 'error'">
              <div class="d-flex align-items-center gap-2">
                <span class="spinner-border spinner-border-sm" *ngIf="status.status === 'running'"></span>
                <i class="bi bi-check-circle-fill" *ngIf="status.status === 'done'"></i>
                <i class="bi bi-exclamation-triangle-fill" *ngIf="status.status === 'error'"></i>
                {{ status.message }}
              </div>
            </div>

            <div class="mb-2 d-flex justify-content-between">
              <span class="text-white fw-bold">{{ status.percent | number:'1.1-1' }}%</span>
              <span class="text-secondary">{{ formatBytes(status.bytes_done) }} / {{ formatBytes(status.bytes_total) }}</span>
            </div>
            <div class="progress mb-4" style="height:28px;border-radius:6px;">
              <div class="progress-bar progress-bar-striped"
                   [class.progress-bar-animated]="status.status === 'running'"
                   [class.bg-info]="status.status === 'running'"
                   [class.bg-success]="status.status === 'done'"
                   [class.bg-danger]="status.status === 'error'"
                   [style.width.%]="status.percent">
                <strong *ngIf="status.percent > 10">{{ status.percent | number:'1.1-1' }}%</strong>
              </div>
            </div>

            <div class="row g-3 mb-3">
              <div class="col-6 col-md-3">
                <div class="card bg-secondary bg-opacity-10 border-secondary text-center p-3">
                  <div class="text-info fw-bold fs-4">{{ status.speed_mbps | number:'1.1-1' }}</div>
                  <small class="text-secondary">Mo/s</small>
                </div>
              </div>
              <div class="col-6 col-md-3">
                <div class="card bg-secondary bg-opacity-10 border-secondary text-center p-3">
                  <div class="text-white fw-bold fs-4">{{ formatTime(status.elapsed_sec) }}</div>
                  <small class="text-secondary">Écoulé</small>
                </div>
              </div>
              <div class="col-6 col-md-3">
                <div class="card bg-secondary bg-opacity-10 border-secondary text-center p-3">
                  <div class="text-warning fw-bold fs-4">{{ formatTime(status.eta_sec) }}</div>
                  <small class="text-secondary">Restant</small>
                </div>
              </div>
              <div class="col-6 col-md-3">
                <div class="card bg-secondary bg-opacity-10 border-secondary text-center p-3">
                  <div class="text-white fw-bold fs-4">{{ formatBytes(status.bytes_done) }}</div>
                  <small class="text-secondary">Copiés</small>
                </div>
              </div>
            </div>

            <div class="d-flex gap-2 justify-content-end">
              <button class="btn btn-outline-danger"
                      *ngIf="status.status === 'running'"
                      (click)="cancelClone()" [disabled]="cancelling">
                <span *ngIf="cancelling" class="spinner-border spinner-border-sm me-1"></span>
                <i *ngIf="!cancelling" class="bi bi-stop-circle me-1"></i>Annuler
              </button>
              <button class="btn btn-info" *ngIf="status.status === 'done'" routerLink="/dashboard">
                <i class="bi bi-house me-1"></i>Tableau de bord
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="card bg-dark border-secondary">
        <div class="card-header border-secondary">
          <h6 class="mb-0 text-secondary"><i class="bi bi-terminal me-2"></i>Journal en direct</h6>
        </div>
        <div class="card-body p-0">
          <pre class="bg-black text-success p-3 mb-0 small"
               style="max-height:200px;overflow-y:auto;font-size:0.78rem;">{{ logLines.join('') || '(pas encore de logs)' }}</pre>
        </div>
      </div>
    </div>
  </div>
</div>
  `,
})
export class ProgressMonitorComponent implements OnInit, OnDestroy {
  status: CloneStatus | null = null;
  logLines: string[] = [];
  cancelling = false;
  private pollSub?: Subscription;
  private tickSub?: any;

  get statusLabel(): string {
    switch (this.status?.status) {
      case 'running': return 'En cours';
      case 'done': return 'Terminé';
      case 'error': return 'Erreur';
      default: return 'En attente';
    }
  }
  get statusBadgeClass(): string {
    switch (this.status?.status) {
      case 'running': return 'bg-info text-dark';
      case 'done': return 'bg-success';
      case 'error': return 'bg-danger';
      default: return 'bg-secondary';
    }
  }

  constructor(private api: ApiService, private router: Router) {}

  ngOnInit() {
    this.pollSub = this.api.pollStatus(1000).subscribe(s => { this.status = s; });
    this.loadLogs();
    this.tickSub = setInterval(() => this.loadLogs(), 5000);
  }

  ngOnDestroy() {
    this.pollSub?.unsubscribe();
    clearInterval(this.tickSub);
  }

  loadLogs() {
    this.api.getLogs(50).subscribe(r => { this.logLines = r.lines; });
  }

  cancelClone() {
    this.cancelling = true;
    this.api.cancelClone().subscribe({
      next: () => { this.cancelling = false; },
      error: () => { this.cancelling = false; },
    });
  }

  formatBytes(b: number): string {
    if (!b) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let v = b, u = 0;
    while (v >= 1024 && u < 4) { v /= 1024; u++; }
    return `${v.toFixed(1)} ${units[u]}`;
  }

  formatTime(sec: number): string {
    if (!sec || sec <= 0) return '--:--';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
}
