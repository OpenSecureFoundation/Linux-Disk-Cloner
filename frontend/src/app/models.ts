export interface DiskInfo {
  path: string;
  name: string;
  size_bytes: number;
  size_human: string;
  is_mounted: boolean;
  mount_point: string;
  is_system_disk: boolean;
  filesystem: string;
}

export interface CloneStatus {
  bytes_total: number;
  bytes_done: number;
  percent: number;
  speed_mbps: number;
  elapsed_sec: number;
  eta_sec: number;
  status: 'idle' | 'running' | 'done' | 'error';
  message: string;
  error_code: number;
  error_message: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface HealthInfo {
  version: string;
  engine_ready: boolean;
  mock_mode: boolean;
  is_root: boolean;
  clone_running: boolean;
  warning: string | null;
}

export interface CloneRequest {
  src: string;
  dst: string;
  block_size: number;
  force: boolean;
  confirm: string;
  mode:     number;
  compress: boolean;
}

export type CloneStep = 'select-source' | 'select-dest' | 'confirm' | 'cloning' | 'done';
