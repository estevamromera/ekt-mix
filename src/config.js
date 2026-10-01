// Chave publicável do Supabase: é pública por natureza. O acesso aos dados
// depende do código da banda, checado dentro das funções do banco.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ezcdnurivzraepmcwlya.supabase.co';
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_18VlVyRpK7nyxo2Xpg8Q4Q_O5bPU2Fc';
export const BUCKET = 'ekt-mix-review';

export const PEOPLE = [
  { id: 'niper', name: 'Niper', color: '#c7ff45' },
  { id: 'rapha', name: 'Rapha', color: '#58c4ff' },
  { id: 'xris', name: 'Xris', color: '#c084fc' },
  { id: 'theo', name: 'Theo', color: '#ffad5c' },
  { id: 'emmily', name: 'Emmily', color: '#ff6b7a' },
  { id: 'estevam', name: 'Estevam', color: '#5eead4' },
  { id: 'miguel', name: 'Miguel', color: '#f9e063' },
];
