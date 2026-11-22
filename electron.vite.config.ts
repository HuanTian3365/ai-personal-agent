import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * node 侧（main / preload / core）共用的别名。
 * 改这里必须同步改 tsconfig.node.json 的 paths，否则会出现
 * 「能跑但类型报错」或反之。
 *
 * 用数组 + 正则而不是字符串前缀，是因为 core 的对外出口是 `src/core/export.ts`
 * 而不是 `index.ts`：裸 `@core` 要精确落到那个文件，`@core/xxx` 仍走目录。
 * 若写成字符串别名 `'@core': resolve('src/core')`，`from '@core'` 会去目录里找
 * index.ts（已不存在）而解析失败。
 */
const nodeAlias = [
  { find: /^@core$/, replacement: resolve('src/core/export.ts') },
  { find: /^@core\//, replacement: `${resolve('src/core')}/` },
  { find: /^@main$/, replacement: resolve('src/main/export.ts') },
  { find: /^@main\//, replacement: `${resolve('src/main')}/` },
  { find: /^@shared\//, replacement: `${resolve('src/shared')}/` }
]

export default defineConfig({
  main: {
    // 展开而不是直接引用 nodeAlias，避免两个构建共享同一个对象引用
    resolve: { alias: [...nodeAlias] }
  },
  preload: {
    resolve: { alias: [...nodeAlias] }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
