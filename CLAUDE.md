# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Infrastructure + templates for a local CI/CD flow: a Jenkins container (Docker Desktop, Linux containers, Windows host) polls GitHub for pushes to `main` on N public repos and deploys each app as its own container. There is no application code here and no test suite; the "tests" are Docker builds and `curl` checks. Spec and plan live in `docs/superpowers/specs/` and `docs/superpowers/plans/`.

## Commands

```bash
docker compose up -d --build      # start/rebuild Jenkins (http://localhost:8080)
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword   # first run only
docker exec jenkins docker ps     # confirm Jenkins reaches the host Docker daemon
```

Verify an example app without Jenkins (from its folder in `templates/examples/<stack>`):

```bash
docker build -t <app>:test . && docker run -d --rm --name <app>-test -p <HOST_PORT>:<CONTAINER_PORT> <app>:test
curl -fsS http://localhost:<HOST_PORT>/ ; docker stop <app>-test ; docker rmi <app>:test
```

Shell is Git Bash on Windows; prefix `docker exec` with `MSYS_NO_PATHCONV=1` if paths get mangled. `python` is not installed on the host.

## Architecture (needs several files to see)

- `docker-compose.yml` + `jenkins/Dockerfile`: Jenkins LTS image with Docker CLI, running as root with `/var/run/docker.sock` mounted. Apps are therefore **sibling containers** on the host daemon, not nested. `extra_hosts: host.docker.internal:host-gateway` is required: the pipeline's smoke check curls the app through that name (it resolves IPv6-only inside Jenkins; if it ever fails, try `curl -4`).
- `templates/Jenkinsfile.template`: the single pipeline pattern. Only `APP_NAME`, `HOST_PORT`, `CONTAINER_PORT` in `environment` change per repo. Stages: Build (`docker build`) → Deploy (`docker rm -f` then `docker run -d --restart unless-stopped`) → Smoke check (15 × curl, then dump logs and fail). `docker rm -f` deliberately runs after a successful build so a broken build keeps the old container. Trigger is `pollSCM('* * * * *')` (no webhook/tunnel); it only registers after one manual "Build Now".
- `templates/examples/{node,python,dotnet,react}`: each folder is a miniature standalone repo (Dockerfile + Jenkinsfile at its root). Each Jenkinsfile is the template with the 3 variables changed. They are meant to be copied to their own GitHub repo, one Jenkins job per repo (Pipeline script from SCM, branch `*/main`, script path `Jenkinsfile`, no credentials).
- Port map: Jenkins 8080; node 8081→3000; python 8082→5000; dotnet 8083→8080; react 8084→80. Host ports are not validated; a clash fails at `docker run` after the old container was already removed. The 8080 in .NET is the container port, not the host's.

## Gotchas

- `ci-cd-node/`, `ci-cd-dotnet/`, `ci-cd-python/`, `ci-cd-react/` in the root are separate git clones/repos (with their own `origin` under `github.com/ldmo07`), git-ignored here. Changes to them are pushed from inside each folder; pushing to `main` there triggers the Jenkins deploy within ~1–2 min.- `.gitattributes` forces LF; CRLF in a `Jenkinsfile`/`sh` block breaks the pipeline.
- The React app (`:8084`) calls the .NET API (`:8083/personas`) from the browser, so the API has CORS enabled.
- Only Jenkins does CI/CD; do not add GitHub Actions.
- Out of scope by design: webhooks/tunnel, reverse proxy, private repos, registry, multi-node.
