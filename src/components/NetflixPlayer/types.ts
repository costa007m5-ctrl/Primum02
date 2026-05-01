export interface VideoUrlOption {
  id: string;
  label: string;
  url: string;
}

export interface NetflixPlayerProps {
  src: string;
  title: string;
  movieId?: string | number;
  backdropUrl?: string;
  posterUrl?: string;
  logoUrl?: string;
  onClose: () => void;
  onProgress?: (currentTime: number, duration?: number) => void;
  initialTime?: number;
  onNextEpisode?: () => void;
  hasNextEpisode?: boolean;
  isMovie?: boolean;
  recommendations?: any[];
  onSelectRecommendation?: (movie: any) => void;
  onSwitchPlayer?: () => void;
  subtitleUrl?: string;
  videoUrlOptions?: VideoUrlOption[];
  isHost?: boolean;
  roomId?: string;
  profile?: any;
  maxQualityHeight?: number;
  isBackgroundMode?: boolean;
  onClickBackground?: () => void;
}

export interface PlayerError {
  message: string;
  type: 'network' | 'format' | 'unknown';
}

export interface QualityLevel {
  id: number | string;
  height: number;
  bitrate?: number;
  label?: string;
}

export interface Emote {
  id: string | number;
  emoji: string;
  x: number;
  y: number;
  profileName?: string;
}

export interface RoomUser {
  id: string;
  profileName: string;
  avatar: string;
}
