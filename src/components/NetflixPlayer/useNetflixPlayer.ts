import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import screenfull from 'screenfull';
import Hls from 'hls.js';
import { supabase } from '../../lib/supabase';
import { NetflixPlayerProps, PlayerError, QualityLevel, Emote, RoomUser } from './types';

export function useNetflixPlayer(props: NetflixPlayerProps) {
  const {
    src,
    title,
    movieId,
    onProgress,
    initialTime = 0,
    onNextEpisode,
    hasNextEpisode,
    isMovie,
    recommendations = [],
    onSelectRecommendation,
    subtitleUrl,
    videoUrlOptions = [],
    isHost = true,
    roomId,
    profile,
    isBackgroundMode,
  } = props;

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Robust Extraction of nested URLs
  const parsedUrls = useMemo(() => {
    let vToPlay = src;
    let sToPlay = subtitleUrl;
    
    try {
      if (src.includes('video_url=')) {
        const hashPart = src.split('#')[1] || '';
        const queryPart = src.split('?')[1] || '';
        const combined = new URLSearchParams(hashPart + '&' + queryPart);
        
        const v = combined.get('video_url');
        const s = combined.get('subtitle_url');
        
        if (v) vToPlay = v;
        if (s) sToPlay = s;
      }
      
      try {
        if (vToPlay.includes('%')) vToPlay = decodeURIComponent(vToPlay);
        if (sToPlay && sToPlay.includes('%')) sToPlay = decodeURIComponent(sToPlay);
      } catch(e) {}
    } catch (e) {
      console.warn("URL Extraction failed", e);
    }
    
    return { video_url: vToPlay, subtitle_url: sToPlay };
  }, [src, subtitleUrl]);

  const [activeSrc, setActiveSrc] = useState(parsedUrls.video_url);
  const [activeSubtitleUrl, setActiveSubtitleUrl] = useState(parsedUrls.subtitle_url);
  const [sessionKey, setSessionKey] = useState(() => Date.now());
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(!!isBackgroundMode);
  const [showControls, setShowControls] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [showUnlockOverlay, setShowUnlockOverlay] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [showStuckButton, setShowStuckButton] = useState(false);
  const [error, setError] = useState<PlayerError | null>(null);
  const [bufferedPercentage, setBufferedPercentage] = useState(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number>(0);
  const [showRecsOverlay, setShowRecsOverlay] = useState(false);
  const [showTvShare, setShowTvShare] = useState(false);
  const [showLogoOverlay, setShowLogoOverlay] = useState(false);
  const [showAutoNext, setShowAutoNext] = useState(false);
  const [showRestartButton, setShowRestartButton] = useState(false);
  const [autoNextCounter, setAutoNextCounter] = useState(10);
  const [isLandscape, setIsLandscape] = useState(false);
  const [qualityLevels, setQualityLevels] = useState<QualityLevel[]>([]);
  const [currentQuality, setCurrentQuality] = useState<string>(() => {
    return localStorage.getItem('lastQuality') || 'Auto';
  });
  const [isAutoQuality, setIsAutoQuality] = useState(true);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [canCast, setCanCast] = useState(false);
  const [isCasting, setIsCasting] = useState(false);
  const [qualityToast, setQualityToast] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(() => {
    const saved = localStorage.getItem('autoRotate');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [objectFit, setObjectFit] = useState<'contain' | 'cover'>('contain');
  const [emotes, setEmotes] = useState<Emote[]>([]);
  const [showEmotePicker, setShowEmotePicker] = useState(false);
  const [roomUsers, setRoomUsers] = useState<RoomUser[]>([]);

  const channelRef = useRef<any>(null);
  const clientIdRef = useRef(Math.random().toString(36).substring(2, 10));
  const lastProgressTime = useRef(0);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 2;
  const hasSeekedRef = useRef(false);
  const hasStartedPlayedRef = useRef(false);
  const recsDismissedRef = useRef(false);
  const recsDismissedTimeRef = useRef<number | null>(null);
  const recsTargetTimeRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  const isMedianApp = useCallback(() => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent.toLowerCase();
    return ua.includes('median') || ua.includes('gonative');
  }, []);

  const setMedianOrientation = useCallback((orientation: 'landscape' | 'portrait' | 'unlocked') => {
    try {
      if (typeof window !== 'undefined' && isMedianApp()) {
        if ((window as any).median) {
          (window as any).median.screen.setOrientation({orientation});
        } else if ((window as any).gonative) {
          (window as any).gonative.screen.setOrientation({orientation});
        } else {
          window.location.href = `median://screen/setOrientation?orientation=${orientation}`;
        }
      }
    } catch(e) {}
  }, [isMedianApp]);

  const lockOrientation = useCallback(async () => {
    if (!autoRotate) return;
    try {
      if (screen.orientation && (screen.orientation as any).lock) {
        await (screen.orientation as any).lock('landscape').catch(() => {});
      }
    } catch (e) {
      console.warn("Orientation lock not supported", e);
    }
    setMedianOrientation('landscape');
  }, [autoRotate, setMedianOrientation]);

  const resetControlsTimer = useCallback((forceShow = false) => {
    if (isLocked && !forceShow) return; 
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
      setShowSpeedMenu(false);
      setShowSettingsMenu(false);
      setShowQualityMenu(false);
      setShowEmotePicker(false);
    }, 5000);
  }, [isLocked]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      if (video.paused) {
        lockOrientation();
        video.play().catch(e => {
          console.warn("Autoplay block", e);
          setIsLoading(false);
          setLoadingProgress(100);
          setShowLogoOverlay(false);
          setShowControls(true);
          setIsPlaying(false);
        });
        if (isHost && channelRef.current && roomId) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'room_event',
            payload: { type: 'play', sender_id: clientIdRef.current }
          }).catch(() => {});
        }
      } else {
        if (!isHost && roomId) return;
        video.pause();
        if (isHost && channelRef.current && roomId) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'room_event',
            payload: { type: 'pause', sender_id: clientIdRef.current }
          }).catch(() => {});
        }
      }
    }
  }, [isHost, roomId, lockOrientation]);

  const handleRestart = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      setShowRestartButton(false);
      if (isHost && channelRef.current && roomId) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'room_event',
          payload: { type: 'seek', time: 0, sender_id: clientIdRef.current }
        }).catch(() => {});
      }
    }
  }, [isHost, roomId]);

  const handleSeek = useCallback((time: number) => {
    if (!isHost && roomId) return;
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
      if (isHost && channelRef.current && roomId) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'room_event',
          payload: { type: 'seek', time, sender_id: clientIdRef.current }
        }).catch(() => {});
      }
    }
  }, [isHost, roomId]);

  const skip = useCallback((amount: number) => {
    if (!isHost && roomId) return;
    if (videoRef.current) {
      videoRef.current.currentTime += amount;
      if (isHost && channelRef.current && roomId) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'room_event',
          payload: { type: 'seek', time: videoRef.current.currentTime, sender_id: clientIdRef.current }
        }).catch(() => {});
      }
    }
  }, [isHost, roomId]);

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      const newMuted = !videoRef.current.muted;
      videoRef.current.muted = newMuted;
      setIsMuted(newMuted);
    }
  }, []);

  const handleVolumeChange = useCallback((val: number) => {
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      const newMuted = val === 0;
      videoRef.current.muted = newMuted;
      setIsMuted(newMuted);
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (containerRef.current && screenfull.isEnabled) {
      screenfull.toggle(containerRef.current);
      if (!screenfull.isFullscreen && screen.orientation && (screen.orientation as any).lock) {
        (screen.orientation as any).lock('landscape').catch(() => {});
      }
    }
    try {
      if (isMedianApp()) {
        if (!isFullscreen) {
          window.location.href = 'median://screen/fullScreen';
        } else {
          window.location.href = 'median://screen/normalScreen';
        }
      }
    } catch(e) {}
  }, [isFullscreen, isMedianApp]);

  const togglePiP = useCallback(async () => {
    try {
      const video = videoRef.current as any;
      if (!video) return;
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      } else if (video.webkitSupportsPresentationMode && typeof video.webkitSetPresentationMode === "function") {
        const currentMode = video.webkitPresentationMode;
        const newMode = currentMode === "picture-in-picture" ? "inline" : "picture-in-picture";
        video.webkitSetPresentationMode(newMode);
      }
    } catch (error) {
      console.error("PiP error:", error);
    }
  }, []);

  const sendEmote = useCallback((emote: string) => {
    if (channelRef.current && roomId) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'room_event',
        payload: { type: 'emote', emoji: emote, profileName: profile?.name, sender_id: clientIdRef.current }
      }).catch((e: Error) => console.error("Emote broadcast err:", e));
    }
    
    const x = 20 + Math.random() * 60;
    const y = 20 + Math.random() * 60;
    const id = Math.random();
    setEmotes(prev => [...prev, { id, emoji: emote, x, y, profileName: profile?.name }]);
    setTimeout(() => {
      setEmotes(prev => prev.filter(e => e.id !== id));
    }, 3000);
    
    setShowEmotePicker(false);
    resetControlsTimer();
  }, [roomId, profile?.name, resetControlsTimer]);

  const getQualityLabel = useCallback((height: number) => {
    if (height >= 2160) return '4K';
    if (height >= 1440) return '2K';
    if (height >= 1080) return 'FULL HD';
    if (height >= 720) return 'HD';
    return 'SD';
  }, []);

  const handleQualityChange = useCallback((levelId: number | string) => {
    let label = 'Auto';
    if (levelId === 'auto') {
      if (hlsRef.current) hlsRef.current.currentLevel = -1;
      setIsAutoQuality(true);
      setCurrentQuality('Auto');
      setQualityToast('Qualidade: Automático');
    } else {
      setIsAutoQuality(false);
      const fixedOption = videoUrlOptions.find(o => o.id === levelId);
      if (fixedOption) {
        setActiveSrc(fixedOption.url);
        label = fixedOption.id.toUpperCase();
        setCurrentQuality(label);
        setQualityToast(`Qualidade: ${fixedOption.label}`);
      } else {
        const id = typeof levelId === 'string' ? parseInt(levelId) : levelId;
        if (hlsRef.current) {
          hlsRef.current.currentLevel = id;
          const level = hlsRef.current.levels[id];
          if (level) {
            label = getQualityLabel(level.height);
            setCurrentQuality(label);
            setQualityToast(`Qualidade definida: ${label}`);
          }
        }
      }
    }
    localStorage.setItem('lastQuality', label);
    setTimeout(() => setQualityToast(null), 3000);
    setShowQualityMenu(false);
  }, [videoUrlOptions, getQualityLabel]);

  const toggleReparar = useCallback(() => {
    setSessionKey(Date.now());
    setShowStuckButton(false);
    setError(null);
    setIsLoading(true);
  }, []);

  // Sync background mode
  useEffect(() => {
    setIsMuted(!!isBackgroundMode);
    if (!isBackgroundMode) {
      setShowControls(true);
      resetControlsTimer(true);
      if (containerRef.current && screenfull.isEnabled) {
        screenfull.request(containerRef.current).catch(() => {});
      }
    }
  }, [isBackgroundMode, resetControlsTimer]);

  // Sync activeSrc
  useEffect(() => {
    if (parsedUrls.video_url !== activeSrc) {
      setActiveSrc(parsedUrls.video_url);
      setActiveSubtitleUrl(parsedUrls.subtitle_url);
      setSessionKey(Date.now());
      setShowStuckButton(false);
    }
  }, [parsedUrls.video_url, parsedUrls.subtitle_url]);

  // Room Sync Logic
  useEffect(() => {
    if (roomId && profile) {
      const channel = supabase.channel(`room:${roomId}`, {
        config: {
          broadcast: { ack: true },
          presence: { key: clientIdRef.current },
        },
      });

      channelRef.current = channel;
      let syncInterval: any;

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const users = Object.values(state).flat().map((p: any) => ({
            id: p.profileId,
            profileName: p.profileName,
            avatar: p.avatar
          }));
          const uniqueUsers = Array.from(new Map(users.map(item => [item.profileName, item])).values());
          setRoomUsers(uniqueUsers);
        })
        .on('broadcast', { event: 'room_event' }, ({ payload }) => {
          if (payload.sender_id === clientIdRef.current) return;
          switch (payload.type) {
            case 'sync_host':
              if (!isHost && videoRef.current) {
                const diff = Math.abs(videoRef.current.currentTime - payload.currentTime);
                if (diff > 4) videoRef.current.currentTime = payload.currentTime;
                if (payload.playing && videoRef.current.paused) videoRef.current.play().catch(() => {});
                else if (!payload.playing && !videoRef.current.paused) videoRef.current.pause();
              }
              break;
            case 'play':
              if (videoRef.current && videoRef.current.paused) videoRef.current.play().catch(() => {});
              break;
            case 'pause':
              if (videoRef.current && !videoRef.current.paused) videoRef.current.pause();
              break;
            case 'seek':
              if (videoRef.current) videoRef.current.currentTime = payload.time;
              break;
            case 'emote':
              const x = 20 + Math.random() * 60;
              const y = 20 + Math.random() * 60;
              const id = Math.random();
              setEmotes(prev => [...prev, { id, emoji: payload.emoji, x, y, profileName: payload.profileName }]);
              setTimeout(() => setEmotes(prev => prev.filter(e => e.id !== id)), 3000);
              break;
          }
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({
              profileId: profile.id || 'anonymous',
              profileName: profile.name || 'Usuário',
              avatar: profile.avatar_url,
              joined_at: new Date().toISOString(),
            });
            if (isHost && !syncInterval) {
              syncInterval = setInterval(() => {
                if (videoRef.current) {
                  channel.send({
                    type: 'broadcast',
                    event: 'room_event',
                    payload: { 
                      type: 'sync_host', 
                      playing: !videoRef.current.paused, 
                      currentTime: videoRef.current.currentTime,
                      sender_id: clientIdRef.current 
                    }
                  }).catch(() => {});
                }
              }, 3000);
            }
          }
        });

      return () => {
        if (syncInterval) clearInterval(syncInterval);
        channel.unsubscribe();
      };
    }
  }, [roomId, isHost, profile]);

  // Video Events and initialization
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setError(null);
    setIsLoading(true);
    setLoadingProgress(0);
    retryCountRef.current = 0;
    
    if (initialTime > 30) {
      setShowRestartButton(true);
      const timer = setTimeout(() => setShowRestartButton(false), 8000);
    }
    
    const initPlayer = () => {
      if (!video) return;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch (e) {}

      const videoToPlay = activeSrc;
      if (!videoToPlay) return;

      const lowerSrc = videoToPlay.toLowerCase();
      let startLoadTimer: NodeJS.Timeout;

      const initUnifiedMode = () => {
        startLoadTimer = setTimeout(() => {
          if (!video) return;
          setLoadingProgress(25);
          const startPoint = initialTime > 0 ? Math.max(0, initialTime - 2) : -1;
          
          if (lowerSrc.includes('.m3u8')) {
            if (Hls.isSupported()) {
              const hls = new Hls({
                enableWorker: true,
                startPosition: startPoint,
                maxBufferLength: 30,
                maxMaxBufferLength: 60,
                maxBufferSize: 60 * 1000 * 1000,
                nudgeOffset: 0.1,
                nudgeMaxRetry: 5,
              });
              hls.attachMedia(video);
              hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(videoToPlay));
              hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
                let parsedLevels = data.levels.map((l, i) => ({ id: i, height: l.height, bitrate: l.bitrate })).sort((a, b) => b.height - a.height);
                setQualityLevels(parsedLevels);
                setLoadingProgress(50);
                video.play().catch(() => {});
              });
              hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                  if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                    if (retryCountRef.current < 5) {
                      retryCountRef.current++;
                      hls.startLoad();
                    } else {
                      setError({ message: "Conexão instável. Tente reparar.", type: 'network' });
                      setIsLoading(false);
                    }
                  } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                    hls.recoverMediaError();
                  } else {
                    setError({ message: "Erro ao processar vídeo.", type: 'unknown' });
                  }
                }
              });
              hlsRef.current = hls;
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
              video.src = videoToPlay;
              video.play().catch(() => {});
            }
          } else {
            video.src = videoToPlay;
            video.play().catch(() => {});
          }
        }, 0);
      };
      initUnifiedMode();
      return () => clearTimeout(startLoadTimer);
    };

    const handleTimeUpdate = () => {
      const time = video.currentTime;
      setCurrentTime(time);
      if (onProgress && Math.abs(time - lastProgressTime.current) >= 10) {
        onProgress(time, video.duration);
        lastProgressTime.current = time;
      }
      const didSeek = Math.abs(time - lastTimeRef.current) > 2;
      lastTimeRef.current = time;

      if (time > 0.1 && video.readyState >= 3 && !video.seeking) {
        setIsLoading(false);
        setLoadingProgress(100);
        setShowLogoOverlay(false);
      }

      if (video.duration > 0) {
        const timeFromEnd = video.duration - time;
        if (hasNextEpisode) {
          if (timeFromEnd <= 120 && timeFromEnd > 0) {
            setShowAutoNext(true);
            if (recsTargetTimeRef.current === null || didSeek) recsTargetTimeRef.current = time + 15;
            const nextCounter = Math.max(0, Math.ceil(recsTargetTimeRef.current - time));
            setAutoNextCounter(nextCounter);
            if (nextCounter === 0 && onNextEpisode) onNextEpisode();
          } else {
            setShowAutoNext(false);
            recsTargetTimeRef.current = null;
          }
        } else {
          if (timeFromEnd <= 440 && timeFromEnd > 0) {
            if (recsDismissedRef.current && recsDismissedTimeRef.current !== null && time > recsDismissedTimeRef.current + 40) {
              recsDismissedRef.current = false;
            }
            if (!recsDismissedRef.current) {
              setShowRecsOverlay(true);
              if (recsTargetTimeRef.current === null || didSeek) recsTargetTimeRef.current = time + 15;
              const nextCounter = Math.max(0, Math.ceil(recsTargetTimeRef.current - time));
              setAutoNextCounter(nextCounter);
              if (nextCounter === 0 && onSelectRecommendation && recommendations.length > 0) onSelectRecommendation(recommendations[0]);
            }
          } else {
            setShowRecsOverlay(false);
            recsDismissedRef.current = false;
            recsTargetTimeRef.current = null;
          }
        }
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      if (!hlsRef.current) setCurrentQuality(getQualityLabel(video.videoHeight));
    };

    const handlePause = () => {
      setIsPlaying(false);
      if (isHost && channelRef.current && roomId) {
        channelRef.current.send({ type: 'broadcast', event: 'room_event', payload: { type: 'pause', sender_id: clientIdRef.current } }).catch(() => {});
      }
    };

    const handlePlaying = () => {
      hasStartedPlayedRef.current = true;
      setIsLoading(false);
      setIsBuffering(false);
      setIsPlaying(true);
      setLoadingProgress(100);
      setShowLogoOverlay(false);
      setError(null);
      lockOrientation();
      if (isHost && channelRef.current && roomId) {
        channelRef.current.send({ type: 'broadcast', event: 'room_event', payload: { type: 'play', sender_id: clientIdRef.current } }).catch(() => {});
      }
    };

    const handleProgress = () => {
      if (video.buffered.length > 0 && video.duration > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        const progress = Math.min(100, Math.round((bufferedEnd / video.duration) * 100));
        setBufferedPercentage(progress);
        if (bufferedEnd > (video.currentTime + 0.3) && isLoading) {
          setIsLoading(false);
          setShowLogoOverlay(false);
        }
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('canplay', () => { setIsLoading(false); setLoadingProgress(100); if (!roomId || isHost) video.play().catch(() => {}); });
    video.addEventListener('seeked', () => setIsBuffering(false));
    video.addEventListener('waiting', () => setIsBuffering(true));
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('pause', handlePause);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('error', (e) => {
      if (video.error && video.error.code === 1) return;
      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++;
        setTimeout(() => video.load(), 2000);
      } else {
        setError({ message: "Erro ao carregar o vídeo.", type: 'network' });
      }
    });

    const cleanup = initPlayer();
    return () => {
      if (cleanup) cleanup();
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('pause', handlePause);
      if (hlsRef.current) hlsRef.current.destroy();
    };
  }, [activeSrc, sessionKey, movieId, initialTime, isHost, roomId, onProgress, onNextEpisode, onSelectRecommendation, recommendations, getQualityLabel, lockOrientation, isLoading]);

  return {
    videoRef,
    containerRef,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    showControls,
    isLocked,
    showUnlockOverlay,
    isFullscreen,
    playbackSpeed,
    showSpeedMenu,
    showSettingsMenu,
    showSubtitles,
    isLoading,
    isBuffering,
    loadingProgress,
    loadingMessageIndex,
    showStuckButton,
    error,
    bufferedPercentage,
    hoverTime,
    hoverPosition,
    showRecsOverlay,
    showTvShare,
    showLogoOverlay,
    showAutoNext,
    showRestartButton,
    autoNextCounter,
    isLandscape,
    qualityLevels,
    currentQuality,
    isAutoQuality,
    showQualityMenu,
    canCast,
    isCasting,
    qualityToast,
    autoRotate,
    objectFit,
    emotes,
    showEmotePicker,
    roomUsers,
    clientIdRef,
    recsDismissedRef,
    recsDismissedTimeRef,
    
    // Handlers
    setIsPlaying,
    setCurrentTime,
    setVolume,
    setIsMuted,
    setShowControls,
    setIsLocked,
    setShowUnlockOverlay,
    setIsFullscreen,
    setPlaybackSpeed,
    setShowSpeedMenu,
    setShowSettingsMenu,
    setShowSubtitles,
    setIsLoading,
    setIsBuffering,
    setLoadingProgress,
    setLoadingMessageIndex,
    setShowStuckButton,
    setError,
    setBufferedPercentage,
    setHoverTime,
    setHoverPosition,
    setShowRecsOverlay,
    setShowTvShare,
    setShowLogoOverlay,
    setShowAutoNext,
    setShowRestartButton,
    setAutoNextCounter,
    setIsLandscape,
    setQualityLevels,
    setCurrentQuality,
    setIsAutoQuality,
    setShowQualityMenu,
    setCanCast,
    setIsCasting,
    setQualityToast,
    setAutoRotate,
    setObjectFit,
    setEmotes,
    setShowEmotePicker,
    setRoomUsers,
    
    togglePlay,
    handleRestart,
    handleSeek,
    skip,
    toggleMute,
    handleVolumeChange,
    toggleFullscreen,
    togglePiP,
    sendEmote,
    handleQualityChange,
    toggleReparar,
    resetControlsTimer,
    lockOrientation,
    toggleRotation: () => {
      const newState = !autoRotate;
      setAutoRotate(newState);
      localStorage.setItem('autoRotate', JSON.stringify(newState));
    },
    toggleSubtitles: () => {
      if (videoRef.current && videoRef.current.textTracks.length > 0) {
        const newMode = !showSubtitles;
        setShowSubtitles(newMode);
        videoRef.current.textTracks[0].mode = newMode ? 'showing' : 'hidden';
      }
    },
    toggleCast: () => {
      if (videoRef.current && (videoRef.current as any).remote) {
        (videoRef.current as any).remote.prompt().catch((err: any) => {
          console.warn("Casting failed or dismissed:", err);
          setShowTvShare(true);
        });
      } else {
        setShowTvShare(true);
      }
    }
  };
}
