export const studio = {
  name: 'Team Platypus',
  description: 'An independent game development studio based in Nanjing, China.',
  email: 'guoqingyu@myrichgame.cn',
};

export const game = {
  title: 'Gods on Duty',
  description: 'Defend Olympus in a tower defense game inspired by Greek mythology. Build your defenses, fend off waves of enemies, and explore new strategies in every battle. Each unit has a distinctive look and its own unique abilities and mechanics.',
};

export const navigation = [
  { label: 'Games', path: '/' },
  { label: 'About', path: '/about/' },
  { label: 'Contact', path: '/contact/' },
] as const;

export type PagePath = (typeof navigation)[number]['path'];

export function sitePath(path: `/${string}`) {
  return `${import.meta.env.BASE_URL.replace(/\/$/, '')}${path}`;
}

export function imagePath(name: string) {
  return sitePath(`/media/platypus/${name}.webp`);
}
