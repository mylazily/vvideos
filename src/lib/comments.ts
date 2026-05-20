// 影视评论语料库 - 自动注入到视频详情页提升文本密度
export const COMMENT_POOL: { text: string; type: 'positive' | 'neutral' }[] = [
  // 正面评论
  { text: '这部剧真的太好看了，强烈推荐！', type: 'positive' },
  { text: '看了三遍了，每次都有新发现', type: 'positive' },
  { text: '演员演技在线，剧情也很紧凑', type: 'positive' },
  { text: '大结局反转绝了，完全没想到', type: 'positive' },
  { text: '画质很清晰，播放也很流畅', type: 'positive' },
  { text: '朋友推荐的，果然没让我失望', type: 'positive' },
  { text: '周末一口气刷完了，根本停不下来', type: 'positive' },
  { text: '配乐很好听，氛围感拉满', type: 'positive' },
  { text: '比预期的好看很多，超出预期', type: 'positive' },
  { text: '这个导演的作品质量一直很稳定', type: 'positive' },
  { text: '特效做得不错，国产片进步很大', type: 'positive' },
  { text: '剧情节奏把握得很好，不拖沓', type: 'positive' },
  { text: '主演颜值和演技都在线，追定了', type: 'positive' },
  { text: '开头有点慢，但是后面越来越精彩', type: 'positive' },
  { text: '看完心情久久不能平静，太震撼了', type: 'positive' },
  { text: '和家人一起看的，全家都喜欢', type: 'positive' },
  { text: '台词很经典，值得二刷', type: 'positive' },
  { text: '场景布置很用心，细节满分', type: 'positive' },
  { text: '悬疑感很强，一直猜不到结局', type: 'positive' },
  { text: '笑点和泪点都有，很感人', type: 'positive' },
  // 中性评论
  { text: '整体还不错，有些地方可以更好', type: 'neutral' },
  { text: '前半段好看，后半段有点赶', type: 'neutral' },
  { text: '适合无聊的时候看看', type: 'neutral' },
  { text: '中规中矩吧，不算差也不算惊艳', type: 'neutral' },
  { text: '有些情节有点不合理，但总体还行', type: 'neutral' },
  { text: '节奏偏慢，但故事本身不错', type: 'neutral' },
  { text: '演员阵容很强大，剧情一般般', type: 'neutral' },
  { text: '看完了，感觉还行吧', type: 'neutral' },
  { text: '比同类型的其他作品好一些', type: 'neutral' },
  { text: '打发时间不错的选择', type: 'neutral' },
  // 时间相关
  { text: '昨晚熬夜看完的，今天精神不太好哈哈', type: 'positive' },
  { text: '等更新等了好久，终于来了', type: 'positive' },
  { text: '刚看完最新一集，太精彩了', type: 'positive' },
  { text: '每天追一集，已经养成习惯了', type: 'positive' },
  // 推荐相关
  { text: '喜欢这种类型的可以看看，不会后悔', type: 'positive' },
  { text: '如果你喜欢悬疑片，这部一定不能错过', type: 'positive' },
  { text: '同类型的里面算是上乘之作了', type: 'positive' },
  { text: '安利给所有朋友了，都说好看', type: 'positive' },
  // 高能提示
  { text: '23分钟开始高能，强推！', type: 'positive' },
  { text: '注意看第15分钟，有反转', type: 'positive' },
  { text: '最后一集千万别跳片头', type: 'positive' },
  { text: '彩蛋在片尾字幕之后，别错过', type: 'positive' },
];

// 用户名池
const USER_NAMES = [
  '影迷小王', '追剧达人', '电影爱好者', '剧荒救星', '深夜追剧人',
  '周末影院', '爆米花少女', '沙发土豆', '影视通', '老司机带路',
  '吃瓜群众', '路人甲', '匿名用户', '资深影迷', '新晋粉丝',
  '佛系观众', '认真看剧', '随便看看', '专业影评', '业余评论员'
];

// 根据视频信息生成确定性评论（同一视频每次生成相同评论）
export function generateComments(videoId: string, count: number = 6): { user: string; text: string; time: string; type: string }[] {
  const seed = hashCode(videoId);
  const comments: { user: string; text: string; time: string; type: string }[] = [];
  
  for (let i = 0; i < count; i++) {
    const idx = (seed + i * 7) % COMMENT_POOL.length;
    const comment = COMMENT_POOL[idx];
    const userIdx = (seed + i * 3) % USER_NAMES.length;
    const daysAgo = (seed + i * 13) % 90 + 1;
    
    comments.push({
      user: USER_NAMES[userIdx],
      text: comment.text,
      time: formatTimeAgo(daysAgo),
      type: comment.type
    });
  }
  
  return comments;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function formatTimeAgo(daysAgo: number): string {
  if (daysAgo === 1) return '1天前';
  if (daysAgo < 7) return daysAgo + '天前';
  if (daysAgo < 30) return Math.floor(daysAgo / 7) + '周前';
  if (daysAgo < 90) return Math.floor(daysAgo / 30) + '个月前';
  return '3个月前';
}
