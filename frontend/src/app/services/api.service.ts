import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, interval, switchMap, shareReplay, distinctUntilChanged } from 'rxjs';
import { map } from 'rxjs/operators';
import { DiskInfo, CloneStatus, CloneRequest, ApiResponse, HealthInfo } from '../models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly BASE = 'http://localhost:5000/api';

  constructor(private http: HttpClient) {}

  getHealth(): Observable<HealthInfo> {
    return this.http.get<ApiResponse<HealthInfo>>(`${this.BASE}/health`).pipe(map(r => r.data));
  }

  getDisks(): Observable<DiskInfo[]> {
    return this.http.get<ApiResponse<DiskInfo[]>>(`${this.BASE}/disks`).pipe(map(r => r.data));
  }

  startClone(req: CloneRequest): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${this.BASE}/clone`, req);
  }

  getCloneStatus(): Observable<CloneStatus> {
    return this.http.get<ApiResponse<CloneStatus>>(`${this.BASE}/clone/status`).pipe(map(r => r.data));
  }

  cancelClone(): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${this.BASE}/clone/cancel`, {});
  }

  pollStatus(intervalMs = 1000): Observable<CloneStatus> {
    return interval(intervalMs).pipe(
      switchMap(() => this.getCloneStatus()),
      distinctUntilChanged((a, b) => a.percent === b.percent && a.status === b.status),
      shareReplay(1),
    );
  }

  getLogs(n = 100): Observable<{ lines: string[]; total: number }> {
    const params = new HttpParams().set('n', n.toString());
    return this.http.get<ApiResponse<{ lines: string[]; total: number }>>(`${this.BASE}/logs`, { params }).pipe(map(r => r.data));
  }

  clearLogs(): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${this.BASE}/logs/clear`, {});
  }
}
