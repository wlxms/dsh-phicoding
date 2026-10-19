#!/usr/bin/env sh
# 把 phicoding 装进全局 Copilot；再跑一次就是更新。
#
#   curl -fsSL https://raw.githubusercontent.com/wlxms/dsh-phicoding/main/install-copilot.sh | sh
#
# 从 GitHub 拉源码，现场构建，然后装到：
#   ~/.copilot/skills/<name>/SKILL.md   VS Code 的个人 Agent Skills
#   ~/.copilot/phicoding/               检查器（Node + Roslyn 语法底座）
#
# 同一个脚本既是安装也是更新：比对内容指纹，没变化就什么都不做，有变化就整份替换。
# 记录写在 <目标>/.installed.json。
#
# 选项（用 sh -s -- 传参）：
#   --ref <branch>        拉哪个分支，默认 main
#   --dest <dir>          安装目录，默认 ${COPILOT_HOME:-$HOME/.copilot}
#   --shared              同时装到 ~/.agents/skills（跨 Agent 开放标准位置）
#   --force               指纹相同也重装一遍
#   --uninstall           卸载（不需要网络）
set -eu

REF=main
DEST="${COPILOT_HOME:-$HOME/.copilot}"
SHARED=0
FORCE=0
UNINSTALL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --ref) REF="$2"; shift 2 ;;
    --dest) DEST="$2"; shift 2 ;;
    --shared) SHARED=1; shift ;;
    --force) FORCE=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    *) echo "未知参数：$1" >&2; exit 2 ;;
  esac
done

MANIFEST="$DEST/.installed.json"
CHECKER="$DEST/phicoding"
SHARED_DIR="$HOME/.agents/skills"

# ---- 卸载：不联网，只删自己装过的东西 --------------------------------------
if [ "$UNINSTALL" -eq 1 ]; then
  for dir in "$DEST/skills" "$SHARED_DIR"; do
    [ -d "$dir" ] || continue
    for path in "$dir"/phicoding*; do
      [ -e "$path" ] || continue
      rm -rf "$path"
      echo "  删除 $path"
    done
  done
  # 不能用 `[ -d x ] && rm`：set -e 下条件为假就会让整个脚本退出。
  if [ -d "$CHECKER" ]; then rm -rf "$CHECKER"; echo "  删除 $CHECKER"; fi
  if [ -f "$MANIFEST" ]; then rm -f "$MANIFEST"; echo "  删除 $MANIFEST"; fi
  echo "已卸载。"
  exit 0
fi

command -v node >/dev/null 2>&1 || {
  echo "没找到 node。本套件需要 Node.js >= 18：https://nodejs.org/" >&2
  exit 1
}

SCRATCH=$(mktemp -d)
trap 'rm -rf "$SCRATCH"' EXIT

echo "▸ 下载源码（$REF）"
curl -fsSL "https://codeload.github.com/wlxms/dsh-phicoding/tar.gz/refs/heads/$REF" -o "$SCRATCH/source.tgz"
mkdir -p "$SCRATCH/src"
tar -xzf "$SCRATCH/source.tgz" -C "$SCRATCH/src"
REPO=$(find "$SCRATCH/src" -mindepth 1 -maxdepth 1 -type d | head -n 1)
[ -n "$REPO" ] || { echo "压缩包里没找到仓库目录" >&2; exit 1; }

echo "▸ 构建 Copilot 套件"
node "$REPO/dsh-plugins/dsh-phicoding/scripts/build-copilot-kit.mjs" "$SCRATCH/kit"

# ---- 比对指纹：安装 / 更新 / 什么都不做 -----------------------------------
field() {
  node -e 'const v=require(process.argv[1]);console.log(v[process.argv[2]]??"")' "$1" "$2"
}
INCOMING_HASH=$(field "$SCRATCH/kit/VERSION.json" hash)
INCOMING_FILES=$(field "$SCRATCH/kit/VERSION.json" files)

if [ -f "$MANIFEST" ] && [ -f "$CHECKER/checks/phicoding.mjs" ] && [ "$FORCE" -eq 0 ]; then
  INSTALLED_HASH=$(field "$MANIFEST" hash)
  if [ "$INSTALLED_HASH" = "$INCOMING_HASH" ]; then
    echo ""
    echo "已是最新（$(printf %.12s "$INCOMING_HASH")，$INCOMING_FILES 个文件），没有改动。"
    echo "要强制重装：再跑一次并加 --force"
    exit 0
  fi
  echo "▸ 更新 $(printf %.12s "$INSTALLED_HASH") → $(printf %.12s "$INCOMING_HASH")"
fi

echo "▸ 安装到 $DEST"
mkdir -p "$DEST/skills"
cp -R "$SCRATCH/kit/.github/skills/." "$DEST/skills/"
echo "  技能 → $DEST/skills"

rm -rf "$CHECKER"
cp -R "$SCRATCH/kit/phicoding" "$CHECKER"
echo "  检查器 → $CHECKER"

RUNNER="$CHECKER/checks/phicoding.mjs"
# 技能正文里写的是抽象的 `phicoding --root <项目>`；这台机器上的真实路径要说清楚，
# 否则 Copilot 会去 PATH 里找一个不存在的命令。
# 每次安装都是先用源文件覆盖、再追加，所以反复更新不会堆出多行。
for name in phicoding phicoding-check; do
  file="$DEST/skills/$name/SKILL.md"
  [ -f "$file" ] || continue
  printf '\n> **本机安装位置**：检查器在 `%s`。运行：`node "%s" --root <项目>`。\n' "$RUNNER" "$RUNNER" >> "$file"
done

if [ "$SHARED" -eq 1 ]; then
  mkdir -p "$SHARED_DIR"
  cp -R "$SCRATCH/kit/.github/skills/." "$SHARED_DIR/"
  echo "  技能 → $SHARED_DIR（跨 Agent 开放标准位置）"
fi

cat > "$MANIFEST" <<EOF
{
  "name": "phicoding-copilot",
  "hash": "$INCOMING_HASH",
  "files": $INCOMING_FILES,
  "ref": "$REF",
  "installedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "destination": "$DEST"
}
EOF

cat <<EOF

装好了（$(printf %.12s "$INCOMING_HASH")）。

  在 VS Code 的 Copilot Chat 里：
    - 直接说「按 phicoding 设计这个功能」，它会自动加载对应技能
    - 或者敲 /phicoding、/phicoding-check 显式调用

  跑检查器：
    node "$RUNNER" --root <你的项目>

  更新：再跑一次本脚本即可（内容没变就什么都不做）
  卸载：再跑一次并加 --uninstall

  还需要：.NET SDK >= 8（检查器首次运行会用 Roslyn 编译语法底座，约 3 秒）
  项目侧配置不用手写：首次运行会在目标仓库自动推断 .phicoding/config.json（trunk / variants / author），不满意再改。
EOF
