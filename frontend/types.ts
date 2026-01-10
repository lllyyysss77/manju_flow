
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
  endFrameUrl?: string;
  clipUrl?: string;
  referenceImageUrl?: string; // 剧本阶段的视觉参考图
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
