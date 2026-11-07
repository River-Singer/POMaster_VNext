# 第三方声明（@pomaster/studio-react）

React 画廊（仅开发期使用，不进 npm 发布面）收录了以下第三方源码。

## affectUI

- 来源：https://github.com/flohoeller/affectui（提交 3e783211，2026-11-06 取得）
- 收录文件：`src/components/ui/number-ticker.tsx`（原文件 `motion/number-ticker.tsx`）
- 改动：去掉 `"use client"`；`<style>` 不用 React 19 的资源提升属性；ref 回调不返回清理函数（React 18）。
- 许可：MIT

```
MIT License

Copyright (c) 2026 Florian Höller (adfects)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Stageshow（只借鉴做法，未收录源码）

- 来源：https://github.com/benjitaylor/skills/tree/main/stageshow（MIT）
- 用途：规范「设计模式 / 体验管理」里界面静帧、组件动效、Bento 栅格几个领域借鉴了它的取法，条文为自行改写。
