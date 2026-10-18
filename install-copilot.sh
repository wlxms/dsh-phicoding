#!/usr/bin/env sh
# 把 phicoding 一键装进全局 Copilot（个人技能 + 检查器）。
#
#   curl -fsSL https://raw.githubusercontent.com/wlxms/dsh-phicoding/main/install-copilot.sh | sh
#
# 从 GitHub 拉源码，现场构建套件，然后装到：
#   ~/.copilot/skills/<name>/SKILL.md   VS Code 的个人 Agent Skills
#   ~/.copilot/phicoding/               检查器（Node + Roslyn 语法底座）
#
# 选项（用 sh -s -- 传参）：
#   --ref <branch>        拉哪个分支，默认 main
#   --dest <dir>          安装目录，默认 ${COPILOT_HOME:-$HOME/.copilot}
#   --shared              同时装到 ~/.agents/skills（跨 Agent 开放标准位置）
set -eu

REF=main
DEST="${COPILOT_HOME:-$HOME/.copilot}"
SHARED=0

while [ $# -gt 0 ]; do
  case "$1" in
    --ref) REF="$2"; shift 2 ;;
    --dest) DEST="$2"; shift 2 ;;
    --shared) SHARED=1; shift ;;
    *) echo "未知参数：$1" >&2; exit 2 ;;
  esac
done

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

echo "▸ 安装到 $DEST"
mkdir -p "$DEST/skills"
cp -R "$SCRATCH/kit/.github/skills/." "$DEST/skills/"
echo "  技能 → $DEST/skills"

rm -rf "$DEST/phicoding"
cp -R "$SCRATCH/kit/phicoding" "$DEST/phicoding"
echo "  检查器 → $DEST/phicoding"

RUNNER="$DEST/phicoding/checks/phicoding.mjs"
# 技能正文里写的是抽象的 `phicoding --root <项目>`；这台机器上的真实路径要说清楚，
# 否则 Copilot 会去 PATH 里找一个不存在的命令。
for name in phicoding phicoding-check; do
  file="$DEST/skills/$name/SKILL.md"
  [ -f "$file" ] || continue
  printf '\n> **本机安装位置**：检查器在 `%s`。运行：`node "%s" --root <项目>`。\n' "$RUNNER" "$RUNNER" >> "$file"
done

if [ "$SHARED" -eq 1 ]; then
  mkdir -p "$HOME/.agents/skills"
  cp -R "$SCRATCH/kit/.github/skills/." "$HOME/.agents/skills/"
  echo "  技能 → $HOME/.agents/skills（跨 Agent 开放标准位置）"
fi

cat <<EOF

装好了。

  在 VS Code 的 Copilot Chat 里：
    - 直接说「按 phicoding 设计这个功能」，它会自动加载对应技能
    - 或者敲 /phicoding、/phicoding-check 显式调用

  跑检查器：
    node "$RUNNER" --root <你的项目>

  还需要：.NET SDK >= 8（检查器首次运行会用 Roslyn 编译语法底座，约 3 秒）
  项目侧配置：在目标仓库建 .phicoding/config.json，写明 trunk / variants / author
EOF
