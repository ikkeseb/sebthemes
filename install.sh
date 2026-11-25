#!/bin/bash
# Install sebthemes into Omarchy, or bring them up to date.
#
#   curl -fsSL https://raw.githubusercontent.com/ikkeseb/sebthemes/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/ikkeseb/sebthemes/main/install.sh | bash -s seb-organic
#
# Every theme is published as a branch of its own, holding just that theme. Each one is cloned
# into ~/.config/omarchy/themes/<theme>, exactly where `omarchy theme install` puts a theme, so
# Omarchy treats it as any installed theme: it shows in Appearance > Theme, Update > Extra Themes
# pulls it, and Remove > Theme removes it.
#
# With no theme named it installs every theme and updates the ones already here, so running the
# same line again also brings in themes added since. Naming one installs it and switches to it.
set -euo pipefail

REPO="${SEBTHEMES_REPO:-https://github.com/ikkeseb/sebthemes.git}"
THEMES_DIR="$HOME/.config/omarchy/themes"

command -v git >/dev/null || { echo "sebthemes needs git" >&2; exit 1; }
mkdir -p "$THEMES_DIR"

if (($#)); then
  themes=("$@")
else
  mapfile -t themes < <(git ls-remote --heads "$REPO" | sed -n 's#.*refs/heads/##p' | grep -vx main)
  ((${#themes[@]})) || { echo "no themes found at $REPO" >&2; exit 1; }
fi

active=$(cat "$HOME/.local/state/omarchy/current/theme.name" 2>/dev/null || true)
refresh=""
fresh=0
ours=()

for theme in "${themes[@]}"; do
  if ! (LC_ALL=C; [[ $theme =~ ^[a-z0-9][a-z0-9._-]*$ && $theme != main ]]); then
    echo "skipped $theme: not a theme name" >&2; continue
  fi
  dir="$THEMES_DIR/$theme"

  if [[ -e $dir || -L $dir ]]; then
    origin=$(git -C "$dir" remote get-url origin 2>/dev/null || true)
    branch=$(git -C "$dir" symbolic-ref --short -q HEAD 2>/dev/null || true)
    if [[ -L $dir || ! -d $dir/.git || ${origin%.git} != "${REPO%.git}" || $branch != "$theme" ]]; then
      echo "skipped $theme: $dir is not a sebthemes install (remove it first to install ours)" >&2
      continue
    fi
    before=$(git -C "$dir" rev-parse HEAD)
    git -C "$dir" pull -q --ff-only
    if [[ $(git -C "$dir" rev-parse HEAD) == "$before" ]]; then
      echo "up to date  $theme"
    else
      echo "updated     $theme"
    fi
  else
    git clone -q --depth 1 --single-branch --branch "$theme" -- "$REPO" "$dir"
    echo "installed   $theme"
    fresh=1
  fi
  ours+=("$theme")
  # The active theme runs from a staged copy, which a pull here or by Update > Extra Themes leaves
  # as it was; setting the theme again stages its new wallpapers.
  staged="$HOME/.local/state/omarchy/current/theme/backgrounds"
  if [[ $theme == "$active" && -d $staged ]] && ! diff -rq "$dir/backgrounds" "$staged" >/dev/null 2>&1; then
    refresh=$theme
  fi
done

if (($# == 1)) && [[ ${ours[0]:-} == "$1" ]] && command -v omarchy >/dev/null; then
  omarchy theme set "$1"
elif [[ -n $refresh ]] && command -v omarchy >/dev/null; then
  omarchy theme set "$refresh"
elif ((fresh)); then
  echo "Pick one in the Omarchy menu: Appearance > Theme."
fi
