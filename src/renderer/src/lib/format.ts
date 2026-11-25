// 时间格式化工具 | 纯函数 不依赖 React
// 不足1秒按1秒算 避免界面出现0秒
const MIN_DURATION_MS = 1000

// 用时格式化 -> 分段输出时/分/秒 | 不足1秒按1秒算
// 例: 999 -> 1秒 | 65000 -> 1分5秒 | 3723000 -> 1时2分3秒
export function formatDuration(ms: number): string {
  const safeMs = Number.isFinite(ms) ? ms : 0
  const total = Math.floor(Math.max(MIN_DURATION_MS, safeMs) / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor(total / 60) % 60
  const seconds = total % 60

  const parts: string[] = []
  // 高位为0的段省略 秒段始终保留
  if (hours > 0) parts.push(` ${hours} 时`)
  if (total >= 60) parts.push(` ${minutes} 分`)
  parts.push(` ${seconds} 秒`)
  return parts.join('')
}

// 时刻格式化 -> 当天HH:mm | 今年M月D日 HH:mm | 往年Y年M月D日 HH:mm
// now 为参照时刻 默认当前时间 测试时可传入
export function formatClock(time: number | Date, now: number | Date = Date.now()): string {
  const date = time instanceof Date ? time : new Date(time)
  const ref = now instanceof Date ? now : new Date(now)
  const clock = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`

  const isSameDay =
    date.getFullYear() === ref.getFullYear() &&
    date.getMonth() === ref.getMonth() &&
    date.getDate() === ref.getDate()
  if (isSameDay) return clock

  const monthDay = `${date.getMonth() + 1}月${date.getDate()}日`
  if (date.getFullYear() === ref.getFullYear()) return `${monthDay} ${clock}`

  // 两位补零 24小时制
  function pad2(n: number): string {
    return String(n).padStart(2, '0')
  }

  return `${date.getFullYear()}年${monthDay} ${clock}`
}

// 用量格式化 -> convert为true时自动进位到K/M 否则原样千分位输出 | 不足1000一律用原数
// 例: (1496,true) -> 1.5K tok | (1234567,true) -> 1.2M tok | (1496,false) -> 1,496 tok
export function formatTokenCount(count: number, convert = false): string {
  const safe = Number.isFinite(count) && count > 0 ? Math.round(count) : 0
  // 不自动进位或者不足1000 直接用原数
  if (!convert || safe < 1000) return ` ${withThousands(safe)} tok`
  // 千位取整后会顶到1000K的 直接升到M 免得出现1,000K
  if (Math.round(safe / 1000) >= 1000) return ` ${scale(safe, 1000000, 'M')} tok`
  return ` ${scale(safe, 1000, 'K')} tok`

  // 按单位换算 | 100以下保留一位小数 再大取整
  function scale(value: number, unit: number, suffix: string): string {
    const n = value / unit
    const text = n < 100 ? n.toFixed(1).replace(/\.0$/, '') : withThousands(Math.round(n))
    return text + suffix
  }

  // 整数加千分位 | 1235 -> 1,235
  function withThousands(n: number): string {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }
}
