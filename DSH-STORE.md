# DSH Store 提交说明

这个仓库现在只有一个 DSH Bundle：`dsh-plugins/dsh-phicoding`。
旧的 `dsh-design-skills` 已经移除，仓库不再包含第二个 DSH 插件。

上架时**必须**提交显式包路径（仓库根没有 `package.json`）：

`https://github.com/wlxms/dsh-phicoding/tree/main/dsh-plugins/dsh-phicoding`

DSH Store 的自动预检需要从固定 Commit 定位 manifest；单包后不会再出现
`SUBMISSION_PACKAGE_AMBIGUOUS` 的两个候选，但仓库根不是 DSH 包，仍不能只交根地址。

## 当前兼容声明

`dsh-phicoding/package.json` 已声明：

- `engines.node`: `>=18`
- `engines.dsh`: `0.2.1-alpha.5 || 0.2.1-rc.1 || 0.2.1-rc.2 || 0.2.2-rc.5 || 0.2.3-alpha.1 || 0.2.3-alpha.2`
- `dsh.compatibility.dsh`: 与 `engines.dsh` 相同的精确版本列表
- `dsh.compatibility.dshReleases`: 上述每个完整版本都显式写 `compatible`
- `dsh.compatibility.dshOperations`: 每个版本的四项操作先如实写 `unknown`

`dshReleases` 是**来源兼容声明**，不是真实 Profile 验收；`dshOperations` 只有在一次性
Profile 里实际跑过 install / start / uninstall / rollback 后才能改成 `passed`。
不要为了过预检把没跑过的操作写成 passed。

## 一次性 Profile 验收（拿到 dshOperations 证据）

在**临时 `DSH_HOME`** 里做，不写真实 Profile：

```powershell
$env:DSH_HOME = Join-Path $env:TEMP ("dsh-compat-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $env:DSH_HOME | Out-Null

# 1) 安装
dsh plugin --profile compat add "D:\dsh-mydsh\dsh-phicoding\dsh-plugins\dsh-phicoding"
if ($LASTEXITCODE -ne 0) { throw 'install failed' }

# 2) 启动 / 读配置
dsh --profile compat --dump-config
if ($LASTEXITCODE -ne 0) { throw 'start failed' }

# 3) 卸载
dsh plugin --profile compat remove dsh-phicoding
if ($LASTEXITCODE -ne 0) { throw 'uninstall failed' }

# 4) 清理临时 Profile
Remove-Item -Recurse -Force $env:DSH_HOME
```

每个目标 DSH 版本重复一次，把实际结果填进对应版本的 `dshOperations`。
命令参数以你本机 DSH CLI 的 `dsh plugin --help` 为准；不同 DSH 版本的 remove
子命令可能略有差异。

## 复检

1. 把 manifest 和本文件推到默认分支；
2. 在提交表里填显式包路径（或重新提交该路径）；
3. 自动化会读取新的固定 Commit，重新检查 manifest / 兼容声明 / Bundle；
4. **不需要为了兼容证据强行升 SemVer**；源更新后旧 Commit 的证据不会沿用。

如果以后又拆出独立的 DSH 包，再为它单独提交显式包路径；当前只需提交
`dsh-phicoding` 这一个。
