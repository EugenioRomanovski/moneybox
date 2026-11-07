export const CATEGORIES = [
  { id: 'food', name: 'Продукты', emoji: '🛒', color: '#34C759' },
  { id: 'cafe', name: 'Кафе', emoji: '☕️', color: '#FF9F0A' },
  { id: 'transport', name: 'Транспорт', emoji: '🚕', color: '#0A84FF' },
  { id: 'home', name: 'Дом', emoji: '🏠', color: '#AC8E68' },
  { id: 'health', name: 'Здоровье', emoji: '💊', color: '#FF375F' },
  { id: 'fun', name: 'Досуг', emoji: '🎬', color: '#BF5AF2' },
  { id: 'clothes', name: 'Одежда', emoji: '👕', color: '#5E5CE6' },
  { id: 'kids', name: 'Дети', emoji: '🧸', color: '#FFCC00' },
  { id: 'gifts', name: 'Подарки', emoji: '🎁', color: '#FF453A' },
  { id: 'beauty', name: 'Красота', emoji: '💅', color: '#FF6482' },
  { id: 'pets', name: 'Питомцы', emoji: '🐾', color: '#A2845E' },
  { id: 'other', name: 'Другое', emoji: '💸', color: '#8E8E93' },
];

const BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export const category = (id) => BY_ID[id] || BY_ID.other;

export const RECURRING_EMOJI = ['🏠', '💡', '📱', '🌐', '🚗', '🎓', '🏋️', '🎵', '📺', '☁️', '🏦', '🧾', '👶', '🐶', '💊', '🔁'];
