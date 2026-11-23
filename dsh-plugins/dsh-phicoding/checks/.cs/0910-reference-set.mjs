#!/usr/bin/env node
// 0910 - 概念层引用集合。
//
// 声明在模块 M 的接口可以引用：
//   * 接口（任意模块，方向交给 0920）；
//   * 数据原子：struct / record struct / enum（放 Models/，位置由 0900 判）；
//   * 外部具体类：M 之外的 class / record，作为已知事实；
//   * BCL / 工程外类型（facts 里没有，直接忽略）。
//
// 不许引用：**M 自己的 class / record**（含作为共享实现的 abstract class）。
// 这是"概念层自闭合"的机械面：不依赖本模块实现；外部具体类不算闭合破坏。
//
// 判不了的：delegate 不在 facts；同名类型按名字查会串 → exit 3，不猜。
import { run } from '../layout.mjs'

run('references')
