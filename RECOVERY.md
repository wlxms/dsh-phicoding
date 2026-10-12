# 产物恢复记录

**恢复日期**：2026-10-12
**来源会话**：`session-caabf1f7-71e1-4410-96c0-e4e0a3232b3c`（《构建可强制执行的编码哲学底座》）
**来源文件**：`$DSH_HOME/sessions/--H-Git-dsh-mydsh--/session-caabf1f7-…/session.v4.jsonl.zstd`（5,188,033 B，1029 个 zstd 帧，解压后 21,315,947 B / 2652 条记录）

## 一、丢了什么

`dsh-plugins/dsh-phicoding/` 整个目录被清空（只剩一个空目录，profile 里的 junction 还指着它）。其余产物（`.spine-game`、`.spine-equip`、`.spine-test`、`.backups`、两张图、`spine-equip-v3-source.md`）**都还在磁盘上**，未丢。

排查过但没有副本的地方：profile 的 `.generations/`（不存在）、`.plugin-manager/`、`profiles/web/node_modules`（只是 junction）、回收站（空）。

## 二、怎么恢复的

不是重写，是**按会话记录重放**。

1. 解压会话 JSONL（多帧 zstd，用 `scanZstdFrames` 逐帧解）。
2. 抽出全部会写文件的工具调用：`write` / `edit` / `pwsh`（其中大部分文件是用 pwsh here-string 写的），共 105 个操作。
3. 把这些操作里的绝对根路径**重定向到暂存区**，按会话里的 seq 顺序重放。
4. 被 DSH 文件守卫拒绝过的 3 次调用（`file has not been read` / `file changed since it was read`）**排除**——当时它们没落盘，重放也必须不落盘。

重放全程对真实目录做指纹守卫：**真实路径一个字节都没被改过**。

重放脚本留在 `.recovery-tmp/`（已 gitignore）：`unpack3.mjs`（解压）、`dump-pwsh.mjs`（抽出命令）、`replay2.mjs`（重放）、`fidelity.mjs`（保真对账）、`rejected.mjs`（守卫拒绝清单）。

## 三、恢复保真的证据

不是"看起来对"，是与会话里当时打印出来的数字**逐字节对上**：

| 对账点 | 会话里当时打的 | 重放得到的 |
| --- | --- | --- |
| seq 2014 `verify-provider` | `spine 9402` / `spine-shape 6939` / `spine-check 14878` / `spine-design 9933` | 完全一致（逐行） |
| seq 2046 | `spine-level 5463` / `spine-check 15380` | 完全一致 |
| seq 2142 包内清单 | `check-cycles.mjs 8484` / `graph.mjs 4815` | 完全一致 |
| 终值 | `phicoding 11179 B` / `phicoding-check 12544 B` | **一致** |
| 终值 | `checks/README.md 7109 B` | **一致** |

## 四、恢复后的独立验收

```
node scripts/verify-provider.mjs
  dirs=6  listed=6  loadedBodies=6        VERIFY=PASS

node checks/phicoding.mjs --root .spine-game
  == .cs  27 个文件    底座：types=48  refs=275
  green ×13                              PHICODING=OK   exit 0

node checks/phicoding.mjs --root .spine-game --probe
  ok ×13   每条规则都能自己红一次，且只红自己那一条
```

13 条规则与 `.spine-game/README.md` 里写的一致。

## 五、怎么跑

```powershell
node H:\Git\dsh-mydsh\dsh-plugins\dsh-phicoding\checks\phicoding.mjs --root H:\Git\dsh-mydsh\.spine-game
node H:\Git\dsh-mydsh\dsh-plugins\dsh-phicoding\checks\phicoding.mjs --root H:\Git\dsh-mydsh\.spine-game --probe
node H:\Git\dsh-mydsh\dsh-plugins\dsh-phicoding\checks\phicoding.mjs --list
```

首次运行会编译 C# 底座（Roslyn，约 3 秒，要联网拉 NuGet 包）。编译结果缓存在 `checks/.cs/.build/`，不进版本库。

**如果报 `EPERM` / `无法获取锁定文件访问权限`**：这是受限令牌下 `%TEMP%\NuGetScratch` 不可写，把 TEMP 指到别处即可：

```powershell
$env:TEMP = 'H:\Git\dsh-mydsh\.recovery-tmp\temp'; $env:TMP = $env:TEMP
```

## 六、还没做的一步：装回 profile

profile 组装也被那次修复重置了——`profiles/web/package.json` 的 `dependencies` 与 `bundles` 里**都没有** `dsh-phicoding`，只剩一个孤儿 junction。所以技能现在**还不是常驻的**。

在**普通终端**里跑（本会话的 pwsh 在创建符号链接时被沙箱拒绝，装不了）：

```powershell
dsh plugin --profile web add H:\Git\dsh-mydsh\dsh-plugins\dsh-phicoding
```

失败时 profile 的 `package.json` 未被改动（已确认），可以直接重试。装完新开一个会话，6 个技能才会出现在目录里。

## 七、git

仓库根在 `H:\Git\dsh-mydsh`（本文件所在目录）。只跟踪本会话的产物；无关的独立检出（`dsh-desktop-official` 等）与构建产物（`bin`/`obj`/`.build`/`node_modules`）在 `.gitignore` 里排除。

`core.autocrlf=false`，字节原样保存——恢复出来的文件与会话里的字节完全一致，不希望在提交时被改写行尾。

## 八、一处提醒

`.spine-game/.phicoding/config.json` 里写着 `"author": "Administrator"`——那是当时**没有版本管理**时的取值（规则：有版本管理取 VCS 用户名，没有才取系统用户名）。现在这里有了 git，VCS 用户名是 `wlxms`，之后的追溯注释按规则应当用它。
