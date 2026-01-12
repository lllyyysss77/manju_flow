
export enum ProductionStage {
  SCRIPT = 'SCRIPT',
  ART = 'ART',
  ANIMATE = 'ANIMATE',
  AUDIO = 'AUDIO',
  REVIEW = 'REVIEW'
}

export type Status = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED';

export interface Comment {
  id: string;
  author: string;
  text: string;
  timestamp: string;
  timecode?: number; 
  replies?: Comment[];
}

export interface Scene {
  id: number;
  index: number;
  description: string;
  cameraMovement: string;
  dialogue: string;
  status: Status;
  comments: Comment[];
  startFrameUrl?: string;
  startFrameVersion?: number;
  endFrameUrl?: string;
  endFrameVersion?: number;
  animationUrl?: string;
  animationVersion?: number;
  clipUrl?: string; // backward compat
  referenceImageUrl?: string; // 剧本阶段的视觉参考图
  audios?: SceneAudioTrack[]; // 多音轨
}

export interface SceneAudioTrack {
  id: number;
  sceneId: number;
  role: string;
  index: number;
  audioUrl?: string;
  audioVersion?: number;
  createdAt?: string;
  updatedAt?: string;
}

export type VideoStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';

export interface ChapterVideo {
  id: number;
  chapterId: number;
  videoUrl?: string;
  previewUrl?: string;
  videoVersion?: number;
  status: VideoStatus;
  duration?: number;
  fileSize?: number;
  previewSize?: number;
  width?: number;
  height?: number;
  format?: string;
  codec?: string;
  bitrate?: number;
  previewBitrate?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ChapterVideoVersion {
  id: number;
  chapterVideoId: number;
  videoUrl: string;
  previewUrl?: string;
  version: number;
  duration?: number;
  fileSize?: number;
  previewSize?: number;
  width?: number;
  height?: number;
  remark?: string;
  createdBy: number;
  createdAt: string;
}

export interface Episode {
  id: number;
  title: string;
  index?: number;
  synopsis?: string;
  status: Status;
  scenes: Scene[];
}

export interface Project {
  id: number;
  title: string;
  author: string;
  cover: string;
  originalWorkType: 'NOVEL' | 'COMIC';
  productionStatus: Status;
  episodes: Episode[];
  assignedWriter?: string;
  assignedArtist?: string;
  assignedEditor?: string;
}
