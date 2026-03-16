import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { DiskListComponent } from './components/disk-list/disk-list.component';
import { CloneWizardComponent } from './components/clone-wizard/clone-wizard.component';
import { ProgressMonitorComponent } from './components/progress-monitor/progress-monitor.component';
import { LogViewerComponent } from './components/log-viewer/log-viewer.component';
import { NavbarComponent } from './components/navbar/navbar.component';

@NgModule({
  declarations: [
    AppComponent,
    DashboardComponent,
    DiskListComponent,
    CloneWizardComponent,
    ProgressMonitorComponent,
    LogViewerComponent,
    NavbarComponent,
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    HttpClientModule,
    FormsModule,
    ReactiveFormsModule,
    AppRoutingModule,
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
