import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../services/api.service';
import { HealthInfo } from '../../models';

@Component({
  selector: 'app-navbar',
  template: `
<nav class="navbar navbar-expand-lg navbar-dark bg-dark border-bottom border-secondary">
  <div class="container-fluid">
    <a class="navbar-brand d-flex align-items-center gap-2" routerLink="/dashboard">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="6" width="20" height="12" rx="2" stroke="#0dcaf0" stroke-width="1.5"/>
        <circle cx="18" cy="12" r="1.5" fill="#0dcaf0"/>
        <rect x="5" y="10" width="8" height="1.5" rx="0.75" fill="#6c757d"/>
      </svg>
      <span class="fw-bold">DISK<span class="text-info">CLONER</span></span>
    </a>
    <div class="collapse navbar-collapse">
      <ul class="navbar-nav me-auto">
        <li class="nav-item">
          <a class="nav-link" routerLink="/dashboard" routerLinkActive="active">
            <i class="bi bi-speedometer2 me-1"></i>Tableau de bord
          </a>
        </li>
        <li class="nav-item">
          <a class="nav-link" routerLink="/clone" routerLinkActive="active">
            <i class="bi bi-copy me-1"></i>Cloner
          </a>
        </li>
        <li class="nav-item">
          <a class="nav-link" routerLink="/logs" routerLinkActive="active">
            <i class="bi bi-journal-text me-1"></i>Journaux
          </a>
        </li>
	<li class="nav-item">
 	  <a class="nav-link" routerLink="/progress" routerLinkActive="active">
   	     <i class="bi bi-activity me-1"></i>Progression
 	  </a>
	 </li>
      </ul>
      <div class="d-flex align-items-center gap-2" *ngIf="health">
        <span class="badge" [class]="health.mock_mode ? 'bg-warning text-dark' : 'bg-success'">
          {{ health.mock_mode ? 'Simulation' : 'OpenSolaris' }}
        </span>
        <span class="badge bg-danger" *ngIf="!health.is_root">Non-root</span>
        <span class="badge bg-info text-dark" *ngIf="health.clone_running">
          <span class="spinner-border spinner-border-sm me-1"></span>Clonage en cours
        </span>
      </div>
    </div>
  </div>
</nav>
  `,
})
export class NavbarComponent implements OnInit {
  health: HealthInfo | null = null;
  constructor(private api: ApiService) {}
  ngOnInit() {
    this.api.getHealth().subscribe({ next: h => this.health = h, error: () => {} });
    setInterval(() => {
      this.api.getHealth().subscribe({ next: h => this.health = h, error: () => {} });
    }, 5000);
  }
}
