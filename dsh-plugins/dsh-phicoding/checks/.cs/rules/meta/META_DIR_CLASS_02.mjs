#!/usr/bin/env node
// META_DIR_CLASS_02 - 接口模块的结构。
//
//   1) */Interfaces/* 下只能放接口；
//   2) 项目内 top-level struct / record struct / enum 必须放本模块配置的原子目录（默认 Models/；可配 Enums/ 等）；
//   3) 抽象类不得出现在 Interfaces/（它属于具体侧）。
//
// 判不了的：delegate 不在 facts 里（底座只收 BaseTypeDeclaration），
// "delegate 放 Models" 与 "Interfaces 里放 delegate" 现在看不到 → 归软审。
// 嵌套 enum：允许嵌套时，只能被包含类型内部使用；嵌套 struct/record struct 按策略处理。
//
// 工程里没有任何 Interfaces/ 目录 → exit 3：本工程未采用模块分层，不算通过。
// 跳过不是放行：软审必须判“未采用标准”，要求迁移或登记项目级豁免。
import { run } from '../../../layout.mjs'

run('structure', 'cs')
