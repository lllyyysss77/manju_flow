
import React from 'react';
import {
  FileText,
  Palette,
  Film,
  Mic2,
  CheckSquare,
  BookOpen
} from 'lucide-react';
import { ProductionStage, Status, LoraModelType } from './types';

export const STAGE_CONFIG = [
  { stage: ProductionStage.OUTLINE, label: '大纲人设', icon: <BookOpen size={20} /> },
  { stage: ProductionStage.SCRIPT, label: '剧本创作', icon: <FileText size={20} /> },
  { stage: ProductionStage.ART, label: '分镜绘制', icon: <Palette size={20} /> },
  { stage: ProductionStage.ANIMATE, label: '动画制作', icon: <Film size={20} /> },
  { stage: ProductionStage.AUDIO, label: '音频后期', icon: <Mic2 size={20} /> },
  { stage: ProductionStage.REVIEW, label: '审核交付', icon: <CheckSquare size={20} /> },
];

/** 状态中文映射 */
export const STATUS_MAP: Record<Status, string> = {
  DRAFT: '草稿',
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成'
};

/** 默认场景占位图 (SVG data URL) */
export const DEFAULT_SCENE_THUMB =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="%23212121" offset="0%"/><stop stop-color="%230d0d0d" offset="100%"/></linearGradient></defs><rect width="320" height="180" fill="url(%23g)"/><rect x="18" y="18" width="284" height="144" rx="18" ry="18" stroke="%23333333" stroke-width="4" fill="none"/><path d="M70 120h180M140 76l-26 44m96-44l26 44" stroke="%23555555" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="118" cy="84" r="12" fill="none" stroke="%23707070" stroke-width="4"/><text x="160" y="152" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="%23666666">SCENE PREVIEW</text></svg>';

/** LoRA 适用模型选项 */
export const LORA_MODEL_OPTIONS: { value: LoraModelType; label: string }[] = [
  { value: 'SD_1.5', label: 'SD 1.5' },
  { value: 'SDXL', label: 'SDXL' },
];

/** 默认 LoRA 预览占位图 (SVG data URL) */
export const DEFAULT_LORA_PREVIEW =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="%23212121" offset="0%"/><stop stop-color="%230d0d0d" offset="100%"/></linearGradient></defs><rect width="320" height="320" fill="url(%23g)"/><rect x="40" y="40" width="240" height="240" rx="20" ry="20" stroke="%23333333" stroke-width="4" fill="none"/><circle cx="160" cy="140" r="50" fill="none" stroke="%23555555" stroke-width="4"/><path d="M130 140h60M160 110v60" stroke="%23555555" stroke-width="4" stroke-linecap="round"/><text x="160" y="230" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="%23666666">LoRA PREVIEW</text></svg>';
