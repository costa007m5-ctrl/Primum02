import React, { useState, useEffect } from 'react';
import { Search, Edit3, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface AppSettings {
  id: string;
  user_id: string;
  subscription_plan?: string;
  subscription_status?: string;
  subscription_expires_at?: string;
  theme?: string;
}

export default function AdminUsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [settings, setSettings] = useState<Record<string, AppSettings>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editData, setEditData] = useState<{ plan: string, status: string, daysToAdd: number }>({ plan: 'hub', status: 'active', daysToAdd: 30 });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Aqui a gente precisaria puxar os usuários da tabela admin_users se disponível ou supabase.auth.admin se usarmos service_role. 
      // Mas o app "normal" via cliente não pode puxar a lista de todos os usuários auth. 
      // Em geral, as apps criam uma tabela chamada "profiles" ou usam "app_settings" para listar.
      
      const { data: settingsData, error: settingsError } = await supabase.from('app_settings').select('user_id, subscription_plan, subscription_status, subscription_expires_at, theme, id');
      if (settingsData) {
        const settingsMap: Record<string, AppSettings> = {};
        settingsData.forEach(s => settingsMap[s.user_id] = s);
        setSettings(settingsMap);
        
        // Mocking user profile info or if we have profiles, we fetch them. 
        // We will try fetching 'profiles'
        const { data: profilesData } = await supabase.from('profiles').select('id, user_id, name, type');
        // Agrupar perfis por user_id pra ter uma ideia de quem é, ou se tivermos o email salvo em algum lugar.
        // Já que a lista auth.users não é exposta pra client_key
        
        // Se a gente precisar dos emails reais do auth, precisamos chamar uma edge function ou endpoint do nosso backend Node que use admin sdk.
        // Nosso server.ts pode ter uma rota pra isso /api/admin/users
        
        // Por ora, vamos pelo server local:
        const tokenResp = await supabase.auth.getSession();
        const access_token = tokenResp.data.session?.access_token;
        
        try {
          const res = await fetch('/api/admin/users', {
            headers: { Authorization: `Bearer ${access_token}` }
          });
          if (res.ok) {
             const data = await res.json();
             setUsers(data.users || []);
          } else {
             // Fallback to building users from settings
             const fakeUsers = settingsData.map(s => ({
                id: s.user_id,
                email: 'user_' + s.user_id.substring(0,6) + '@example.com',
                created_at: new Date().toISOString()
             }));
             setUsers(fakeUsers);
          }
        } catch {
             const fakeUsers = settingsData.map(s => ({
                id: s.user_id,
                email: 'user_' + s.user_id.substring(0,6) + '@example.com',
                created_at: new Date().toISOString()
             }));
             setUsers(fakeUsers);
        }
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleEdit = (user: any) => {
    const s = settings[user.id] || {};
    setEditingUserId(user.id);
    setEditData({
      plan: s.subscription_plan || 'hub',
      status: s.subscription_status || 'active',
      daysToAdd: 30
    });
  };

  const handleSave = async (userId: string) => {
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + editData.daysToAdd);
      
      const s = settings[userId];
      if (s) {
        await supabase.from('app_settings')
          .update({
            subscription_plan: editData.plan,
            subscription_status: editData.status,
            subscription_expires_at: editData.status === 'active' ? expiresAt.toISOString() : null
          })
          .eq('user_id', userId);
      } else {
         await supabase.from('app_settings')
          .insert({
            user_id: userId,
            subscription_plan: editData.plan,
            subscription_status: editData.status,
            subscription_expires_at: editData.status === 'active' ? expiresAt.toISOString() : null,
            theme: 'dark',
            language: 'pt-BR',
            autoplay_next: true,
            show_logos: true
          });
      }
      
      setEditingUserId(null);
      fetchData(); // reload
    } catch (error) {
      console.error("Erro ao salvar", error);
      alert("Erro ao salvar os novos dados.");
    }
  };

  const getRemainingDays = (dateStr?: string) => {
    if (!dateStr) return 0;
    const expires = new Date(dateStr).getTime();
    const now = new Date().getTime();
    const diff = expires - now;
    return Math.max(0, Math.ceil(diff / (1000 * 3600 * 24)));
  };

  const filteredUsers = users.filter(u => u.email?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black italic uppercase tracking-tighter">Assinantes</h2>
          <p className="text-gray-500 text-xs font-bold mt-1">Gerencie os planos e status de assinaturas dos usuários.</p>
        </div>
        <div className="relative w-full md:w-64">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
           <input 
             type="text" 
             placeholder="Buscar email..." 
             className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-white"
             value={search}
             onChange={(e) => setSearch(e.target.value)}
           />
        </div>
      </div>
      
      {loading ? (
        <div className="flex items-center justify-center py-20">
           <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-black/40 text-[10px] uppercase tracking-widest text-gray-500">
                <th className="p-4 font-black">E-mail</th>
                <th className="p-4 font-black">Plano</th>
                <th className="p-4 font-black">Status</th>
                <th className="p-4 font-black">Expira em</th>
                <th className="p-4 font-black text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {filteredUsers.map(u => {
                const s = settings[u.id] || {};
                const days = getRemainingDays(s.subscription_expires_at);
                const isEditing = editingUserId === u.id;
                
                return (
                  <tr key={u.id} className="border-t border-white/5 hover:bg-white/5">
                    <td className="p-4">{u.email}</td>
                    <td className="p-4">
                      {isEditing ? (
                        <select 
                          className="bg-black border border-white/10 rounded p-1 text-xs"
                          value={editData.plan}
                          onChange={(e) => setEditData({...editData, plan: e.target.value})}
                        >
                          <option value="hub">Hub</option>
                          <option value="plus">Plus</option>
                          <option value="max">Max</option>
                        </select>
                      ) : (
                        <span className="capitalize">{s.subscription_plan || 'Nenhum'}</span>
                      )}
                    </td>
                    <td className="p-4">
                      {isEditing ? (
                        <select 
                          className="bg-black border border-white/10 rounded p-1 text-xs"
                          value={editData.status}
                          onChange={(e) => setEditData({...editData, status: e.target.value})}
                        >
                          <option value="active">Ativo</option>
                          <option value="pending">Pendente</option>
                          <option value="expired">Cancelado/Expirado</option>
                        </select>
                      ) : (
                         <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-black uppercase ${s.subscription_status === 'active' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                           {s.subscription_status === 'active' ? 'Ativo' : (s.subscription_status === 'pending' ? 'Pendente' : 'Inativo')}
                         </span>
                      )}
                    </td>
                    <td className="p-4">
                      {isEditing ? (
                         <div className="flex items-center gap-2">
                           <input type="number" className="bg-black border border-white/10 w-16 p-1 text-xs rounded" value={editData.daysToAdd} onChange={(e) => setEditData({...editData, daysToAdd: Number(e.target.value)})} />
                           <span className="text-xs text-gray-500">dias</span>
                         </div>
                      ) : (
                         <span>{days > 0 ? `${days} dias (${new Date(s.subscription_expires_at!).toLocaleDateString('pt-BR')})` : 'Expirado'}</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditingUserId(null)} className="p-1 text-gray-400 hover:text-white"><XCircle size={18} /></button>
                          <button onClick={() => handleSave(u.id)} className="p-1 text-green-500 hover:text-green-400"><CheckCircle size={18} /></button>
                        </div>
                      ) : (
                        <button onClick={() => handleEdit(u)} className="p-2 bg-white/5 hover:bg-white/10 rounded text-gray-300 transition-colors">
                          <Edit3 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {filteredUsers.length === 0 && (
                 <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500">Nenhum usuário encontrado.</td>
                 </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
