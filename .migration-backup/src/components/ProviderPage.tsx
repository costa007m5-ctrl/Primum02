import React from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Play, Plus, Info } from 'lucide-react';
import { Movie } from '../types';
import Row from './Row';

interface ProviderPageProps {
  provider: string;
  movies: Movie[];
  onClose: () => void;
  onSelectMovie: (movie: Movie) => void;
  onToggleMyList: (movie: Movie) => void;
  onToggleFavorite: (movie: Movie) => void;
  myListIds: Set<number>;
  favoriteIds: Set<number>;
}

const providerConfigs: Record<string, any> = {
  'Netflix': {
    logo: 'https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg',
    accent: '#E50914',
    bg: 'bg-[#141414]',
    gradient: 'from-[#141414] via-[#141414]/95 to-transparent',
    overlay: 'bg-gradient-to-r from-[#141414] via-transparent to-transparent',
    buttonPrimary: 'bg-white text-black hover:bg-white/90 rounded-sm font-black uppercase text-[10px] md:text-sm tracking-widest',
    buttonSecondary: 'bg-[#6d6d6eb3] text-white hover:bg-[#6d6d6e66] rounded-sm font-black uppercase text-[10px] md:text-sm tracking-widest backdrop-blur-md',
    font: 'font-sans',
    cardStyle: 'rounded-sm hover:scale-105 transition-transform duration-300',
    heroLayout: 'bottom-0 left-0 p-6 md:p-20 pb-40 md:pb-60',
    titleStyle: 'text-3xl md:text-9xl font-black text-white drop-shadow-[0_0_30px_rgba(0,0,0,0.8)] leading-[0.9] uppercase tracking-tighter italic',
    theme: 'netflix'
  },
  'Disney+': {
    logo: 'https://upload.wikimedia.org/wikipedia/commons/3/3e/Disney%2B_logo.svg',
    accent: '#0063e5',
    bg: 'bg-[#040714]',
    gradient: 'from-[#040714] via-[#040714]/90 to-[#040714]',
    overlay: 'bg-[radial-gradient(circle_at_25%_25%,rgba(0,99,229,0.15),transparent_80%)]',
    buttonPrimary: 'bg-[#0063e5] text-white hover:bg-[#0072ff] rounded-[0.4rem] font-black tracking-[0.1em] text-[10px] md:text-sm uppercase italic shadow-[0_0_20px_rgba(0,99,229,0.4)]',
    buttonSecondary: 'bg-black/40 text-white border border-white/20 hover:bg-white/10 rounded-[0.4rem] font-black tracking-[0.1em] text-[10px] md:text-sm uppercase italic',
    font: 'font-sans',
    cardStyle: 'rounded-lg border border-white/5 shadow-2xl hover:border-[#0063e5] transition-colors duration-300',
    heroLayout: 'bottom-0 left-0 w-full p-6 md:p-24 pb-32 md:pb-64',
    titleStyle: 'text-2xl md:text-[8rem] font-black text-white tracking-tight drop-shadow-[0_0_30px_rgba(0,99,229,0.3)] uppercase italic leading-[0.9]',
    theme: 'disney'
  },
  'Max': {
    logo: 'https://upload.wikimedia.org/wikipedia/commons/c/ce/Max_logo.svg',
    accent: '#002be7',
    bg: 'bg-[#000814]',
    gradient: 'from-[#000814] via-[#000814]/90 to-transparent',
    overlay: 'bg-gradient-to-b from-[#002be7]/10 to-transparent',
    buttonPrimary: 'bg-white text-black hover:bg-gray-100 rounded-full font-black px-12 py-5 text-sm uppercase italic',
    buttonSecondary: 'bg-white/5 text-white border border-white/10 hover:bg-white/10 rounded-full font-black px-12 py-5 text-sm uppercase italic',
    font: 'font-sans',
    cardStyle: 'rounded-none border-b-4 border-transparent hover:border-[#002be7] transition-colors group-hover:scale-105 duration-300',
    heroLayout: 'bottom-0 left-0 p-8 md:p-24 pb-48 md:pb-72',
    titleStyle: 'text-5xl md:text-[10rem] font-black text-white italic tracking-tighter uppercase leading-[0.8] drop-shadow-[0_0_40px_rgba(0,43,231,0.3)]',
    theme: 'max'
  },
  'Prime Video': {
    logo: 'https://upload.wikimedia.org/wikipedia/commons/f/f1/Prime_Video.png',
    accent: '#00a8e1',
    bg: 'bg-[#0f171e]',
    gradient: 'from-[#0f171e] via-[#0f171e]/90 to-transparent',
    overlay: 'bg-gradient-to-r from-black/40 to-transparent',
    buttonPrimary: 'bg-[#00a8e1] text-white hover:bg-[#00c3ff] rounded-md font-black px-10 py-4 text-sm uppercase shadow-xl',
    buttonSecondary: 'bg-[#1a242f] text-white hover:bg-[#252e39] rounded-md font-black px-10 py-4 text-sm uppercase border border-white/5',
    font: 'font-sans',
    cardStyle: 'rounded-md shadow-2xl hover:ring-4 ring-[#00a8e1]/50 transition-shadow duration-300',
    heroLayout: 'bottom-0 left-0 p-8 md:p-32 pb-48 md:pb-72',
    titleStyle: 'text-4xl md:text-8xl font-black text-white tracking-tight uppercase leading-none drop-shadow-2xl',
    theme: 'prime'
  },
  'Apple TV+': {
    logo: 'https://upload.wikimedia.org/wikipedia/commons/2/28/Apple_TV_Plus_Logo.svg',
    accent: '#ffffff',
    bg: 'bg-[#000000]',
    gradient: 'from-black via-black/50 to-transparent',
    overlay: 'bg-black/20',
    buttonPrimary: 'bg-white text-black hover:bg-white/80 rounded-2xl font-black px-12 py-5 text-sm uppercase italic',
    buttonSecondary: 'bg-white/10 text-white backdrop-blur-md hover:bg-white/20 rounded-2xl font-black px-12 py-5 text-sm uppercase italic border border-white/10',
    font: 'font-sans',
    cardStyle: 'rounded-[1.5rem] md:rounded-[2.5rem] hover:scale-105 transition-transform duration-300 ease-in-out z-10 border border-white/5 shadow-2xl',
    heroLayout: 'bottom-0 left-0 w-full flex flex-col items-center text-center p-6 md:p-24 pb-32 md:pb-64',
    titleStyle: 'text-4xl md:text-[8rem] font-black text-white tracking-tighter leading-[0.85] uppercase italic',
    theme: 'apple'
  },
  'Paramount+': {
    logo: 'https://upload.wikimedia.org/wikipedia/commons/a/a5/Paramount_Plus.svg',
    accent: '#0064ff',
    bg: 'bg-[#00001a]',
    gradient: 'from-[#00001a] via-[#00001a]/95 to-transparent',
    overlay: 'bg-[radial-gradient(circle_at_center,rgba(0,100,255,0.2)_0%,transparent_70%)]',
    buttonPrimary: 'bg-white text-[#0064ff] hover:bg-blue-50 rounded-full font-black uppercase text-xs italic tracking-widest px-12 py-5 shadow-2xl shadow-blue-600/20',
    buttonSecondary: 'bg-[#0064ff] text-white hover:bg-[#3385ff] rounded-full font-black uppercase text-xs italic tracking-widest px-12 py-5 border border-blue-400/30',
    font: 'font-sans',
    cardStyle: 'rounded-xl border-2 border-transparent hover:border-blue-500 transition-all overflow-hidden hover:scale-105 shadow-2xl',
    heroLayout: 'bottom-0 left-0 p-6 md:p-20 pb-32 md:pb-60',
    titleStyle: 'text-3xl md:text-[8rem] font-black text-white italic tracking-tighter uppercase leading-[0.8] drop-shadow-[0_0_30px_rgba(0,100,255,0.5)]',
    theme: 'paramount'
  },
  'Globoplay': {
    logo: 'https://upload.wikimedia.org/wikipedia/commons/a/af/Globoplay_logo.svg',
    accent: '#ff4b00',
    bg: 'bg-[#121212]',
    gradient: 'from-[#121212] via-[#121212]/95 to-transparent',
    overlay: 'bg-gradient-to-t from-[#ff4b00]/5 to-transparent',
    buttonPrimary: 'bg-[#fb0d1b] text-white hover:bg-[#ff1a1a] rounded-sm font-black uppercase text-xs tracking-widest px-10 py-4 shadow-xl shadow-red-600/20',
    buttonSecondary: 'bg-white/5 text-white border border-white/10 hover:bg-white/10 rounded-sm font-black uppercase text-xs tracking-widest px-10 py-4',
    font: 'font-sans',
    cardStyle: 'rounded-xl hover:shadow-[0_0_30px_rgba(251,13,27,0.3)] transition-all hover:-translate-y-2',
    heroLayout: 'bottom-0 left-0 p-8 md:p-24 pb-48 md:pb-64',
    titleStyle: 'text-4xl md:text-8xl font-black text-white uppercase italic tracking-tighter leading-none',
    theme: 'globo'
  }
};

