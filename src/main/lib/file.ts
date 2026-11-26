/**
 * 文件操作
 *
 * 放main不放shared: shared被renderer一起打包(web的tsconfig也include src/shared),
 * 而node:fs进renderer构建不报错 - vite只warning一句, 把模块外部化成空对象({}),
 * 炸在运行时, 而typecheck和build全绿拦不住.
 *
 * core也不引它: 依赖方向是main -> core, core反向引main就成反向依赖.
 * core自己那两处建目录(tools/impl/file.ts | lib/log.ts)在core内直接裸调mkdir.
 *
 * sync只留给判断类(exists): 拿到结果要立刻分支 | 动磁盘的一律async.
 */
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'

/**
 * 校验路径是否存在
 *
 * 文件|目录|符号链接都算存在; 路径无权访问也算false(node的语义)
 *
 * @param target 路径 相对路径按进程cwd解析
 */
export function validPath(target: string): boolean {
  return existsSync(target)
}

/**
 * 创建目录
 *
 * 父级不存在会一起建; 目录已存在不算失败, 重复调用无副作用.
 *
 * @param dir 目录路径 相对路径按进程cwd解析
 */
export async function createDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}
