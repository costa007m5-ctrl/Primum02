import React, { useRef } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import { Movie } from '../types';

interface Top10RowProps {
  title: string;
  movies: Movie[];
  onSelectMovie: (movie: Movie) => void;
}

const Top10Row: React.FC<Top10RowProps> = ({ title, movies, onSelectMovie }) => {
  const rowRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (rowRef.current) {
      const { scrollLeft, clientWidth } = rowRef.current;
      const scrollTo = direction === 'left' ? scrollLeft - clientWidth * 0.8 : scrollLeft + clientWidth * 0.8;
      rowRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  };

  if (!movies || movies.length === 0) return null;

  return (
    <div className="space-y-6 md:space-y-10 group/row relative py-10 overflow-hidden">
      <div className="px-4 md:px-12 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-1.5 h-10 bg-red-600 rounded-full shadow-[0_0_20px_rgba(220,38,38,0.6)]" />
          <div className="flex flex-col">
            <h2 className="text-3xl md:text-5xl font-black text-white italic uppercase tracking-tighter flex items-center gap-3">
              <TrendingUp className="text-red-600" size={32} />
              {title}
            </h2>
            <span className="text-[10px] font-black uppercase tracking-[0.5em] text-gray-500 mt-1">Global Chart Today</span>
          </div>
        </div>

        <div className="flex gap-3 opacity-0 group-hover/row:opacity-100 transition-opacity duration-300">
           <button 
             onClick={() => scroll('left')}
             className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-red-600 hover:border-red-600 transition-all active:scale-90"
           >
             <ChevronLeft size={24} />
           </button>
           <button 
             onClick={() => scroll('right')}
             className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-red-600 hover:border-red-600 transition-all active:scale-90"
           >
             <ChevronRight size={24} />
           </button>
        </div>
      </div>

      <div 
        ref={rowRef}
        className="flex overflow-x-auto no-scrollbar gap-12 md:gap-24 px-4 md:px-12 pb-10"
      >
        {movies.slice(0, 10).map((movie, index) => (
          <motion.div
            key={movie.id}
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            whileHover={{ y: -15 }}
            className="relative flex-none w-[180px] md:w-[320px] aspect-[2/3] cursor-pointer group/card"
            onClick={() => onSelectMovie(movie)}
          >
            {/* Large Number Background */}
            <div className="absolute -left-12 md:-left-24 bottom-0 z-0">
               <span className="text-[12rem] md:text-[22rem] font-black leading-none italic select-none
                 text-transparent stroke-white stroke-2 md:stroke-[4px] opacity-20
                 transition-all duration-700 group-hover/card:opacity-40 group-hover/card:stroke-red-600
                 [filter:drop-shadow(0_0_30px_rgba(255,255,255,0.1))]
                 group-hover/card:[filter:drop-shadow(0_0_40px_rgba(220,38,38,0.5))]"
                 style={{ WebkitTextStroke: 'inherit' }}
               >
                 {index + 1}
               </span>
            </div>

            {/* Poster Card */}
            <div className="relative z-10 w-full h-full rounded-[2rem] md:rounded-[3rem] overflow-hidden border-2 border-white/10 group-hover/card:border-red-600 transition-all duration-500 shadow-2xl">
              <img
                src={movie.poster_path?.startsWith('http') ? movie.poster_path : `https://image.tmdb.org/t/p/w780/${movie.poster_path}`}
                alt={movie.title || movie.name}
                className="w-full h-full object-cover group-hover/card:scale-110 transition-transform duration-700"
                referrerPolicy="no-referrer"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60" />
              
              {/* Card Meta */}
              <div className="absolute bottom-6 left-6 right-6 translate-y-4 opacity-0 group-hover/card:translate-y-0 group-hover/card:opacity-100 transition-all duration-500">
                 <p className="text-white font-black text-sm uppercase italic truncate">{movie.title || movie.name}</p>
                 <div className="flex items-center gap-2 mt-2">
                    <span className="bg-red-600 text-white text-[8px] font-black px-2 py-0.5 rounded italic">TOP 10</span>
                 </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default Top10Row;
