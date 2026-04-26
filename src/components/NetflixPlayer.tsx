import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Maximize, Minimize, X, ChevronLeft, Settings, Subtitles, FastForward, WifiOff, AlertCircle, Cast, Tv, Share2, Info, Smile, Users, PictureInPicture } from 'lucide-react';
import screenfull from 'screenfull';
import Hls from 'hls.js';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { io, Socket } from 'socket.io-client';

interface NetflixPlayerProps {
  src: string;
  title: string;
  movieId?: string | number;
  backdropUrl?: string; // Backdrop image (landscape)
  posterUrl?: string;   // Poster image (portrait)
  logoUrl?: string;     // Movie logo PNG
  onClose: () => void;
  onProgress?: (currentTime: number) => void;
  initialTime?: number;
  onNextEpisode?: () => void;
  hasNextEpisode?: boolean;
  recommendations?: any[];
  onSelectRecommendation?: (movie: any) => void;
  onSwitchPlayer?: () => void;
  subtitleUrl?: string;
  videoUrlOptions?: { id: string; label: string; url: string }[];
  isHost?: boolean;
  roomId?: string;
  profile?: any;
  maxQualityHeight?: number;
}

const NetflixPlayer: React.FC<NetflixPlayerProps> = ({ 
  src, 
  title, 
  movieId,
  backdropUrl,
  posterUrl,
  logoUrl,
  onClose, 
  onProgress, 
  initialTime = 0,
  onNextEpisode,
  hasNextEpisode,
  recommendations = [],
  onSelectRecommendation,
  onSwitchPlayer,
  subtitleUrl,
  videoUrlOptions = [],
  isHost = true,
  roomId = null,
  profile,
  maxQualityHeight
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  
  // Robust Extraction of nested URLs (KingX, Terabox, etc.)
  const parsedUrls = useMemo(() => {
    let vToPlay = src;
    let sToPlay = subtitleUrl;
    
    try {
      // Robust decoding for nested player URLs
      if (src.includes('video_url=')) {
        const hashPart = src.split('#')[1] || '';
        const queryPart = src.split('?')[1] || '';
        const combined = new URLSearchParams(hashPart + '&' + queryPart);
        
        const v = combined.get('video_url');
        const s = combined.get('subtitle_url');
        
        if (v) vToPlay = v;
        if (s) sToPlay = s;
      }
      
      // Second pass for double encoding (safe)
      try {
        if (vToPlay.includes('%')) vToPlay = decodeURIComponent(vToPlay);
        if (sToPlay && sToPlay.includes('%')) sToPlay = decodeURIComponent(sToPlay);
      } catch(e) {
        // Ignorar se falhar ao decodificar (pode já estar decodificado ou ter '%' legítimos)
      }
      
    } catch (e) {
      console.warn("URL Extraction failed", e);
    }
    
    return { video_url: vToPlay, subtitle_url: sToPlay };
  }, [src, subtitleUrl]);

  const [activeSrc, setActiveSrc] = useState(parsedUrls.video_url);
  const [activeSubtitleUrl, setActiveSubtitleUrl] = useState(parsedUrls.subtitle_url);
  const [sessionKey, setSessionKey] = useState(() => Date.now());
  
  // Independent Mode Detection
  const playerMode = useMemo(() => (initialTime > 0 ? 'resume' : 'fresh'), [initialTime]);

  const toggleReparar = () => {
    setSessionKey(Date.now());
    setShowStuckButton(false);
    setError(null);
    setIsLoading(true);
  };

  // Sincroniza activeSrc apenas se a prop src mudar externamente
  useEffect(() => {
    if (parsedUrls.video_url !== activeSrc) {
      setActiveSrc(parsedUrls.video_url);
      setActiveSubtitleUrl(parsedUrls.subtitle_url);
      setSessionKey(Date.now());
      setShowStuckButton(false);
    }
  }, [parsedUrls.video_url, parsedUrls.subtitle_url]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(false); // Hidden by default on entry
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [showStuckButton, setShowStuckButton] = useState(false);
  const [error, setError] = useState<{ message: string; type: 'network' | 'format' | 'unknown' } | null>(null);
  const [bufferedPercentage, setBufferedPercentage] = useState(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number>(0);
  const [showRecsOverlay, setShowRecsOverlay] = useState(false);
  const [showTvShare, setShowTvShare] = useState(false);
  const [showLogoOverlay, setShowLogoOverlay] = useState(false);
  const [showAutoNext, setShowAutoNext] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [qualityLevels, setQualityLevels] = useState<{ id: number; height: number; bitrate: number }[]>([]);
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
  const [emotes, setEmotes] = useState<{ id: string | number; emoji: string; x: number; y: number; profileName?: string }[]>([]);
  const [showEmotePicker, setShowEmotePicker] = useState(false);
  const [roomUsers, setRoomUsers] = useState<any[]>([]);
  const socketRef = useRef<Socket | null>(null);
  
  const EMOTES = ['🔥', '😂', '😱', '😍', '😢', '👏', '👎', '❓', '🍿', '😮', '💀', '🤡'];

  const isMedianApp = () => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent.toLowerCase();
    return ua.includes('median') || ua.includes('gonative');
  };

  const setMedianOrientation = (orientation: 'landscape' | 'portrait' | 'unlocked') => {
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
  };

  useEffect(() => {
    if (roomId) {
      const socket = io();
      socketRef.current = socket;

      const joinRoom = () => {
        socket.emit('join-room', { roomId, profile, movieId, isHost });
      };

      socket.on('connect', joinRoom);
      
      // If already connected, join immediately
      if (socket.connected) {
        joinRoom();
      }

      socket.on('room-update', (room) => {
        setRoomUsers(room.users);
      });

      socket.on('playback-update', ({ playing, currentTime }) => {
        if (!isHost && videoRef.current) {
          const diff = Math.abs(videoRef.current.currentTime - currentTime);
          if (diff > 2) {
            videoRef.current.currentTime = currentTime;
          }
          if (playing && videoRef.current.paused) {
            videoRef.current.play().catch(() => {});
          } else if (!playing && !videoRef.current.paused) {
            videoRef.current.pause();
          }
        }
      });

      socket.on('receive-emote', ({ emote, profileName, id }) => {
        const x = 20 + Math.random() * 60; // 20-80% horizontal
        const y = 20 + Math.random() * 60; // 20-80% vertical
        setEmotes(prev => [...prev, { id, emoji: emote, x, y, profileName }]);
        setTimeout(() => {
          setEmotes(prev => prev.filter(e => e.id !== id));
        }, 3000);
      });

      return () => {
        socket.disconnect();
      };
    }
  }, [roomId, isHost, movieId]);

  // Configuração inicial quando liga o componente
  useEffect(() => {
    if (videoRef.current) {
      // Ativa Picture-in-Picture automático para Chromium (ex: quando o app fica em segundo plano/muda de aba)
      try {
        if ('autoPictureInPicture' in videoRef.current) {
          (videoRef.current as any).autoPictureInPicture = true;
        }
        (videoRef.current as any).disablePictureInPicture = false;
      } catch (e) {
         console.warn("PiP feature check:", e);
      }
    }
  }, []);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (!videoRef.current) return;
      
      try {
        if (document.hidden) {
          // Quando a aba/app ficar oculta, tentar ativar o PiP
          // Apenas se o vídeo estiver tocando
          if (!videoRef.current.paused && document.pictureInPictureEnabled) {
            // Em navegadores que suportam autoPictureInPicture, isso já será tratado nativamente.
            // Aqui estamos apenas tentando forçar caso seja possível nativamente.
            // Ignoraremos o erro de permissão.
            if (!(videoRef.current as any).autoPictureInPicture) {
                await videoRef.current.requestPictureInPicture();
            }
          }
        } else {
          // Quando voltar para a aba, sair do PiP se estiver ativo
          // Para navegadores com autoPictureInPicture nativo, ele geralmente sai automaticamente,
          // Então verificaremos.
          if (document.pictureInPictureElement) {
             await document.exitPictureInPicture();
          }
        }
      } catch (error: any) {
        // Ignora erro de "user gesture required" (comportamento nativo bloqueado)
        if (error.name !== 'NotAllowedError') {
           console.warn('Erro ao processar Picture-in-Picture:', error);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const sendEmote = (emote: string) => {
    if (socketRef.current && roomId) {
      socketRef.current.emit('send-emote', { roomId, emote, profileName: profile?.name });
    }
    
    // Always show locally immediately for instant feedback
    const x = 20 + Math.random() * 60;
    const y = 20 + Math.random() * 60;
    const id = Math.random();
    setEmotes(prev => [...prev, { id, emoji: emote, x, y, profileName: profile?.name }]);
    setTimeout(() => {
      setEmotes(prev => prev.filter(e => e.id !== id));
    }, 3000);
    
    setShowEmotePicker(false);
    resetControlsTimer();
  };

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 2;
  const hasSeekedRef = useRef(false);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
      setShowSpeedMenu(false);
      setShowSettingsMenu(false);
      setShowQualityMenu(false);
      setShowEmotePicker(false);
    }, 5000); // 5s timeout as requested
  }, []);

  const handleMouseMove = () => {
    resetControlsTimer();
  };

  const toggleRotation = () => {
    const newState = !autoRotate;
    setAutoRotate(newState);
    localStorage.setItem('autoRotate', JSON.stringify(newState));
  };

  const loadingFacts = useMemo(() => {
    const facts = [
      `Conectando a ${title || 'este filme'}...`,
      "Ajustando configurações de servidor...",
      "Preparando a melhor resolução possível...",
      "Baixando os primeiros fragmentos de vídeo...",
      "Conectando ao cluster mais próximo...",
      "Sincronizando áudio e vídeo..."
    ];
    return facts.sort(() => Math.random() - 0.5); // Shuffle
  }, [title]);

  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setLoadingMessageIndex(prev => (prev + 1) % loadingFacts.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [isLoading, loadingFacts.length]);

  const hasStartedPlayedRef = useRef(false);

  useEffect(() => {
    let timer: any;
    if (!hasStartedPlayedRef.current && !isPlaying && loadingProgress === 100) {
      // (10 segundos a partir de chegar em 100% se ainda não estiver tocando)
      timer = setTimeout(() => {
        // Só mostra se ainda não tocou
        if (!hasStartedPlayedRef.current) {
          setShowStuckButton(true);
        }
      }, 10000);
    } else {
      setShowStuckButton(false);
    }
    return () => clearTimeout(timer);
  }, [isPlaying, loadingProgress]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Reset state
    setError(null);
    setIsLoading(true);
    setLoadingProgress(0);
    retryCountRef.current = 0;
    const initPlayer = () => {
      if (!video) return;

      // CLEANUP INDEPENDENTE
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      try {
        video.pause();
        video.currentTime = 0;
        video.removeAttribute('src');
        video.load();
      } catch (e) {}

      const videoToPlay = activeSrc;
      if (!videoToPlay) return;

      const lowerSrc = videoToPlay.toLowerCase();
      let startLoadTimer: NodeJS.Timeout;

      // CAMINHO 1: PLAYER DE INÍCIO (FRESH)
      const initFreshMode = () => {
        console.log("Player Independente: FRESH MODE");

        startLoadTimer = setTimeout(() => {
          if (!isMounted || !video) return;
          setLoadingProgress(25); // Progresso inicial maior para feedback
          if (lowerSrc.includes('.m3u8')) {
            if (Hls.isSupported()) {
              const hls = new Hls({
                enableWorker: true,
                capLevelToPlayerSize: true,
                startLevel: -1,
                autoStartLoad: true, // Auto start for faster loading
                maxBufferLength: 30, // Keep buffer small for faster initial load
                maxMaxBufferLength: 600,
                xhrSetup: (xhr) => { 
                  xhr.withCredentials = false;
                }
              });
              hls.attachMedia(video);
              hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(videoToPlay));
              hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
                let parsedLevels = data.levels.map((l, i) => ({ id: i, height: l.height, bitrate: l.bitrate })).sort((a, b) => b.height - a.height);
                if (maxQualityHeight) {
                  parsedLevels = parsedLevels.filter(l => l.height <= maxQualityHeight);
                  if (parsedLevels.length > 0) hls.autoLevelCapping = parsedLevels[0].id;
                }
                setQualityLevels(parsedLevels);
                setLoadingProgress(50);
                video.play().catch(() => {});
              });
              hls.on(Hls.Events.FRAG_BUFFERED, () => {
                setLoadingProgress(prev => Math.min(prev + 5, 90));
              });
              hls.on(Hls.Events.FRAG_LOADED, (event, data) => {
                if (data.frag.sn === 0 || isLoading) {
                  setLoadingProgress(100);
                  setIsLoading(false);
                  setShowLogoOverlay(false);
                }
              });
              hls.on(Hls.Events.ERROR, (event, data) => {
                console.warn("HLS Error:", data);
                if (data.fatal) {
                   if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                     setLoadingProgress(prev => Math.max(prev, 15));
                     hls.startLoad();
                   }
                   else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
                   else {
                     setError({ message: "Erro fatal de carregamento. Verifique sua rede.", type: 'network' });
                   }
                }
              });
              hlsRef.current = hls;
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
              // Safari Native HLS Fallback
              video.src = videoToPlay;
              video.play().catch(() => {});
            }
          } else {
            video.src = videoToPlay;
            video.play().catch(() => {});
          }
        }, 0);
      };

      // CAMINHO 2: PLAYER DE RETOMADA (RESUME)
      const initResumeMode = () => {
        console.log("Player Independente: RESUME MODE", initialTime);

        startLoadTimer = setTimeout(() => {
          if (!isMounted || !video) return;
          setLoadingProgress(25); // Progresso inicial imediato
          if (lowerSrc.includes('.m3u8')) {
            if (Hls.isSupported()) {
              const hls = new Hls({
                enableWorker: true,
                capLevelToPlayerSize: true,
                startLevel: -1,
                autoStartLoad: true, // Auto start for faster loading
                maxBufferLength: 30, // Keep buffer small for faster initial load
                maxMaxBufferLength: 600,
                xhrSetup: (xhr) => { 
                  xhr.withCredentials = false;
                }
              });
              hls.attachMedia(video);
              hls.on(Hls.Events.MEDIA_ATTACHED, () => {
                video.currentTime = initialTime;
                hls.loadSource(videoToPlay);
              });
              hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
                let parsedLevels = data.levels.map((l, i) => ({ id: i, height: l.height, bitrate: l.bitrate })).sort((a, b) => b.height - a.height);
                if (maxQualityHeight) {
                  parsedLevels = parsedLevels.filter(l => l.height <= maxQualityHeight);
                  if (parsedLevels.length > 0) hls.autoLevelCapping = parsedLevels[0].id;
                }
                setQualityLevels(parsedLevels);
                setLoadingProgress(50);
                video.play().catch(() => {});
              });
              hls.on(Hls.Events.FRAG_BUFFERED, () => {
                setLoadingProgress(prev => Math.min(prev + 5, 90));
              });
              hls.on(Hls.Events.FRAG_LOADED, () => {
                setLoadingProgress(100);
                setIsLoading(false);
                setShowLogoOverlay(false);
              });
              hls.on(Hls.Events.ERROR, (event, data) => {
                console.warn("HLS Error:", data);
                if (data.fatal) {
                   if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                      setLoadingProgress(prev => Math.max(prev, 15));
                      hls.startLoad();
                   }
                   else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
                }
              });
              hlsRef.current = hls;
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = videoToPlay;
                video.addEventListener('loadedmetadata', () => {
                    video.currentTime = initialTime;
                    video.play().catch(() => {});
                }, { once: true });
            }
          } else {
            video.src = videoToPlay;
            video.addEventListener('loadedmetadata', () => {
                video.currentTime = initialTime;
                video.play().catch(() => {});
            }, { once: true });
          }
        }, 0);
      };

      // EXECUÇÃO INDEPENDENTE
      if (playerMode === 'resume') {
        initResumeMode();
      } else {
        initFreshMode();
      }

      return () => {
        clearTimeout(startLoadTimer);
      };
    };

    // Adicionar listeners ANTES de carregar o vídeo
    const handleTimeUpdate = () => {
      const time = video.currentTime;
      setCurrentTime(time);
      if (onProgress) onProgress(time);

      if ((time > 0.1 || video.currentTime > 0) && isLoading) {
        setIsLoading(false);
        setLoadingProgress(100);
        setShowLogoOverlay(false);
      }

      if (hasNextEpisode && video.duration > 0) {
        if (video.duration - time <= 30) setShowAutoNext(true);
        else setShowAutoNext(false);
      }

      if (video.duration > 0 && video.duration - time <= 10) {
        setShowRecsOverlay(true);
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      if (!hlsRef.current) {
        setCurrentQuality(getQualityLabel(video.videoHeight));
      }
    };

    const handleCanPlay = () => {
      setIsLoading(false);
      setLoadingProgress(100);
      
      // Handle "Continue Watching" seek - ONLY for non-HLS formats (HLS uses startPosition)
      if (initialTime > 0 && !hasSeekedRef.current && !hlsRef.current) {
        hasSeekedRef.current = true;
        
        const applySeek = () => {
          if (!video) return;
          try {
            console.log("NetflixPlayer: Efetuando seek de retomada para:", initialTime);
            video.currentTime = initialTime;
          } catch (e) {
            console.warn("Seek attempt failed", e);
          }
        };

        // Múltiplas tentativas de seek para garantir que o navegador aceite a posição
        applySeek();
        setTimeout(applySeek, 100);
        setTimeout(applySeek, 300);
        setTimeout(applySeek, 600);
      }
      
      if (video.paused) {
        video.play().catch(err => {
          console.warn("Autoplay blocked:", err);
          setIsLoading(false);
          setIsPlaying(false);
        });
      }
    };

    const handlePause = () => {
      setIsPlaying(false);
      if (isHost && socketRef.current && roomId) {
        socketRef.current.emit('sync-playback', { roomId, playing: false, currentTime: video.currentTime });
      }
    };

    const handleWaiting = () => {
      // Evita mostrar loading se já houver buffer suficiente
      if (video.buffered.length > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        if (bufferedEnd > video.currentTime + 1.5) return;
      }
      setIsLoading(true);
      setLoadingProgress(prev => prev > 90 ? 98 : prev);
    };

    const handlePlaying = () => {
      hasStartedPlayedRef.current = true;
      setIsLoading(false);
      setIsPlaying(true);
      setLoadingProgress(100);
      setShowStuckButton(false);
      setShowLogoOverlay(false);
      setError(null);
      retryCountRef.current = 0;

      if (isHost && socketRef.current && roomId && video) {
        socketRef.current.emit('sync-playback', { roomId, playing: true, currentTime: video.currentTime });
      }
      
      const lock = async () => {
        try {
          if (screen.orientation && (screen.orientation as any).lock) {
            await (screen.orientation as any).lock('landscape').catch(() => {});
            setIsLandscape(true);
          }
          setMedianOrientation('landscape');
        } catch (e) {}
      };
      lock();
    };

    const handleProgress = () => {
      if (video.buffered.length > 0 && video.duration > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        const progress = Math.min(100, Math.round((bufferedEnd / video.duration) * 100));
        setBufferedPercentage(progress);
        
        if (!isLoading) {
           setLoadingProgress(100);
        } else {
           setLoadingProgress(prev => Math.max(prev, progress));
        }
        
        // Se já temos qualquer buffer (0.3s), libera o player instantaneamente
        if (bufferedEnd > (video.currentTime + 0.3) && isLoading) {
           setIsLoading(false);
           setShowLogoOverlay(false);
        }
      }
    };

    const handleStalled = () => {
      if (video.paused && isPlaying) {
        video.play().catch(() => {});
      }
    };

    const handleError = (e: any) => {
      // Ignora evento abort (1), que acontece ao desmontar o player ou mudar o src
      if (video.error && video.error.code === 1) return;

      // Se HLS.js estiver ativo, ele possui seu próprio tratador de erros ultra-robusto (Hls.Events.ERROR).
      // Evitamos conflito com erros nativos prematuros do HTMLMediaElement.
      if (activeSrc && activeSrc.toLowerCase().includes('.m3u8') && Hls.isSupported() && hlsRef.current) {
        return; 
      }

      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++;
        setTimeout(() => {
          if (video) {
            video.load();
            video.play().catch(() => {});
          }
        }, 2000);
        return;
      }

      if (!error) {
        const lowerSrc = (activeSrc || '').toLowerCase();
        let errorMsg = "Não foi possível carregar o vídeo.";
        
        if (lowerSrc.includes('drive.google.com')) {
          errorMsg = "O Google Drive bloqueou o acesso direto a este vídeo. Tente usar o 'Player Padrão' ou verifique as configurações.";
        } else {
          errorMsg = "Erro ao carregar o vídeo. O formato pode ser incompatível ou o link expirou.";
        }

        setError({ 
          message: errorMsg, 
          type: lowerSrc.includes('drive.google.com') ? 'format' : 'network' 
        });
      }
      setIsLoading(false);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('pause', handlePause);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('stalled', handleStalled);
    video.addEventListener('error', handleError);

    let isMounted = true;
    const cleanupInit = initPlayer();

    return () => {
      isMounted = false;
      if (cleanupInit) cleanupInit();
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('stalled', handleStalled);
      video.removeEventListener('error', handleError);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [activeSrc, sessionKey, movieId, playerMode]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    
    // Auto-rotação para paisagem em dispositivos móveis
    const lockOrientation = async () => {
      if (!autoRotate) return;
      try {
        if (screen.orientation && (screen.orientation as any).lock) {
          await (screen.orientation as any).lock('landscape').catch(() => {});
        }
      } catch (e) {
        console.warn("Orientation lock not supported", e);
      }
      
      setMedianOrientation('landscape');
    };
    lockOrientation();

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (screen.orientation && screen.orientation.unlock) {
        screen.orientation.unlock();
        // Fallback: try to lock back to portrait if it was landscape
        try {
          if ((screen.orientation as any).lock) {
            (screen.orientation as any).lock('portrait').catch(() => {});
          }
        } catch (e) {}
      }
      
      setMedianOrientation('unlocked');
    };
  }, [autoRotate]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading && loadingProgress >= 20 && loadingProgress < 90) {
      interval = setInterval(() => {
        setLoadingProgress(prev => {
          if (prev < 40) return prev + 2;
          if (prev < 80) return prev + 1;
          return prev;
        });
      }, 800) as any;
    }
    return () => clearInterval(interval);
  }, [isLoading, loadingProgress]);

  useEffect(() => {
    let safetyTimeout: NodeJS.Timeout;

    if (isLoading) {
      // Safety timeout ajustado para 12s: se o manifesto HLS falhar, tentamos o modo nativo
      safetyTimeout = setTimeout(() => {
        if (isLoading && loadingProgress <= 30) {
          console.log("Watchdog: HLS lento demais. Tentando fallback nativo...");
          if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
          }
          if (videoRef.current) {
            videoRef.current.src = activeSrc;
            videoRef.current.play().catch(() => {});
          }
        } else if (isLoading && isPlaying) {
          setIsLoading(false);
          setLoadingProgress(100);
        }
      }, 12000);
    }

    return () => {
      if (safetyTimeout) clearTimeout(safetyTimeout);
    };
  }, [isLoading, isPlaying]);

  useEffect(() => {
    if (!videoRef.current || !movieId) return;
    
    const saveProgress = () => {
      if (videoRef.current) {
        const time = videoRef.current.currentTime;
        if (time > 10 && time < (videoRef.current.duration - 30)) {
           localStorage.setItem(`netplay_progress_${movieId}`, time.toString());
        } else if (time >= (videoRef.current.duration - 30)) {
           localStorage.removeItem(`netplay_progress_${movieId}`);
        }
      }
    };

    const interval = setInterval(saveProgress, 10000); // Save every 10s
    return () => {
      clearInterval(interval);
      saveProgress();
    };
  }, [movieId]);

  useEffect(() => {
    let timer: any;
    if (isLoading) {
      timer = setTimeout(() => {
        setShowStuckButton(true);
      }, 15000); // 15s para mostrar botão de "Reparar"
    }
    return () => clearTimeout(timer);
  }, [isLoading]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (video) {
      if (!isHost && roomId) return; // Guests can't control playback

      if (video.paused) {
        video.play().catch(() => {});
        if (isHost && socketRef.current && roomId) {
          socketRef.current.emit('sync-playback', { roomId, playing: true, currentTime: video.currentTime });
        }
        
        // The video.play() will trigger handlePlaying which now handles the orientation lock.
      } else {
        video.pause();
        if (isHost && socketRef.current && roomId) {
          socketRef.current.emit('sync-playback', { roomId, playing: false, currentTime: video.currentTime });
        }
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isHost && roomId) return; // Propagate seek only for hosts
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
      if (isHost && socketRef.current && roomId) {
        socketRef.current.emit('sync-playback', { roomId, playing: isPlaying, currentTime: time });
      }
    }
  };

  const skip = (amount: number) => {
    if (!isHost && roomId) return;
    if (videoRef.current) {
      videoRef.current.currentTime += amount;
      if (isHost && socketRef.current && roomId) {
        socketRef.current.emit('sync-playback', { roomId, playing: isPlaying, currentTime: videoRef.current.currentTime });
      }
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const togglePiP = async () => {
    try {
      const video = videoRef.current as any;
      if (!video) return;

      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      } else if (video.webkitSupportsPresentationMode && typeof video.webkitSetPresentationMode === "function") {
        // Fallback para Safari (iOS/Mac)
        const currentMode = video.webkitPresentationMode;
        const newMode = currentMode === "picture-in-picture" ? "inline" : "picture-in-picture";
        video.webkitSetPresentationMode(newMode);
      }
    } catch (error) {
      console.error("PiP error:", error);
    }
  };

  const toggleFullscreen = () => {
    if (containerRef.current && screenfull.isEnabled) {
      screenfull.toggle(containerRef.current);
      
      // Tentar forçar landscape ao entrar em fullscreen
      if (!screenfull.isFullscreen && screen.orientation && (screen.orientation as any).lock) {
        (screen.orientation as any).lock('landscape').catch(() => {});
      }
    }
    
    // Median.co WebView fallback fullscreen
    try {
      if (isMedianApp()) {
        if (!isFullscreen) {
           window.location.href = 'median://screen/fullScreen';
        } else {
           window.location.href = 'median://screen/normalScreen';
        }
      }
    } catch(e) {}
  };

  const toggleSubtitles = () => {
    if (videoRef.current && videoRef.current.textTracks.length > 0) {
      const newMode = !showSubtitles;
      setShowSubtitles(newMode);
      videoRef.current.textTracks[0].mode = newMode ? 'showing' : 'hidden';
    }
  };

  const toggleCast = () => {
    if (videoRef.current && (videoRef.current as any).remote) {
      (videoRef.current as any).remote.prompt().catch((err: any) => {
        console.warn("Casting failed or dismissed:", err);
        // If native prompt fails, show our custom sharing UI
        setShowTvShare(true);
      });
    } else {
      setShowTvShare(true);
    }
  };

  const getQualityLabel = (height: number) => {
    if (height >= 2160) return '4K';
    if (height >= 1440) return '2K';
    if (height >= 1080) return 'FULL HD';
    if (height >= 720) return 'HD';
    return 'SD';
  };

  const getFullQualityName = (height: number) => {
    if (height >= 2160) return 'ULTRA HD 4K';
    if (height >= 1440) return 'QUAD HD 2K';
    if (height >= 1080) return 'FULL HD 1080p';
    if (height >= 720) return 'HD 720p';
    if (height >= 480) return 'PADRÃO 480p';
    if (height >= 360) return 'ECONOMIA 360p';
    return 'BÁSICO';
  };

  const getQualityColor = (height: number) => {
    if (height >= 2160) return 'from-amber-400 to-amber-600';
    if (height >= 1080) return 'from-red-500 to-red-700';
    if (height >= 720) return 'from-blue-500 to-blue-700';
    return 'from-gray-500 to-gray-700';
  };

  const handleQualityChange = (levelId: number | string) => {
    let label = 'Auto';
    if (levelId === 'auto') {
      if (hlsRef.current) hlsRef.current.currentLevel = -1;
      setIsAutoQuality(true);
      setCurrentQuality('Auto');
      setQualityToast('Qualidade: Automático');
    } else {
      setIsAutoQuality(false);
      
      // Check if it's a fixed URL option
      const fixedOption = videoUrlOptions.find(o => o.id === levelId);
      if (fixedOption) {
        setActiveSrc(fixedOption.url);
        label = fixedOption.id.toUpperCase();
        setCurrentQuality(label);
        setQualityToast(`Qualidade: ${fixedOption.label}`);
      } else {
        // HLS Level
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
  };

  const formatTime = (time: number) => {
    const h = Math.floor(time / 3600);
    const m = Math.floor((time % 3600) / 60);
    const s = Math.floor(time % 60);
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleContainerClick = (e: React.MouseEvent | React.TouchEvent) => {
    // Only toggle if clicking background or the video element
    const target = e.target as HTMLElement;
    if (target === e.currentTarget || target.tagName === 'VIDEO' || target.id === 'player-overlay') {
      if (showControls) {
        setShowControls(false);
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      } else {
        handleMouseMove(); 
      }
    }
  };

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 bg-black z-[3000] flex items-center justify-center select-none group overflow-hidden"
      onMouseMove={handleMouseMove}
      onClick={handleContainerClick}
      onTouchStart={handleMouseMove}
    >
      {/* Backdrop de fundo enquanto carrega ou como papel de parede */}
      <AnimatePresence>
        {(isLoading || showLogoOverlay) && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[5]"
          >
            {backdropUrl && (
              <img 
                src={backdropUrl.startsWith('http') ? backdropUrl : `https://image.tmdb.org/t/p/original/${backdropUrl}`}
                alt=""
                className={`w-full h-full object-cover transition-opacity duration-1000 ${logoUrl ? 'opacity-40' : 'opacity-90'}`}
                referrerPolicy="no-referrer"
              />
            )}
            {posterUrl && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-12 md:p-20">
                 <motion.img 
                   src={posterUrl.startsWith('http') ? posterUrl : `https://image.tmdb.org/t/p/w780/${posterUrl}`}
                   alt=""
                   className={`h-[70%] md:h-[80%] rounded-2xl shadow-[0_0_60px_rgba(0,0,0,0.8)] border border-white/10 ${logoUrl ? 'opacity-50' : 'opacity-100'}`}
                   initial={{ scale: 0.9, y: 20 }}
                   animate={{ scale: 1, y: 0 }}
                   referrerPolicy="no-referrer"
                 />
              </div>
            )}
            <div className={`absolute inset-0 bg-gradient-to-t ${logoUrl ? 'from-black via-black/40 to-black/60' : 'from-black/40 via-transparent to-black/40'}`} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlay de Recomendações (Menor e menos intrusivo) */}
      {showRecsOverlay && recommendations.length > 0 && !isLoading && (
        <div className="absolute bottom-24 left-6 right-6 z-[315] bg-black/60 backdrop-blur-xl flex flex-col p-4 rounded-3xl border border-white/10 animate-in slide-in-from-bottom duration-500 max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-white text-lg font-black uppercase tracking-tighter italic">Recomendados</h2>
            <button 
              onClick={() => setShowRecsOverlay(false)}
              className="text-gray-400 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {recommendations.slice(0, 8).map((rec) => (
              <div 
                key={rec.id}
                onClick={() => onSelectRecommendation?.(rec)}
                className="relative flex-none w-24 md:w-32 aspect-[2/3] rounded-xl overflow-hidden cursor-pointer group hover:scale-105 transition-all duration-300 border border-white/10"
              >
                <img 
                  src={`https://image.tmdb.org/t/p/w342${rec.poster_path}`}
                  alt={rec.title}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Logo Overlay Inicial */}
      <AnimatePresence>
        {qualityToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-24 left-1/2 -translate-x-1/2 z-[400] bg-red-600 text-white px-6 py-2 rounded-full font-black text-[10px] uppercase tracking-widest shadow-[0_10px_30px_rgba(220,38,38,0.5)] italic"
          >
            {qualityToast}
          </motion.div>
        )}
        {showLogoOverlay && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[350] bg-black flex flex-col items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="flex items-center gap-6"
            >
              <div className="w-20 h-20 md:w-28 md:h-28 bg-red-600 rounded-2xl flex items-center justify-center shadow-[0_0_50px_rgba(220,38,38,0.4)]">
                <Play size={48} fill="white" className="text-white ml-2" />
              </div>
              <h1 className="text-4xl md:text-7xl font-black text-white uppercase tracking-tighter italic font-display leading-none">
                Net<span className="text-red-600">play</span>
              </h1>
            </motion.div>
            <div className="mt-8 flex gap-2">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                  className="w-2 h-2 bg-red-600 rounded-full"
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Botão Próximo Episódio Automático */}
      {showAutoNext && hasNextEpisode && (
        <div className="absolute bottom-32 right-12 z-[310] animate-in slide-in-from-right duration-500">
          <button 
            onClick={onNextEpisode}
            className="group relative flex items-center gap-4 bg-white text-black p-1 pr-6 rounded-full font-black hover:scale-105 transition-all shadow-2xl"
          >
            <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center text-white">
              <FastForward size={24} fill="white" />
            </div>
            <div className="text-left">
              <p className="text-[10px] uppercase tracking-widest text-gray-500">Próximo Episódio em breve</p>
              <p className="text-sm">Assistir Agora</p>
            </div>
          </button>
        </div>
      )}

      <video
        key={`${activeSrc}-${sessionKey}-${playerMode}`}
        ref={videoRef}
        className="w-full h-full object-contain"
        autoPlay
        playsInline
        crossOrigin="anonymous"
        webkit-playsinline="true"
        x-webkit-airplay="allow"
        disablePictureInPicture={false}
        referrerPolicy="no-referrer"
        onClick={handleContainerClick}
        onDoubleClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          if (x < rect.width / 2) skip(-10);
          else skip(10);
        }}
      >
        {(subtitleUrl || activeSubtitleUrl) && (
          <track 
            kind="subtitles" 
            src={subtitleUrl || activeSubtitleUrl} 
            srcLang="pt" 
            label="Português" 
            default 
          />
        )}
      </video>

      {/* Emotes Overlay Layer */}
      <div className="absolute inset-0 z-[250] pointer-events-none overflow-hidden">
        <AnimatePresence mode="popLayout">
          {emotes.map((emote) => (
            <motion.div
              key={emote.id}
              initial={{ scale: 0, y: 100, opacity: 0, rotate: -20 }}
              animate={{ 
                scale: [1, 1.2, 1], 
                y: -100, 
                opacity: [0, 1, 1, 0],
                rotate: [0, 10, -10, 0]
              }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ duration: 4, ease: "linear" }}
              style={{
                position: 'absolute',
                left: `${emote.x}%`,
                top: `${emote.y}%`,
                transform: 'translate(-50%, -50%)',
              }}
              className="flex flex-col items-center gap-2"
            >
              <div className="text-5xl md:text-7xl filter drop-shadow-[0_15px_30px_rgba(0,0,0,0.8)] select-none">
                {emote.emoji}
              </div>
              {emote.profileName && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="px-4 py-1.5 bg-black/60 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl"
                >
                  <span className="text-[9px] md:text-[11px] font-black text-white uppercase tracking-[0.2em] italic whitespace-nowrap">
                    {emote.profileName}
                  </span>
                </motion.div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Overlay de Carregamento Circular (1-100%) */}
      {isLoading && !error && (
        <div className="absolute inset-0 z-[310] flex flex-col items-center justify-center p-4">
          <div className="absolute inset-0 overflow-hidden">
             {backdropUrl && (
               <img 
                 src={backdropUrl.startsWith('http') ? backdropUrl : `https://image.tmdb.org/t/p/original/${backdropUrl}`}
                 alt=""
                 className="w-full h-full object-cover opacity-30 scale-105"
                 referrerPolicy="no-referrer"
               />
             )}
             <div className="absolute inset-0 bg-[#080808]/80 backdrop-blur-md" />
             <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-transparent to-[#080808]" />
          </div>

          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative z-10 flex flex-col items-center max-w-5xl text-center"
          >
            <div className="flex flex-row items-center justify-center gap-4 md:gap-8 mb-10 px-6 py-5 bg-white/5 rounded-[2rem] border border-white/10 shadow-2xl backdrop-blur-3xl transform scale-90 md:scale-100">
               <div className="flex items-center gap-3 shrink-0">
                  <div className="w-8 h-8 md:w-16 md:h-16 bg-red-600 rounded-lg md:rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(220,38,38,0.4)]">
                     <Play size={16} fill="white" className="text-white ml-0.5 md:ml-1 md:w-8 md:h-8" />
                  </div>
                  <div className="text-left">
                     <h2 className="text-lg md:text-3xl font-black text-white uppercase tracking-tighter italic leading-none">Net<span className="text-red-600">play</span></h2>
                     <p className="text-[6px] md:text-[8px] text-gray-500 font-bold uppercase tracking-[0.2em]">Original App</p>
                  </div>
               </div>

               <div className="w-px h-8 bg-white/10" />

               {logoUrl ? (
                  <motion.img 
                    src={logoUrl.startsWith('http') ? logoUrl : `https://image.tmdb.org/t/p/w500/${logoUrl}`}
                    alt={title}
                    className="h-8 md:h-12 max-w-[120px] md:max-w-[200px] object-contain filter drop-shadow-2xl"
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    referrerPolicy="no-referrer"
                  />
               ) : (
                  <h1 className="text-lg md:text-2xl font-black text-white uppercase tracking-tighter italic font-display drop-shadow-2xl truncate max-w-[150px] md:max-w-xs">
                    {title}
                  </h1>
               )}
            </div>

            <div className="relative w-20 h-20 md:w-24 md:h-24 mb-6">
              <svg className="w-full h-full -rotate-90">
                <circle
                  cx="50%"
                  cy="50%"
                  r="45%"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="text-white/10"
                />
                <motion.circle
                  cx="50%"
                  cy="50%"
                  r="45%"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="text-red-600 transition-all duration-300"
                  strokeDasharray="283"
                  animate={{ strokeDashoffset: 283 - (283 * loadingProgress) / 100 }}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl md:text-2xl font-black text-white italic">{loadingProgress}%</span>
              </div>
            </div>
            
            <motion.p 
              key={loadingMessageIndex}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="text-white/80 font-black tracking-widest uppercase text-[10px] md:text-[12px] italic mt-4 max-w-lg leading-relaxed h-12 flex items-center justify-center text-balance"
            >
              {loadingFacts[loadingMessageIndex]}
            </motion.p>

            {showStuckButton && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-8 flex flex-col items-center gap-4"
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleReparar();
                  }}
                  className="bg-white text-black px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[11px] italic shadow-2xl hover:scale-105 transition-all flex items-center gap-2"
                >
                  <RotateCw size={18} /> Reparar Conexão
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsLoading(false);
                    setLoadingProgress(100);
                    setShowLogoOverlay(false);
                    if (videoRef.current) videoRef.current.play().catch(() => {});
                    // play() will trigger handlePlaying which locks orientation.
                  }}
                  className="bg-red-600/20 text-red-500 border border-red-600/30 px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] italic hover:bg-red-600 hover:text-white transition-all"
                >
                  Iniciar Manualmente
                </button>
                {onSwitchPlayer && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSwitchPlayer();
                    }}
                    className="mt-2 bg-blue-600/20 text-blue-500 border border-blue-600/30 px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] italic hover:bg-blue-600 hover:text-white transition-all w-full flex justify-center items-center gap-2"
                  >
                    <span>Abrir Player Nativo (Rápido)</span>
                  </button>
                )}
                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest italic animate-pulse mt-2">Servidor Instável? Tente o Player Nativo</p>
              </motion.div>
            )}
          </motion.div>
        </div>
      )}

      {/* Mensagem de Erro */}
      {error && (
        <div className="absolute inset-0 z-[320] flex flex-col items-center justify-center bg-[#080808] p-6 text-center">
          <div className="relative mb-8">
            <div className="w-24 h-24 bg-red-600/10 rounded-full flex items-center justify-center border border-red-600/30">
              {error.type === 'network' ? <WifiOff size={48} className="text-red-600" /> : <AlertCircle size={48} className="text-red-600" />}
            </div>
            <motion.div 
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute -top-2 -right-2 w-8 h-8 bg-red-600 rounded-full flex items-center justify-center border-4 border-[#080808]"
            >
              <X size={16} className="text-white" />
            </motion.div>
          </div>
          
          <h3 className="text-3xl font-black text-white mb-4 uppercase tracking-tighter italic font-display">
            {error.type === 'network' ? 'Problema de Conexão' : 'Erro de Carregamento'}
          </h3>
          <p className="text-gray-400 mb-10 max-w-md leading-relaxed font-medium">
            {error.message}
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm">
            <button 
              onClick={() => window.location.reload()}
              className="flex-1 bg-white text-black px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-gray-200 transition-all shadow-xl hover:scale-105 active:scale-95"
            >
              Recarregar
            </button>
            <button 
              onClick={onSwitchPlayer || onClose}
              className="flex-1 bg-red-600 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-red-700 transition-all shadow-[0_10px_30px_rgba(220,38,38,0.3)] hover:scale-105 active:scale-95"
            >
              Tentar Outro Player
            </button>
          </div>
        </div>
      )}

      {/* Overlay de Controles */}
      <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/60 transition-opacity duration-500 flex flex-col justify-between p-6 z-[305] ${showControls && !isLoading ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        
        {/* Topo */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <button onClick={onClose} className="text-white hover:scale-110 transition-transform">
              <ChevronLeft size={40} strokeWidth={3} />
            </button>
            <div className="flex flex-col">
              <h1 className="text-white text-sm md:text-2xl font-black uppercase italic tracking-tighter drop-shadow-md truncate max-w-[150px] md:max-w-xs">{title}</h1>
              {roomId && (
                <div className="flex items-center gap-2 mt-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
                  <span className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] text-red-600 italic">Sala de Estreia Ativa</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4 md:gap-6">
            {onSwitchPlayer && (
              <button 
                onClick={onSwitchPlayer}
                className="hidden md:flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-full backdrop-blur-md text-xs font-bold transition-all border border-white/20"
              >
                <span>Player Nativo</span>
              </button>
            )}
            {roomId && (
               <div className="hidden md:flex items-center gap-3 bg-white/5 border border-white/5 px-4 py-2 rounded-full">
                  <Users size={16} className="text-red-600" />
                  <div className="flex -space-x-2">
                    {roomUsers.map((u, i) => (
                      <div key={i} className="w-6 h-6 rounded-full border border-black bg-gray-800 overflow-hidden" title={u.profileName}>
                        {u.avatar ? <img src={u.avatar} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[8px]">{u.profileName[0]}</div>}
                      </div>
                    ))}
                  </div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{roomUsers.length} Online</span>
               </div>
            )}
            <button 
              onClick={toggleReparar} 
              className="text-white hover:text-gray-300 flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest"
            >
              <RotateCw size={14} /> Reparar
            </button>
            <button 
              onClick={toggleSubtitles}
              className={`transition-colors ${showSubtitles ? 'text-red-600' : 'text-white hover:text-gray-300'}`}
              title="Legendas"
            >
              <Subtitles size={28} />
            </button>
            <button 
              onClick={toggleRotation}
              className={`transition-colors ${isLandscape ? 'text-red-600' : 'text-white hover:text-gray-300'}`}
              title="Rotacionar Tela"
            >
              <RotateCw size={28} />
            </button>
            <button 
              onClick={toggleCast}
              className={`transition-colors ${isCasting ? 'text-red-600 animate-pulse' : 'text-white hover:text-gray-300'}`}
              title="Transmitir para TV"
            >
              <Cast size={28} />
            </button>
            <button 
              onClick={() => setShowSettingsMenu(!showSettingsMenu)}
              className={`transition-colors ${showSettingsMenu ? 'text-red-600' : 'text-white hover:text-gray-300'}`}
              title="Configurações"
            >
              <Settings size={28} />
            </button>
          </div>
        </div>

        {/* Menu de Configurações */}
        <AnimatePresence>
          {showSettingsMenu && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="absolute top-24 right-6 bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6 z-[320] w-64 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-white font-black italic uppercase tracking-tighter">Configurações</h3>
                <button onClick={() => setShowSettingsMenu(false)} className="text-gray-500 hover:text-white">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest font-black mb-3">Preferências</p>
                  <button 
                    onClick={() => setAutoRotate(!autoRotate)}
                    className="w-full py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-all border border-white/5 flex items-center justify-between px-4"
                  >
                    <span>Rotação Automática</span>
                    <div className={`w-10 h-5 rounded-full transition-colors relative ${autoRotate ? 'bg-red-600' : 'bg-gray-700'}`}>
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${autoRotate ? 'right-1' : 'left-1'}`} />
                    </div>
                  </button>
                </div>

                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest font-black mb-3">Velocidade</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[0.5, 1, 1.5, 2].map(speed => (
                      <button
                        key={speed}
                        onClick={() => {
                          setPlaybackSpeed(speed);
                          if (videoRef.current) videoRef.current.playbackRate = speed;
                        }}
                        className={`py-2 rounded-lg text-xs font-bold transition-all ${playbackSpeed === speed ? 'bg-red-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest font-black mb-3">Qualidade</p>
                  <button 
                    onClick={() => setShowQualityMenu(!showQualityMenu)}
                    className="w-full py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-all border border-white/5 flex items-center justify-between px-4"
                  >
                    <span>{isAutoQuality ? 'Automático' : currentQuality}</span>
                    <Settings size={14} className="text-red-600" />
                  </button>
                  
                  <AnimatePresence>
                    {showQualityMenu && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-2 space-y-1 overflow-hidden"
                      >
                        <button
                          onClick={() => handleQualityChange('auto')}
                          className={`w-full py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${isAutoQuality ? 'bg-red-600 text-white shadow-lg' : 'text-gray-400 hover:bg-white/5'}`}
                        >
                          <div className="flex items-center gap-2">
                             <div className={`w-2 h-2 rounded-full ${isAutoQuality ? 'bg-white animate-pulse' : 'bg-gray-600'}`} />
                             <span>Automático</span>
                          </div>
                          {isAutoQuality && <span className="text-[10px] font-black italic">{currentQuality}</span>}
                        </button>
                        {videoUrlOptions.map(option => (
                          <button
                            key={option.id}
                            onClick={() => handleQualityChange(option.id)}
                            className={`w-full py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${activeSrc === option.url ? 'bg-white/10 text-white shadow-lg' : 'text-gray-400 hover:bg-white/5'}`}
                          >
                             <div className="flex items-center gap-2">
                               <div className="w-6 h-4 flex items-center justify-center rounded-[2px] text-[8px] font-black bg-gradient-to-br from-gray-500 to-gray-600 text-white shadow-sm uppercase">
                                 {option.id}
                               </div>
                               <span>{option.label}</span>
                             </div>
                          </button>
                        ))}
                        {qualityLevels.map(level => (
                          <button
                            key={level.id}
                            onClick={() => handleQualityChange(level.id)}
                            className={`w-full py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${!isAutoQuality && hlsRef.current?.currentLevel === level.id ? 'bg-white/10 text-white shadow-[inset_0_0_10px_rgba(255,255,255,0.05)]' : 'text-gray-400 hover:bg-white/5'}`}
                          >
                             <div className="flex items-center gap-2">
                               <div className={`w-6 h-4 flex items-center justify-center rounded-[2px] text-[8px] font-black bg-gradient-to-br ${getQualityColor(level.height)} text-white shadow-sm`}>
                                 {getQualityLabel(level.height)}
                               </div>
                               <span>{getFullQualityName(level.height)}</span>
                             </div>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest font-black mb-3">Player</p>
                  <button 
                    onClick={onSwitchPlayer}
                    className="w-full py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-all border border-white/5 flex items-center justify-center gap-2"
                  >
                    <span>Trocar para Player Nativo</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      {/* Centro (Play/Skip/Emotes) */}
      <div className="flex items-center justify-center gap-6 md:gap-20">
        {(!roomId || isHost) && (
          <button onClick={() => skip(-10)} className="text-white hover:scale-110 transition-transform flex flex-col items-center">
            <RotateCcw size={32} className="md:w-12 md:h-12" />
            <span className="text-[10px] md:text-xs font-bold mt-1">10</span>
          </button>
        )}
        
        {/* Emote Picker Trigger (For Everyone) */}
        <div className="relative group">
          <button
            onClick={() => {
              setShowEmotePicker(!showEmotePicker);
              resetControlsTimer();
            }}
            className={`p-3 md:p-5 rounded-full backdrop-blur-xl border border-white/20 transition-all active:scale-90 shadow-2xl ${showEmotePicker ? 'bg-red-600 text-white border-red-500' : 'bg-white/10 text-white hover:bg-white/20'}`}
          >
            <Smile size={28} className="md:w-8 md:h-8" />
          </button>
          
          <AnimatePresence>
            {showEmotePicker && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-6 bg-black/90 backdrop-blur-3xl p-5 rounded-[2.5rem] border border-white/10 flex gap-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[400]"
              >
                 {EMOTES.map(emoji => (
                   <button
                     key={emoji}
                     onClick={() => sendEmote(emoji)}
                     className="text-3xl md:text-4xl hover:scale-150 transition-transform active:scale-90 p-2"
                   >
                     {emoji}
                   </button>
                 ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {(!roomId || isHost) ? (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }} 
            className="text-white hover:scale-110 transition-transform p-4 bg-white/5 rounded-full backdrop-blur-md border border-white/10"
          >
            {isPlaying ? <Pause size={48} className="md:w-20 md:h-20" fill="white" /> : <Play size={48} className="md:w-20 md:h-20" fill="white" />}
          </button>
        ) : roomId && (
          <div className="flex flex-col items-center gap-2">
            <div className="p-4 bg-white/5 rounded-full backdrop-blur-md border border-white/10 opacity-50">
              {isPlaying ? <Pause size={48} className="md:w-20 md:h-20" fill="white" /> : <Play size={48} className="md:w-20 md:h-20" fill="white" />}
            </div>
            <span className="text-[8px] md:text-[10px] font-black uppercase text-red-500 tracking-widest animate-pulse">Sincronizado</span>
          </div>
        )}

        {(!roomId || isHost) && (
          <button onClick={() => skip(10)} className="text-white hover:scale-110 transition-transform flex flex-col items-center">
            <RotateCw size={32} className="md:w-12 md:h-12" />
            <span className="text-[10px] md:text-xs font-bold mt-1">10</span>
          </button>
        )}
      </div>

        {/* Base (Barra de Progresso e Controles) */}
        <div className="space-y-4">
          {/* Barra de Progresso */}
          <div className={`flex items-center gap-4 group/progress ${(roomId && !isHost) ? 'pointer-events-none opacity-50' : ''}`}>
            <span className="text-white text-sm font-medium min-w-[50px]">{formatTime(currentTime)}</span>
            <div 
              className="relative flex-1 h-2 md:h-1.5 bg-gray-600/50 rounded-full cursor-pointer group/bar hover:h-3 transition-all"
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pos = (e.clientX - rect.left) / rect.width;
                setHoverPosition(Math.max(0, Math.min(1, pos)));
                if (duration) setHoverTime(pos * duration);
              }}
              onMouseLeave={() => setHoverTime(null)}
              onTouchMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const touch = e.touches[0];
                const pos = (touch.clientX - rect.left) / rect.width;
                setHoverPosition(Math.max(0, Math.min(1, pos)));
                if (duration) setHoverTime(pos * duration);
              }}
              onTouchEnd={() => setHoverTime(null)}
            >
              {/* Barra de Carregamento (Buffer) - Parte em banco */}
              <div 
                className="absolute top-0 left-0 h-full bg-red-600/40 rounded-full transition-all duration-300"
                style={{ width: `${bufferedPercentage}%` }}
              />
              
              {/* Barra Assistida */}
              <div 
                className="absolute top-0 left-0 h-full bg-red-600 transition-all duration-100 rounded-full"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />
              
              <input
                type="range"
                min="0"
                max={duration || 0}
                value={currentTime}
                onChange={handleSeek}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              
              {/* Botão de Progresso */}
              <div 
                className="absolute top-1/2 w-4 h-4 bg-red-600 rounded-full shadow-[0_0_10px_rgba(220,38,38,0.8)] opacity-0 group-hover/progress:opacity-100 transition-opacity pointer-events-none z-20"
                style={{ left: `${(currentTime / duration) * 100}%`, transform: 'translate(-50%, -50%)' }}
              />
              
              {/* Miniatura de Tempo/Cena Hover */}
              {hoverTime !== null && (
                <div 
                  className="absolute bottom-full mb-4 bg-white text-black px-3 py-1.5 rounded-lg font-black text-sm shadow-2xl pointer-events-none z-30 flex flex-col items-center"
                  style={{ left: `${hoverPosition * 100}%`, transform: 'translateX(-50%)' }}
                >
                  {/* Seta */}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-x-[6px] border-x-transparent border-t-[6px] border-t-white" />
                  <span>{formatTime(hoverTime)}</span>
                </div>
              )}
            </div>
            <span className="text-white text-sm font-medium min-w-[50px]">{formatTime(duration - currentTime)}</span>
          </div>

          {/* Controles Inferiores */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-8">
              {(!roomId || isHost) && (
                <button onClick={togglePlay} className="text-white hover:text-red-500 transition-colors">
                  {isPlaying ? <Pause size={32} fill="white" /> : <Play size={32} fill="white" />}
                </button>
              )}
              
              <div className="flex items-center gap-4 group/volume">
                <button onClick={toggleMute} className="text-white">
                  {isMuted || volume === 0 ? <VolumeX size={32} /> : <Volume2 size={32} />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-0 group-hover/volume:w-24 transition-all duration-300 accent-red-600"
                />
              </div>
            </div>

            <div className="flex items-center gap-4 md:gap-8">
              <div className="flex items-center gap-3 bg-black/40 px-3 py-1.5 rounded-lg border border-white/10 backdrop-blur-md shadow-xl">
                {isAutoQuality && <div className="text-[8px] font-black text-red-600 animate-pulse italic">AUTO</div>}
                <div className={`px-2 py-0.5 rounded-[3px] text-[10px] md:text-[12px] font-black text-white italic tracking-tighter uppercase whitespace-nowrap bg-gradient-to-br shadow-lg ${
                  currentQuality === '4K' ? 'from-amber-400 to-amber-600' :
                  currentQuality === '2K' ? 'from-orange-400 to-orange-600' :
                  currentQuality === 'FULL HD' ? 'from-red-500 to-red-650' :
                  currentQuality === 'HD' ? 'from-blue-500 to-blue-650' :
                  'from-gray-500 to-gray-600'
                }`}>
                  {currentQuality}
                </div>
              </div>

              <button 
                onClick={togglePiP}
                className="text-white hover:text-gray-300 transition-all hidden md:block"
                title="Mini Player (Picture-in-Picture)"
              >
                <PictureInPicture size={24} className="md:w-6 md:h-6 lg:w-8 lg:h-8" />
              </button>

              {hasNextEpisode && onNextEpisode && (
                <button 
                  onClick={onNextEpisode}
                  className="hidden md:flex items-center gap-2 text-white hover:text-gray-300 font-bold bg-white/10 px-4 py-2 rounded-md border border-white/20 transition-all"
                >
                  <FastForward size={20} /> Próximo
                </button>
              )}
              
              <div className="relative">
                <button 
                  onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                  className="text-white font-black text-sm md:text-lg hover:text-gray-300 min-w-[40px] italic"
                >
                  {playbackSpeed}x
                </button>
                {showSpeedMenu && (
                  <div className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 bg-black/95 border border-white/10 rounded-xl py-2 min-w-[80px] shadow-2xl backdrop-blur-xl">
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map(speed => (
                      <button
                        key={speed}
                        onClick={() => {
                          setPlaybackSpeed(speed);
                          if (videoRef.current) videoRef.current.playbackRate = speed;
                          setShowSpeedMenu(false);
                        }}
                        className={`w-full px-4 py-2 text-xs font-bold hover:bg-white/10 transition-colors ${playbackSpeed === speed ? 'text-red-600' : 'text-white'}`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button 
                onClick={togglePiP}
                className="text-white hover:text-gray-300 md:hidden"
                title="Mini Player"
              >
                <PictureInPicture size={28} />
              </button>

              {hasNextEpisode && onNextEpisode && (
                <button 
                  onClick={onNextEpisode}
                  className="text-white hover:text-gray-300 md:hidden"
                  title="Próximo Episódio"
                >
                  <FastForward size={28} />
                </button>
              )}

              <button 
                onClick={toggleRotation}
                className={`text-white transition-all ${isLandscape ? 'text-red-600' : 'hover:text-gray-300'}`}
                title="Girar Tela"
              >
                <RotateCw size={28} className="md:w-8 md:h-8" />
              </button>

              <button onClick={toggleFullscreen} className="text-white hover:scale-110 transition-transform">
                {isFullscreen ? <Minimize size={28} className="md:w-8 md:h-8" /> : <Maximize size={28} className="md:w-8 md:h-8" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* TV Sharing Overlay Fallback */}
      <AnimatePresence>
        {showTvShare && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[500] bg-black/90 backdrop-blur-3xl flex items-center justify-center p-6"
            onClick={() => setShowTvShare(false)}
          >
            <motion.div 
              initial={{ scale: 0.8, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-[#141414] border border-white/10 rounded-[3rem] p-10 max-w-sm w-full text-center space-y-8 shadow-[0_0_100px_rgba(220,38,38,0.3)]"
              onClick={e => e.stopPropagation()}
            >
                <div className="flex flex-col items-center">
                   <div className="w-16 h-16 bg-red-600/20 rounded-2xl flex items-center justify-center mb-6">
                      <Tv className="text-red-600" size={32} />
                   </div>
                   <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter text-center">Transmitir para TV</h3>
                   <p className="text-gray-500 text-sm mt-2 leading-relaxed text-center">Assista em tela grande usando o navegador da sua TV:</p>
                </div>
                
                <div className="space-y-4 text-left">
                   <div className="bg-white/5 p-6 rounded-[2rem] border border-white/10 space-y-4">
                      <div className="flex gap-4 items-start">
                         <div className="w-6 h-6 bg-red-600 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5 shadow-lg shadow-red-600/20">1</div>
                         <p className="text-white text-[11px] font-bold uppercase tracking-wider italic">Abra o Navegador (Browser) da sua Smart TV.</p>
                      </div>
                      <div className="flex gap-4 items-start">
                         <div className="w-6 h-6 bg-red-600 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5 shadow-lg shadow-red-600/20">2</div>
                         <p className="text-white text-[11px] font-bold uppercase tracking-wider italic">Acesse este endereço:</p>
                      </div>
                      <div className="bg-black/60 p-4 rounded-xl border border-white/10 text-center">
                         <span className="text-red-600 font-mono font-black text-xl tracking-tighter">{window.location.hostname}</span>
                      </div>
                   </div>
                </div>

                <div className="space-y-4">
                   <div className="flex flex-col items-center gap-2">
                      <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest italic animate-pulse">Ou use o QR Code:</p>
                      <div className="bg-white p-4 rounded-2xl shadow-2xl">
                         <QRCodeSVG 
                          value={window.location.href} 
                          size={120}
                          level="H"
                          includeMargin={false}
                         />
                      </div>
                   </div>
                   <button 
                     onClick={() => setShowTvShare(false)}
                     className="w-full bg-white text-black py-4 rounded-2xl font-black uppercase tracking-widest text-xs italic shadow-xl"
                   >
                     Continuar no Celular
                   </button>
                </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Marca d'água quando os controles somem */}
      <AnimatePresence>
        {!showControls && !isLoading && !error && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 0.5, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-6 left-0 right-0 z-[300] flex items-center justify-center pointer-events-none"
          >
            <div className="flex items-center gap-3 bg-black/20 backdrop-blur-sm px-4 py-1.5 rounded-full border border-white/5">
               {logoUrl ? (
                 <img 
                   src={logoUrl.startsWith('http') ? logoUrl : `https://image.tmdb.org/t/p/w200/${logoUrl}`}
                   alt=""
                   className="h-4 md:h-6 object-contain"
                   referrerPolicy="no-referrer"
                 />
               ) : (
                 <span className="text-white font-black italic uppercase text-[8px] md:text-[10px] tracking-tight opacity-70">{title}</span>
               )}
               
               <div className="w-px h-3 bg-white/20" />
               
               <div className="flex items-center gap-1.5">
                 <div className="w-4 h-4 md:w-5 md:h-5 bg-red-600 rounded-md flex items-center justify-center">
                    <Play size={8} fill="white" className="text-white ml-0.5" />
                 </div>
                 <span className="text-white font-black text-[10px] md:text-xs italic uppercase tracking-tighter">Net<span className="text-red-600">play</span></span>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NetflixPlayer;
