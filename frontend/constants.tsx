
import React from 'react';
import {
  FileText,
  Palette,
  Film,
  Mic2,
  CheckSquare,
  BookOpen
} from 'lucide-react';
import { ProductionStage } from './types';

export const STAGE_CONFIG = [
  { stage: ProductionStage.OUTLINE, label: '大纲人设', icon: <BookOpen size={20} /> },
  { stage: ProductionStage.SCRIPT, label: '剧本创作', icon: <FileText size={20} /> },
  { stage: ProductionStage.ART, label: '分镜绘制', icon: <Palette size={20} /> },
  { stage: ProductionStage.ANIMATE, label: '动画制作', icon: <Film size={20} /> },
  { stage: ProductionStage.AUDIO, label: '音频后期', icon: <Mic2 size={20} /> },
  { stage: ProductionStage.REVIEW, label: '审核交付', icon: <CheckSquare size={20} /> },
];

export const MOCK_PROJECTS = [
  {
    id: 1,
    title: '仙剑遗志',
    author: '林枫',
    cover: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1000&auto=format&fit=crop',
    originalWorkType: 'NOVEL' as const,
    productionStatus: 'IN_PROGRESS' as const,
    assignedWriter: '陈艾利克斯',
    assignedArtist: '老王',
    episodes: [
      {
        id: 1,
        title: '第一话：觉醒',
        status: 'IN_PROGRESS' as const,
        scenes: [
          {
            id: 1,
            index: 1,
            description: '主角眼睛睁开的特写。蓝色灵力流动。',
            cameraMovement: '大特写',
            dialogue: '我... 我回来了？',
            status: 'COMPLETED' as const,
            comments: [],
            startFrameUrl: 'https://picsum.photos/seed/sc1s/800/450',
            clipUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
          },
          {
            id: 2,
            index: 2,
            description: '镜头拉远，展示古老尘封的寺庙全景。',
            cameraMovement: '全景',
            dialogue: '',
            status: 'IN_PROGRESS' as const,
            comments: [
              { id: 'c1', author: '主编', text: '寺庙应该看起来更破败一些。', timestamp: '2024-05-20' }
            ],
            startFrameUrl: 'https://picsum.photos/seed/temple/800/450',
            endFrameUrl: 'https://picsum.photos/seed/temple2/800/450'
          }
        ]
      }
    ]
  },
  {
    id: 2,
    title: '攻壳机动',
    author: '田中',
    cover: 'https://images.unsplash.com/photo-1614728263952-84ea256f9679?q=80&w=1000&auto=format&fit=crop',
    originalWorkType: 'COMIC' as const,
    productionStatus: 'DRAFT' as const,
    episodes: []
  },
  {
    id: 3,
    title: '龙族之怒',
    author: '江南',
    cover: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=1000&auto=format&fit=crop',
    originalWorkType: 'NOVEL' as const,
    productionStatus: 'COMPLETED' as const,
    episodes: []
  }
];
