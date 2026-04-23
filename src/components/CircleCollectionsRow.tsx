import React, { useRef } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface CircleCollectionsRowProps {
  franchises: any[];
}

const CircleCollectionsRow: React.FC<CircleCollectionsRowProps> = ({ franchises }) => {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const scrollTo = direction === 'left' ? scrollLeft - clientWidth * 0.8 : scrollLeft + clientWidth * 0.8;
      scrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  };

  return (
    <div className="py-12 md:py-20 relative group overflow-hidden">
      {/* Background Decorative Element */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      
      <div className="px-4 md:px-12 flex items-center justify-between mb-12">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <h2 className="text-3xl md:text-5xl font-black text-white italic uppercase tracking-tighter flex items-center gap-4">
              <Sparkles className="text-red-600 animate-pulse" size={28} />
              Universos <span className="text-red-600">Circle</span>
            </h2>
            <span className="text-[10px] font-black uppercase tracking-[0.5em] text-gray-500 mt-1">Conectando Histórias Epicas</span>
          </div>
        </div>

        <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
           <button 
             onClick={() => scroll('left')}
             className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-all"
           >
             <ChevronLeft size={20} />
           </button>
           <button 
             onClick={() => scroll('right')}
             className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-all"
           >
             <ChevronRight size={20} />
           </button>
        </div>
      </div>

      <div 
        ref={scrollRef}
        className="flex overflow-x-auto no-scrollbar gap-12 md:gap-20 px-4 md:px-12 pb-6"
      >
        {franchises?.map((f: any, idx: number) => (
          <motion.div
            key={f.id}
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: idx * 0.1 }}
            whileHover={{ y: -10 }}
            className="relative flex-none cursor-pointer group/circle"
            onClick={() => navigate(`/universe/${f.id}`)}
          >
            {/* Circle Container */}
            <div className="relative w-32 h-32 md:w-56 md:h-56">
               {/* Animated Rings */}
               <div className="absolute -inset-2 rounded-full border border-white/5 group-hover/circle:border-red-600/50 transition-colors duration-500 animate-spin-slow" />
               <div className="absolute -inset-4 rounded-full border border-white/5 group-hover/circle:border-white/20 transition-colors duration-700" />
               
               {/* Main Circle */}
               <div className="w-full h-full rounded-full overflow-hidden border-2 border-white/10 group-hover/circle:border-red-600 transition-all duration-700 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative">
                  <img 
                    src={f.backdrop} 
                    className="w-full h-full object-cover grayscale opacity-30 group-hover/circle:grayscale-0 group-hover/circle:opacity-100 group-hover/circle:scale-110 transition-all duration-1000"
                    alt={f.name}
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/90 group-hover/circle:from-transparent transition-all duration-700" />
                  
                  {/* Logo Center */}
                  <div className="absolute inset-0 flex items-center justify-center p-6 md:p-10">
                     {f.logo ? (
                       <img 
                         src={f.logo} 
                         className="w-full h-full object-contain filter drop-shadow-[0_0_15px_rgba(255,255,255,0.4)] group-hover/circle:scale-115 transition-all duration-700"
                         referrerPolicy="no-referrer"
                         alt={f.name}
                       />
                     ) : (
                       <span className="text-white font-black text-xl md:text-3xl uppercase italic text-center leading-none tracking-tighter">
                         {f.name}
                       </span>
                     )}
                  </div>
               </div>
            </div>

            {/* Title & Stats */}
            <div className="mt-8 text-center space-y-3">
               {f.logo ? (
                 <img 
                   src={f.logo} 
                   className="h-8 md:h-12 object-contain mx-auto opacity-60 group-hover/circle:opacity-100 transition-all duration-500 hover:scale-110" 
                   alt={f.name}
                   referrerPolicy="no-referrer"
                 />
               ) : (
                 <h4 className="text-white font-black uppercase italic tracking-tighter text-lg md:text-2xl group-hover/circle:text-red-600 transition-colors">
                   {f.name}
                 </h4>
               )}
               
               <div className="flex items-center justify-center gap-3">
                  <div className="h-0.5 w-6 bg-red-600 rounded-full group-hover/circle:w-10 transition-all" />
                  <span className="text-gray-500 font-black text-[8px] md:text-[10px] uppercase tracking-[0.3em]">
                    {f.movies?.length || 0} ARCHIVES
                  </span>
                  <div className="h-0.5 w-6 bg-red-600 rounded-full group-hover/circle:w-10 transition-all" />
               </div>
            </div>

            {/* Hover Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-red-600/0 group-hover/circle:bg-red-600/10 blur-[60px] rounded-full transition-all duration-700" />
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default CircleCollectionsRow;
