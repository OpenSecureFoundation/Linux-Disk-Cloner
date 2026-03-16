import { Component, Input, Output, EventEmitter } from '@angular/core';
import { DiskInfo } from '../../models';

@Component({
  selector: 'app-disk-list',
  template: `
<div class="row g-3">
  <div class="col-12 col-md-6" *ngFor="let disk of disks">
    <div class="card h-100 border-2"
         [class.border-info]="selected?.path === disk.path"
         [class.border-secondary]="selected?.path !== disk.path"
         [class.opacity-50]="disabled(disk)"
         [style.cursor]="disabled(disk) ? 'not-allowed' : 'pointer'"
         style="background:#1a1d20;"
         (click)="!disabled(disk) && onSelect.emit(disk)">
      <div class="card-body d-flex align-items-center gap-3">
        <i class="bi bi-hdd fs-2"
           [class.text-danger]="disk.is_system_disk"
           [class.text-warning]="disk.is_mounted && !disk.is_system_disk"
           [class.text-info]="!disk.is_mounted && !disk.is_system_disk"></i>
        <div class="flex-grow-1">
          <div class="fw-bold font-monospace text-white">{{ disk.name }}</div>
          <small class="text-secondary">{{ disk.path }}</small>
          <div class="d-flex gap-1 mt-1">
            <span class="badge bg-secondary">{{ disk.size_human }}</span>
            <span class="badge bg-danger" *ngIf="disk.is_system_disk">Système</span>
            <span class="badge bg-warning text-dark" *ngIf="disk.is_mounted && !disk.is_system_disk">Monté</span>
          </div>
        </div>
        <i class="bi bi-check-circle-fill text-info fs-4" *ngIf="selected?.path === disk.path"></i>
      </div>
    </div>
  </div>
</div>
  `,
})
export class DiskListComponent {
  @Input() disks: DiskInfo[] = [];
  @Input() selected: DiskInfo | null = null;
  @Input() mode: 'source' | 'dest' = 'source';
  @Input() excludePath = '';
  @Output() onSelect = new EventEmitter<DiskInfo>();

  disabled(d: DiskInfo): boolean {
    if (d.path === this.excludePath) return true;
    if (this.mode === 'dest') return d.is_system_disk || d.is_mounted;
    return false;
  }
}
