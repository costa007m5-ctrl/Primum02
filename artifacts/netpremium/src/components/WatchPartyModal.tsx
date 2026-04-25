import React, { useState } from 'react';
import { X, Users, Copy, Check, Play, Share2 } from 'lucide-react';
import { Movie, Profile } from '../types';
import { supabase } from '../lib/supabase';

interface WatchPartyModalProps {
  movie: Movie;
  profile: Profile;
  onClose: () => void;
  onRoomCreated: (roomId: string) => void;
}

const WatchPartyModal: React.FC<WatchPartyModalProps> = ({ movie, profile, onClose, onRoomCreated }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);

  const createRoom = async () => {
    setIsCreating(true);
    try {
      // In a real app, we'd save this to a 'rooms' table. 
      // For this demo, we'll generate a unique ID and use Supabase Realtime Channels.
      const newRoomId = Math.random().toString(36).substring(2, 15);
      
      // We can optionally save to Supabase if we want persistence, 
      // but for a "Watch Party" that's temporary, we can just use the ID.
      // However, the user asked to "generate a link", so we need a stable ID.
      
      setRoomId(newRoomId);
    } catch (error) {
      console.error('Erro ao criar sala:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const shareUrl = roomId ? `${window.location.origin}?room=${roomId}&movie=${movie.id}` : '';

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/90 p-4 animate-in fade-in duration-300">
      <div className="bg-[#181818] w-full max-w-md p-8 rounded-xl shadow-2xl relative border border-gray-800">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <X size={24} />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="bg-red-600 p-4 rounded-full mb-6 shadow-lg shadow-red-600/20">
            <Users size={32} className="text-white" />
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-2">Assistir com Amigos</h2>
          <p className="text-gray-400 mb-8 text-sm">
            Crie uma sala para assistir <span className="text-white font-bold">{movie.title || movie.name}</span> com até 4 pessoas simultaneamente.
          </p>

          {!roomId ? (
            <button
              onClick={createRoom}
              disabled={isCreating}
              className="w-full bg-white text-black font-bold py-4 rounded-lg hover:bg-gray-200 transition-all flex items-center justify-center gap-2 text-lg"
            >
              {isCreating ? (
                <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Play fill="black" size={20} /> Criar Sala de Estreia
                </>
              )}
            </button>
          ) : (
            <div className="w-full space-y-6">
              <div className="bg-black/40 p-4 rounded-lg border border-gray-800">
                <p className="text-xs font-bold text-gray-500 uppercase mb-2 text-left">Link da Sala</p>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    readOnly 
                    value={shareUrl}
                    className="flex-1 bg-transparent text-gray-300 text-sm outline-none truncate"
                  />
                  <button 
                    onClick={copyToClipboard}
                    className="text-white hover:text-red-500 transition-colors"
                  >
                    {copied ? <Check size={20} className="text-green-500" /> : <Copy size={20} />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => onRoomCreated(roomId)}
                  className="w-full bg-red-600 text-white font-bold py-4 rounded-lg hover:bg-red-700 transition-all flex items-center justify-center gap-2"
                >
                  <Play fill="white" size={20} /> Iniciar Sessão
                </button>
                <p className="text-[10px] text-gray-500">
                  Como anfitrião, você terá o controle do player (play, pause e tempo).
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WatchPartyModal;
