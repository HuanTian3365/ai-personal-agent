// 复制文字到剪贴板 -> 成功true 失败false
// 优先clipboard API 打包后file://下不可用时回退execCommand
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard !== undefined) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 无权限或非安全上下文 继续走回退
    }
  }
  return copyByExecCommand(text)
}

// 老办法 | 建临时textarea选中后复制 用完即删
function copyByExecCommand(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text
  // 移出视口 避免页面滚动
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  textarea.setAttribute('readonly', '')
  document.body.appendChild(textarea)
  textarea.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}
