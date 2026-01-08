
export enum ProductionStage {
  SCRIPT = 'SCRIPT',
  ART = 'ART',
  ANIMATE = 'ANIMATE',
  AUDIO = 'AUDIO',
  REVIEW = 'REVIEW'
}

export type Status = 'PENDING' | 'IN_PROGRESS' | 'REVIEWING' | 'REVISING' | 'COMPLETED';

export interface Comment {
  id: string;
  author: string;
  text: string;
  timestamp: string;
  timecode?: number; 
  replies?: Comment[];
}

export interface Scene {
  id: string;
  index: number;
  description: string;
  shotType: string;
  dialogue: string;
  audioNotes: string;
  status: Status;
  comments: Comment[];
  startFrameUrl?: string;
  endFrameUrl?: string;
  clipUrl?: string;
  referenceImageUrl?: string; // 剧本阶段的视觉参考图
}

export interface Episode {
  id: string;
  title: string;
  outline: string;
  status: Status;
  scenes: Scene[];
}

export interface Project {
  id: string;
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
