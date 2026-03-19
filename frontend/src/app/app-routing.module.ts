import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { CloneWizardComponent } from './components/clone-wizard/clone-wizard.component';
import { LogViewerComponent } from './components/log-viewer/log-viewer.component';
import { ProgressMonitorComponent } from './components/progress-monitor/progress-monitor.component';

const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'clone', component: CloneWizardComponent },
  { path: 'progress', component: ProgressMonitorComponent },
  { path: 'logs', component: LogViewerComponent },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
