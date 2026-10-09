#!/bin/sh

set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$repo_dir"

if [ -n "$(git status --porcelain)" ]; then
	echo "Refusing to deploy: the server checkout has uncommitted files." >&2
	exit 1
fi

git fetch origin main
git checkout main
git pull --ff-only origin main

compose() {
	sudo docker compose --env-file server/deploy/.env -f server/deploy/compose.yaml "$@"
}

compose config --quiet
compose up -d --build --remove-orphans
# Bind-mounted configuration contents are not part of Compose's service hash.
# Recreate the edge so a changed Caddyfile is always loaded from this checkout.
compose up -d --force-recreate caddy
compose ps

origin=$(sed -n 's/^SEAMETRY_API_ORIGIN=//p' server/deploy/.env | tr -d '\r' | tail -n 1)
case "$origin" in
	http://*|https://*) ;;
	*)
		echo "SEAMETRY_API_ORIGIN must be an absolute HTTP or HTTPS origin." >&2
		exit 1
		;;
esac

curl --fail --silent --show-error "$origin/v1/status"
curl --fail --silent --show-error "$origin/api/auth/ok"
printf '\nDeployed %s\n' "$(git rev-parse --short HEAD)"
