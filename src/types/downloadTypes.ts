// 下载网格的选项类型定义
export type DownloadResolution = 'standard' | 'high' | 'ultra';

export type GridDownloadOptions = {
  resolution: DownloadResolution;
  showGrid: boolean;
  gridInterval: number;
  showCoordinates: boolean;
  showCellNumbers: boolean;
  gridLineColor: string;
  includeStats: boolean;
  exportCsv: boolean; // 新增：是否同时导出CSV hex数据
};
