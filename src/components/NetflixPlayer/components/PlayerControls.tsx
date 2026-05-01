import React from 'react';
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Maximize, Minimize, Settings, Subtitles, Cast, Lock } from 'lucide-react';

interface PlayerControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isFullscreen: boolean;
  showSubtitles: boolean;
  isLocked: boolean;
  currentQuality: string;
  onTogglePlay: () => void;
  onSkip: (amount: number) => void;
  onSeek: (time: number) => void;
  onToggleMute: () => void;
  onVolumeChange: (val: number) => void;
  onToggleFullscreen: () => void;
  onToggleSettings: () => void;
  onToggleSubtitles: () => void;
  onToggleCast: () => void;
  onToggleLock: () => void;
  formatTime: (time: number) => string;
  bufferedPercentage: number;
}

export const PlayerControls: React.FC<PlayerControlsProps> = ({
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  isFullscreen,
  showSubtitles,
  isLocked,
  currentQuality,
  onTogglePlay,
  onSkip,
  onSeek,
  onToggleMute,
  onVolumeChange,
  onToggleFullscreen,
  onToggleSettings,
  onToggleSubtitles,
  onToggleCast,
  onToggleLock,
  formatTime,
  bufferedPercentage,
}) => {
  if (isLocked) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 p-4 md:p-8 bg-gradient-to-t from-black/90 via-black/40 to-transparent z-[305] transition-opacity duration-300">
      {/* Progress Bar */}
      <div className="group relative w-full h-1.5 md:h-2 bg-gray-600/50 rounded-full mb-4 md:mb-6 cursor-pointer overflow-visible">
        <div 
          className="absolute top-0 left-0 h-full bg-gray-400/40 rounded-full transition-all duration-300"
          style={{ width: `${bufferedPercentage}%` }}
        />
        <div 
          className="absolute top-0 left-0 h-full bg-red-600 rounded-full"
          style={{ width: `${(currentTime / duration) * 100}%` }}
        />
        <input 
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={currentTime}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
        <div 
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 bg-red-600 rounded-full border-2 border-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl"
          style={{ left: `calc(${(currentTime / duration) * 100}% - 10px)` }}
        />
      </div>

      <div className="flex items-center justify-between gap-4 md:gap-8">
        <div className="flex items-center gap-3 md:gap-6">
          <button onClick={onTogglePlay} className="text-white hover:scale-110 transition-transform p-1">
            {isPlaying ? <Pause size={32} fill="white" /> : <Play size={32} fill="white" />}
          </button>
          
          <div className="flex items-center gap-2 md:gap-4">
            <button onClick={() => onSkip(-10)} className="text-white hover:text-red-500 transition-colors p-1">
              <RotateCcw size={28} />
            </button>
            <button onClick={() => onSkip(10)} className="text-white hover:text-red-500 transition-colors p-1">
              <RotateCw size={28} />
            </button>
          </div>

          <div className="flex items-center gap-2 md:gap-3 group/volume">
            <button onClick={onToggleMute} className="text-white hover:text-red-500 transition-colors p-1">
              {isMuted || volume === 0 ? <VolumeX size={28} /> : <Volume2 size={28} />}
            </button>
            <div className="w-0 group-hover/volume:w-24 md:group-hover/volume:w-32 overflow-hidden transition-all duration-300">
              <input 
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                className="w-24 md:w-32 h-1.5 md:h-2 bg-gray-600 rounded-full appearance-none cursor-pointer accent-red-600"
              />
            </div>
          </div>

          <div className="text-white font-black text-sm md:text-lg tabular-nums tracking-tight">
            {formatTime(currentTime)} <span className="text-gray-400 mx-1">/</span> {formatTime(duration)}
          </div>
        </div>

        <div className="flex items-center gap-3 md:gap-6">
          <button onClick={onToggleSubtitles} className={`transition-colors p-1 ${showSubtitles ? 'text-red-500' : 'text-white hover:text-gray-300'}`}>
            <Subtitles size={24} md:size={28} />
          </button>
          
          <button onClick={onToggleSettings} className="text-white hover:text-red-500 transition-colors p-1">
            <Settings size={24} md:size={28} />
          </button>

          <button onClick={onToggleCast} className="text-white hover:text-red-500 transition-colors p-1">
            <Cast size={24} md:size={28} />
          </button>

          <button onClick={onToggleFullscreen} className="text-white hover:text-red-500 transition-colors p-1">
            {isFullscreen ? <Minimize size={24} md:size={28} /> : <Maximize size={24} md:size={28} />}
          </button>
          
          <button onClick={onToggleLock} className="text-white hover:text-red-500 transition-colors p-1">
            <Lock size={24} md:size={28} />
          </button>
        </div>
      </div>
    </div>
  );
};
