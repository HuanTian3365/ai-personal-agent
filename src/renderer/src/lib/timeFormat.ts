// 时间格式化工具 | 纯函数 不依赖 React
// 不足1秒按1秒算 避免界面出现0秒
const MIN_DURATION_MS = 1000

// 两位补零 24小时制
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

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
  return `${date.getFullYear()}年${monthDay} ${clock}`
}
