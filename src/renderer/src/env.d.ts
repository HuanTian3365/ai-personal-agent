/// <reference types="vite/client" />
// ↑ 这是「三斜线指令」，不是普通注释，删掉会让 TS 不认识下面这些东西：
//   - import.meta.env（Vite 注入的环境变量）
//   - `?asset`、`?url`、`?raw` 这类资源导入后缀
//   - 各种 *.css / *.svg 的模块声明
// 换句话说：这个文件是让「非 TS 的资源」也能被 TS 类型检查识别的地方。