const ProviderPage: React.FC<ProviderPageProps> = ({ 
  provider, 
  movies, 
  onClose, 
  onSelectMovie, 
  onToggleMyList, 
  onToggleFavorite,
  myListIds,
  favoriteIds
}) => {
  const config = providerConfigs[provider] || providerConfigs['Netflix'];
  const featuredMovie = movies[0];

  const moviesByGenre = React.useMemo(() => {
    return movies.reduce((acc, movie) => {
      const genres = movie.genres?.split(',') || ['Geral'];
      genres.forEach(g => {
        const genre = g.trim();
        if (!acc[genre]) acc[genre] = [];
        acc[genre].push(movie);
      });
      return acc;
    }, {} as Record<string, Movie[]>);
  }, [movies]);

  return (
    <motion.div 
      initial={{ opacity: 0, x: '100%' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className={`fixed inset-0 z-[200] ${config.bg} overflow-y-auto overflow-x-hidden custom-scrollbar`}
    >
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-[210] p-4 md:p-6 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent">
        <button 
          onClick={onClose}
          className="p-2 md:p-3 bg-black/40 rounded-full text-white hover:bg-red-600 transition-colors"
        >
          <ChevronLeft size={24} className="md:w-8 md:h-8" />
        </button>
        <img src={config.logo} alt={provider} className="h-6 md:h-12 object-contain" referrerPolicy="no-referrer" />
        <div className="w-8 md:w-12"></div> {/* Spacer */}
      </div>

      {/* Hero */}
      {featuredMovie && (
        <div className="relative h-[60vh] md:h-[90vh] w-full overflow-hidden">
          <img 
            src={featuredMovie.backdrop_path?.startsWith('http') ? featuredMovie.backdrop_path : `https://image.tmdb.org/t/p/original/${featuredMovie.backdrop_path}`}
            alt={featuredMovie.title}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
          <div className={`absolute inset-0 bg-gradient-to-t ${config.gradient}`}></div>
          <div className={`absolute inset-0 ${config.overlay}`}></div>
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-transparent"></div>
          
          <div className={`absolute ${config.heroLayout} space-y-3 md:space-y-6 max-w-3xl z-20`}>
            <h1 className={`${config.titleStyle} text-2xl md:text-8xl`}>
              {featuredMovie.title || featuredMovie.name}
            </h1>
            <p className={`text-gray-200 text-xs md:text-2xl line-clamp-2 md:line-clamp-3 font-medium italic drop-shadow-lg ${config.font}`}>
              {featuredMovie.overview}
            </p>
            <div className="flex items-center gap-2 md:gap-4 pt-2 md:pt-4">
              <button 
                onClick={() => onSelectMovie(featuredMovie)}
                className={`${config.buttonPrimary} px-4 md:px-12 py-2 md:py-4 font-black uppercase tracking-widest flex items-center gap-2 md:gap-3 transition-transform shadow-2xl hover:scale-105 active:scale-95 text-[10px] md:text-base`}
              >
                <Play fill="currentColor" size={16} className="md:w-6 md:h-6" /> Assistir
              </button>
              <button 
                onClick={() => onSelectMovie(featuredMovie)}
                className={`${config.buttonSecondary} px-4 md:px-12 py-2 md:py-4 font-black uppercase tracking-widest flex items-center gap-2 md:gap-3 transition-transform hover:scale-105 active:scale-95 text-[10px] md:text-base`}
              >
                <Info size={16} className="md:w-6 md:h-6" /> Detalhes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content Rows */}
      <div className="relative z-30 -mt-20 md:-mt-48 pb-20 space-y-8 md:space-y-12">
        {/* Top 10 Section */}
        <Row 
          title={`Top 10 ${provider} Hoje`}
          movies={movies.slice(0, 10)}
          isLargeRow={true}
          onSelectMovie={onSelectMovie}
          onToggleMyList={onToggleMyList}
          onToggleFavorite={onToggleFavorite}
          myListIds={myListIds}
          favoriteIds={favoriteIds}
          cardStyle={config.cardStyle}
        />

        {Object.entries(moviesByGenre).map(([genre, genreMovies]) => (
          <Row 
            key={genre}
            title={genre}
            movies={genreMovies}
            onSelectMovie={onSelectMovie}
            onToggleMyList={onToggleMyList}
            onToggleFavorite={onToggleFavorite}
            myListIds={myListIds}
            favoriteIds={favoriteIds}
            cardStyle={config.cardStyle}
          />
        ))}
      </div>
    </motion.div>
  );
};

export default ProviderPage;
