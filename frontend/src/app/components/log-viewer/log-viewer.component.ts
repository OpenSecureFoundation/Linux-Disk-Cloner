import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-log-viewer',
  template: `
<div class="container-fluid py-4">
  <div class="row mb-4">
    <div class="col">
      <h1 class="h3 text-white mb-1">
        <i class="bi bi-journal-text text-info me-2"></i>Journal des opérations
      </h1>
    </div>
    <div class="col-auto d-flex gap-2">
      <select class="form-select form-select-sm bg-dark border-secondary text-white"
              [(ngModel)]="lineCount" (ngModelChange)="loadLogs()">
        <option value="50">50 lignes</option>
        <option value="100">100 lignes</option>
        <option value="250">250 lignes</option>
      </select>
      <button class="btn btn-outline-info btn-sm" (click)="loadLogs()" [disabled]="loading">
        <i class="bi bi-arrow-clockwise me-1"></i>Actualiser
      </button>
      <button class="btn btn-outline-danger btn-sm" (click)="clearLogs()">
        <i class="bi bi-trash me-1"></i>Effacer
      </button>
    </div>
  </div>

  <div class="card bg-dark border-secondary">
    <div class="card-header border-secondary d-flex justify-content-between">
      <span class="text-secondary small">{{ filteredLines.length }} / {{ allLines.length }} lignes</span>
    </div>
    <div class="card-body p-0">
      <div *ngIf="loading" class="text-center py-4">
        <div class="spinner-border text-info"></div>
      </div>
      <pre class="p-3 mb-0 small" style="background:#050808;max-height:65vh;overflow-y:auto;font-size:0.76rem;"><span
        *ngFor="let line of filteredLines"
        [class.text-danger]="line.includes('[ERROR]')"
        [class.text-warning]="line.includes('[WARN]')"
        [class.text-info]="line.includes('[INFO]')"
        [class.text-secondary]="!line.includes('[ERROR]') && !line.includes('[WARN]') && !line.includes('[INFO]')"
      >{{ line }}</span><span class="text-secondary" *ngIf="filteredLines.length === 0 && !loading">(aucun log)</span></pre>
    </div>
  </div>
</div>
  `,
})
export class LogViewerComponent implements OnInit {
  allLines: string[] = [];
  filteredLines: string[] = [];
  total = 0;
  loading = true;
  lineCount = 100;

  constructor(private api: ApiService) {}
  ngOnInit() { this.loadLogs(); }

  loadLogs() {
    this.loading = true;
    this.api.getLogs(this.lineCount).subscribe({
      next: r => { this.allLines = r.lines; this.filteredLines = r.lines; this.total = r.total; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  clearLogs() {
    if (!confirm('Effacer tous les journaux ?')) return;
    this.api.clearLogs().subscribe({ next: () => this.loadLogs() });
  }
}
