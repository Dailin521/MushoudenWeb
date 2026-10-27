export type Locale = 'zh' | 'en';
export const locales: Locale[] = ['zh', 'en'];
export const site = {
  name: 'Team Platypus',
  nameEn: 'Team Platypus',
  steam: 'https://store.steampowered.com/app/3285500/',
  bilibili: 'https://space.bilibili.com/3546791347751199',
  douyin: 'https://www.douyin.com/user/MS4wLjABAAAAU8lAXEW-Meq2KOHAJlCV-b1KhGu2yDm9lHRiMejkw7IQD1r871CW6KVr5TB-PkhB',
  xiaohongshu: 'https://www.xiaohongshu.com/user/profile/66e256fe000000001e001386',
  discord: 'https://discord.gg/cYFR8h7AGc',
  x: 'https://x.com/Mushouden3',
  groups: ['1032486977', '757114043', '497960671'],
  // Populate with the real HTTPS invitation links copied from each QQ group.
  // QQ's official join component requires signed links, not just group numbers.
  qqGroupLinks: {
    '1032486977': 'https://qm.qq.com/q/SNPHzfTqYS',
  } as Record<string, string>,
};
export function asset(path: string) {
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  return `${import.meta.env.BASE_URL.replace(/\/$/, '')}${path}`;
}
export function url(locale: Locale, pathname = '') {
  return asset(`${locale === 'en' ? '/en' : ''}/${pathname.replace(/^\/+|\/+$/g, '')}${pathname ? '/' : ''}`);
}
export const steamUrl = (locale: Locale) => `${site.steam}?l=${locale === 'zh' ? 'schinese' : 'english'}`;
export function dateLabel(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Shanghai' }).format(new Date(value));
}
export const copy = {
  zh: {
    studio: site.name, game: '猛将三国', nav: ['动态', '游戏', '关于', '社区'],
    description: 'Team Platypus 官方网站。了解《猛将三国》的最新动态、游戏世界与玩家社区。',
    tagline: '以三国为舞台，书写你自己的故事。',
    studioIntro: '我们是 Team Platypus，《猛将三国》的开发团队。欢迎在这里了解游戏近况，和我们一起走进这片乱世。',
    skip: '跳到正文', menu: '打开导航', close: '关闭', news: '来自工作室', newsEn: 'NEWS & UPDATES',
    read: '阅读全文', previous: '较新的动态', next: '更早的动态', back: '返回全部动态',
    source: '查看 Steam 原文', fallback: '此文章暂未提供中文，以下为英文原文。',
    community: '保持联系', follow: '关注我们', steam: '前往 Steam 商店', copyright: site.name,
    footerGame: '了解《猛将三国》', footerCommunity: '加入玩家社区', copied: '已复制',
    copyFailed: '复制失败',
    released: '现已登陆 STEAM', trailer: '观看游戏预告', videoError: '预告片暂时无法加载，可以前往 Steam 观看。',
    videoLink: '在 Steam 观看', screenshots: '游戏实景',
    gameIntro: '公元 182 年，黄巾之乱前夕。你可以扮演原创角色，也可以成为历史武将，在乱世降临之前结交英雄、经营势力，走出属于自己的三国人生。',
    gameIntro2: '做四处游历的独行侠，或招揽名将共赴战场。从一人一剑到统领军队，每一次选择，都将续写你的故事。',
    aboutTitle: '你好，我们是 Team Platypus。', aboutSub: 'TEAM PLATYPUS',
    aboutBody: '我们是《猛将三国》的开发团队。以黄巾之乱前夕为起点，我们把人物、探索、养成与战斗放进同一个三国世界，让玩家选择自己的道路。',
    aboutBody2: '我们在 Steam 发布游戏公告，也通过玩家社区听取建议、收集问题。感谢每一位走进《猛将三国》的玩家。',
    communityTitle: '相聚于此，一起聊聊三国。', communityIntro: '交流游戏心得、分享你的故事，或把遇到的问题告诉我们。',
    qq: '官方 QQ 玩家群', groupNames: ['玩家交流群 1', '玩家交流群 2', 'BUG 反馈群'],
    groupDescriptions: ['与同好交流，一起探索乱世。', '分享攻略、见闻与游戏心得。', '反馈遇到的问题，帮助我们改进游戏。'],
    social: '关注官方动态', joinGroup: '加入群聊', copyNumber: '复制群号',
    bilibiliDescription: '猛将三国 · 游戏视频与最新动态',
    notFound: '这条路暂时走不通。', notFoundBody: '你访问的页面不存在，回到工作室看看最新动态吧。', home: '返回首页',
  },
  en: {
    studio: site.name, game: 'Three Kingdoms: Mushouden', nav: ['News', 'Games', 'About', 'Community'],
    description: 'The official Team Platypus website. Discover Three Kingdoms: Mushouden, read the latest updates, and join our community.',
    tagline: 'A world of Three Kingdoms. A story of your own.',
    studioIntro: 'We are Team Platypus, the developers of Three Kingdoms: Mushouden. Follow our latest news and step into a world on the brink of change.',
    skip: 'Skip to content', menu: 'Open navigation', close: 'Close', news: 'From the studio', newsEn: 'NEWS & UPDATES',
    read: 'Read more', previous: 'Newer posts', next: 'Older posts', back: 'Back to all news',
    source: 'Read the original on Steam', fallback: 'This post is currently available in Chinese only. The original appears below.',
    community: 'Stay in touch', follow: 'Follow us', steam: 'Visit the Steam store', copyright: site.name,
    footerGame: 'Discover the game', footerCommunity: 'Join our community', copied: 'Copied',
    copyFailed: 'Copy failed',
    released: 'AVAILABLE NOW ON STEAM', trailer: 'Watch the trailer', videoError: 'The trailer could not be loaded. You can watch it on Steam instead.',
    videoLink: 'Watch on Steam', screenshots: 'A glimpse of the world',
    gameIntro: 'AD 182. On the eve of the Yellow Turban Rebellion, create your own character or take the role of a historical warlord. Forge friendships, build your forces, and find your place in a world on the brink of change.',
    gameIntro2: 'Travel as a lone wanderer, or rally legendary generals to your cause. From your first encounter to commanding an army, every choice helps shape your own Three Kingdoms story.',
    aboutTitle: 'Hello. We’re Team Platypus.', aboutSub: 'THE PEOPLE BEHIND THE GAME',
    aboutBody: 'We are the developers of Three Kingdoms: Mushouden. Beginning on the eve of the Yellow Turban Rebellion, our game brings together characters, exploration, progression, and battles in a world where you choose your own path.',
    aboutBody2: 'We publish game updates on Steam and listen to feedback from our player communities. Thank you to everyone who has made this world part of their own story.',
    communityTitle: 'Good stories are worth sharing.', communityIntro: 'Meet fellow players, share your adventures, and let us know what we can improve.',
    qq: 'Official QQ groups', groupNames: ['Player group 1', 'Player group 2', 'Bug reports'],
    groupDescriptions: ['Meet fellow players and explore the world together.', 'Share your strategies, discoveries, and stories.', 'Tell us about issues and help improve the game.'],
    social: 'Follow the latest', joinGroup: 'Join group', copyNumber: 'Copy group number',
    bilibiliDescription: 'Mushouden · Videos & updates',
    notFound: 'A little off the beaten path.', notFoundBody: 'This page could not be found. Head back to the studio for our latest news.', home: 'Back to home',
  },
};
export const features = {
  zh: [
    { title: '乱世之中，自择其路。', text: '游历城镇与乡野，结识三国人物。你可以在江湖中独行，也可以积累声望、结交同伴，为即将到来的动荡做好准备。', image: '/media/game/zhaoyun.webp', label: '探索与角色扮演' },
    { title: '结交英雄，运筹帷幄。', text: '选择你的伙伴与成长路线，建立自己的军事势力和人脉。利用你对三国的了解，在变化的局势中寻找机会。', image: '/media/game/strategy.webp', label: '养成与策略' },
    { title: '从初出茅庐，到驰骋沙场。', text: '从小规模交锋开始，在战斗中成长，再走向更大规模的兵团对抗。调遣队伍，体验冷兵器战场上的攻守与进退。', image: '/media/game/duel.webp', label: '战斗与征程' },
  ],
  en: [
    { title: 'Find your own path.', text: 'Travel through towns and the countryside, and meet figures from the Three Kingdoms. Wander alone or build your reputation and friendships as a new era approaches.', image: '/media/game/zhaoyun.webp', label: 'EXPLORATION & ROLE-PLAYING' },
    { title: 'Forge bonds. Plan your next move.', text: 'Choose your companions and develop your character. Build your forces and connections, using your knowledge of the era to find opportunities in a changing world.', image: '/media/game/strategy.webp', label: 'PROGRESSION & STRATEGY' },
    { title: 'From small beginnings to the battlefield.', text: 'Grow through smaller skirmishes before leading your troops into larger battles. Command your forces and experience the ebb and flow of ancient warfare.', image: '/media/game/duel.webp', label: 'BATTLES & ADVENTURE' },
  ],
};
