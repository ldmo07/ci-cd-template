# Jenkins local CI/CD para N repos de GitHub — Diseño

Fecha: 2026-10-06

## Objetivo

Push a `main` en cualquiera de N repos públicos de GitHub dispara un pipeline en Jenkins (contenedor Docker, local). El pipeline construye la imagen del repo y despliega la app en su propio contenedor, en el mismo host Docker.

## Decisiones acordadas

| Tema | Decisión |
|---|---|
| Trigger | Polling SCM (`* * * * *`), sin túnel/webhook. Solo rama `main`. |
| Jobs | Un job manual por repo (pipeline from SCM). Repos públicos, sin credenciales. |
| Build | Cada repo trae `Dockerfile` y `Jenkinsfile`. Jenkins hace `docker build` + `docker run` en el host vía socket montado. |
| Exposición | Puerto fijo por app en el host, definido en cada `Jenkinsfile`. |
| Stacks | Node, Python, .NET (C#). Todo por Docker; Jenkins no instala runtimes. |
| CI | Solo Jenkins. No se usa GitHub Actions. |

## 1. Infraestructura (este repo)

- `docker-compose.yml`: servicio `jenkins` (puerto 8080, volumen `jenkins_home`, montaje `/var/run/docker.sock`).
- `jenkins/Dockerfile`: `jenkins/jenkins:lts` + Docker CLI.
- `jenkins/plugins.txt`: `git`, `workflow-aggregator`, `docker-workflow`.
- `README.md`: arranque, desbloqueo inicial, cómo crear un job nuevo.
- Plataforma: Docker Desktop en Windows (Linux containers). Contenedor Jenkins con acceso al socket (root o GID del socket).
- Los contenedores de las apps son hermanos de Jenkins (corren en el Docker del host).

## 2. Pipeline por repo

`Jenkinsfile` declarativo:
1. Checkout de `main`.
2. Build: `docker build -t <app>:<BUILD_NUMBER> -t <app>:latest .`
3. Deploy: `docker rm -f <app>` y `docker run -d --name <app> -p <HOST_PORT>:<CONTAINER_PORT> --restart unless-stopped <app>:latest`.
4. Smoke check: `curl` al puerto; fallo marca el build en rojo.

Trigger: `pollSCM('* * * * *')` en el `Jenkinsfile`; el job apunta a la rama `main`.

## 3. Plantillas y ejemplos (`templates/`)

- `Jenkinsfile.template`: variables `APP_NAME`, `HOST_PORT`, `CONTAINER_PORT`; solo se editan esas.
- `examples/node/`: Express, `node:lts-alpine`, puerto 3000.
- `examples/python/`: Flask, `python:3-slim`, puerto 5000.
- `examples/dotnet/`: ASP.NET Core, multi-stage (`sdk` → `aspnet`), puerto 8080.

Cada ejemplo incluye app mínima, `Dockerfile` y `Jenkinsfile`.

Puertos: los de arriba son `CONTAINER_PORT` (internos, no chocan con nada). El host reserva 8080 para Jenkins; `HOST_PORT` de las apps empieza en 8081 (ejemplos: node 8081, python 8082, dotnet 8083).

## Manejo de errores

- El `docker rm -f` va después del build exitoso: si el build falla, el contenedor anterior sigue corriendo.
- Smoke check fallido deja el build en rojo.
- Choques de puerto entre apps los gestiona el usuario (puertos fijos).

## Verificación

Prueba de punta a punta: levantar Jenkins, crear un job apuntando a un repo de ejemplo, hacer push a `main`, comprobar que Jenkins detecta el commit (≤1 min), construye, despliega y la app responde.

## Fuera de alcance

Webhooks/túnel, reverse proxy, repos privados/credenciales, Jenkins multi-nodo, registry de imágenes, despliegue remoto.
