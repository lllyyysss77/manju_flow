
export enum ProductionStage {
  OUTLINE = 'OUTLINE',
  SCRIPT = 'SCRIPT',
  ART = 'ART',
  ANIMATE = 'ANIMATE',
  AUDIO = 'AUDIO',
  REVIEW = 'REVIEW'
}

export type Status = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED';

export type CommentModule = 'script' | 'storyboard' | 'animation' | 'audio' | 'review';
export type CommentTargetType = 'scene' | 'chapter';
export type CommentStatus = 'unresolved' | 'resolved';

export interface CommentUser {
  id: number;
  username: string;
  nickname?: string;
}

export interface Comment {
  id: number;
  content: string;
  targetType: CommentTargetType;
  targetId: number;
  module: CommentModule;
  userId: number;
  user?: CommentUser;
  meta?: string;
  status: CommentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CommentListResponse {
  total: number;
  data: Comment[];
}

export interface ReviewCommentMeta {
  timecode?: string;
  seconds?: number;
}

// 通用评论元数据（支持图片附件）
export interface CommentMeta {
  // 审核交付时间点
  timecode?: string;
  seconds?: number;
  // 图片附件
  imageUrl?: string;
  imageName?: string;
}

// 场景参考资料（支持多个）
export interface SceneReference {
  id: number;
  sceneId: number;
  index: number;
  imageUrl?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Scene {
  id: number;
  chapterId?: number;
  index: number;
  description: string;
  cameraMovement: string;
  dialogue: string;
  transitionEffect?: string; // 转场或剪辑手法
  status: Status;
  comments?: Comment[];
  references?: SceneReference[]; // 多参考资料（一对多）
  thumbnailUrl?: string; // 场景预览缩略图（首帧）
  audios?: SceneAudioTrack[]; // 多音轨
  frameSets?: SceneFrameSet[];
  animations?: SceneAnimation[];
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

export interface SceneFrameSet {
  id: number;
  sceneId: number;
  name: string;
  index: number;
  startFrameUrl?: string;
  startFrameVersion?: number;
  endFrameUrl?: string;
  endFrameVersion?: number;
  createdAt?: string;
  updatedAt?: string;
}

export type FrameType = 'START' | 'END';

export interface SceneFrameSetVersion {
  id: number;
  sceneFrameSetId: number;
  frameType: FrameType;
  imageUrl: string;
  version: number;
  createdBy?: number;
  createdAt?: string;
}

export interface SceneAnimation {
  id: number;
  sceneId: number;
  name: string;
  index: number;
  animationUrl?: string;
  animationVersion?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SceneAnimationVersion {
  id: number;
  sceneAnimationId: number;
  videoUrl: string;
  version: number;
  createdBy?: number;
  createdAt?: string;
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
  outline?: string;
  characters?: Character[];
}

export interface Character {
  id: number;
  bookId: number;
  name: string;
  description: string;
  referenceImageUrl?: string;
  voiceAudioUrl?: string;
  index: number;
  createdAt?: string;
  updatedAt?: string;
}
