export const normalizePlatformName = (platformStr?: string): string => {
  if (!platformStr) return '其他';
  const p = platformStr.trim().toLowerCase();
  if (p.includes('蝦皮') || p.includes('shopee')) return '蝦皮';
  if (p.includes('momo')) return 'MOMO';
  if (p.includes('露天') || p.includes('ruten')) return '露天';
  if (p.includes('yahoo') || p.includes('奇摩')) return 'Yahoo';
  if (p.includes('pchome')) return 'PChome';
  if (p.includes('樂天') || p.includes('rakuten')) return '樂天';
  if (p.includes('官網')) return '官網';
  return platformStr.trim();
};
