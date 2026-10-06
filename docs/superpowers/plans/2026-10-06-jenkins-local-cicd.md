# Jenkins local CI/CD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jenkins en Docker (local) que, por polling SCM, detecta pushes a `main` de N repos públicos de GitHub, construye su imagen y despliega cada app en su propio contenedor.

**Architecture:** Un contenedor Jenkins (imagen custom con Docker CLI) con el socket del host montado lanza contenedores hermanos. Cada repo trae `Dockerfile` + `Jenkinsfile` (basado en una plantilla con 3 variables). Un job Pipeline-from-SCM manual por repo.

**Tech Stack:** Docker Desktop (Linux containers, Windows host), Jenkins LTS (JDK 21), Declarative Pipeline, Node (Express), Python (Flask + gunicorn), .NET 8 (ASP.NET Core minimal API).

**Spec:** `docs/superpowers/specs/2026-10-06-jenkins-local-cicd-design.md`

## Global Constraints

- Trigger: `pollSCM('* * * * *')`, solo rama `main`. Sin webhooks ni túnel.
- Un job manual por repo; repos públicos, sin credenciales.
- Cada repo trae `Dockerfile` y `Jenkinsfile`; Jenkins no instala runtimes de Node/Python/.NET.
- Puerto de host fijo por app: Jenkins reserva 8080; apps desde 8081 (node 8081, python 8082, dotnet 8083).
- `CONTAINER_PORT` ejemplos: node 3000, python 5000, dotnet 8080.
- Solo Jenkins hace CI/CD; no GitHub Actions.
- `docker rm -f <app>` va DESPUÉS de un `docker build` exitoso.
- Smoke check final con `curl`; fallo deja el build en rojo.
- Plataforma: Docker Desktop Windows, Linux containers; contenedor Jenkins como root con `/var/run/docker.sock` montado.

## Review Focus

- Build falla (Dockerfile roto): el contenedor anterior debe seguir corriendo.
- Puerto de host ya ocupado por otra app: `docker run` falla, build en rojo con error claro (el contenedor viejo de esa app ya fue removido; se documenta).
- Fin de línea CRLF en `Jenkinsfile`/`Dockerfile` desde Windows rompe los `sh`: `.gitattributes` fuerza LF.
- App lenta en arrancar: el smoke check reintenta, no falla al primer intento.
- Dos pollings/builds simultáneos del mismo repo: `disableConcurrentBuilds()`.
- Reinicio de Jenkins/Docker: jobs persisten (`jenkins_home`) y apps vuelven (`--restart unless-stopped`).
- Repo con rama `master` o sin `Jenkinsfile`: el README documenta `*/main` y `Script Path`.

---

## File Structure

```
CI-CD/
  .gitattributes
  .gitignore
  docker-compose.yml
  README.md
  jenkins/
    Dockerfile
    plugins.txt
  templates/
    Jenkinsfile.template
    examples/
      node/    (server.js, package.json, Dockerfile, .dockerignore, Jenkinsfile)
      python/  (app.py, requirements.txt, Dockerfile, .dockerignore, Jenkinsfile)
      dotnet/  (Program.cs, example.csproj, Dockerfile, .dockerignore, Jenkinsfile)
```

Cada `examples/*` es un repo en miniatura: se copia a su propio repo de GitHub.

---

### Task 1: Infraestructura Jenkins

**Files:**
- Create: `.gitattributes`, `.gitignore`, `jenkins/Dockerfile`, `jenkins/plugins.txt`, `docker-compose.yml`

**Interfaces:**
- Produces: Jenkins en `http://localhost:8080`, con Docker CLI funcional contra el daemon del host y `host.docker.internal` resolviendo al host (lo usa el smoke check de Task 2).

- [ ] **Step 1: Crear `.gitattributes` y `.gitignore`**

`.gitattributes`:
```
* text=auto eol=lf
```
`.gitignore`:
```
jenkins_home/
*.log
```

- [ ] **Step 2: Crear `jenkins/plugins.txt`**

```
git
workflow-aggregator
docker-workflow
```

- [ ] **Step 3: Crear `jenkins/Dockerfile`**

```dockerfile
FROM jenkins/jenkins:lts-jdk21
USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends docker-ce-cli \
 && rm -rf /var/lib/apt/lists/*
COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt
```

- [ ] **Step 4: Crear `docker-compose.yml`**

```yaml
services:
  jenkins:
    build: ./jenkins
    container_name: jenkins
    user: root
    restart: unless-stopped
    ports:
      - "8080:8080"
      - "50000:50000"
    volumes:
      - jenkins_home:/var/jenkins_home
      - /var/run/docker.sock:/var/run/docker.sock
    extra_hosts:
      - "host.docker.internal:host-gateway"

volumes:
  jenkins_home:
```

- [ ] **Step 5: Levantar y verificar (falla antes de existir los archivos, pasa ahora)**

Run: `docker compose up -d --build`
Expected: imagen construida, contenedor `jenkins` en estado `Up`.

Run: `docker exec jenkins docker ps`
Expected: tabla de contenedores (incluye `jenkins`), sin error de permisos.

Run: `docker exec jenkins curl -sS -o /dev/null -w "%{http_code}" http://localhost:8080/login`
Expected: `200` (puede tardar ~1 min tras el arranque; reintentar).

Run: `docker exec jenkins getent hosts host.docker.internal`
Expected: una IP.

- [ ] **Step 6: Setup inicial de Jenkins (manual)**

Run: `docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword`
Abrir `http://localhost:8080`, pegar la clave, elegir "Install suggested plugins" (o "Select plugins to install" y confirmar que `git`, `workflow-aggregator`, `docker-workflow` están), crear usuario admin.
Expected: dashboard de Jenkins visible.

- [ ] **Step 7: Commit** (requiere `git init` previo si aún no es repo)

```bash
git add .gitattributes .gitignore jenkins docker-compose.yml
git commit -m "feat: jenkins container with docker cli and socket mount"
```

---

### Task 2: Plantilla `Jenkinsfile.template`

**Files:**
- Create: `templates/Jenkinsfile.template`

**Interfaces:**
- Consumes: Jenkins de Task 1 (`host.docker.internal`, Docker CLI).
- Produces: pipeline con variables `APP_NAME`, `HOST_PORT`, `CONTAINER_PORT` en el bloque `environment`; los examples de Tasks 3-5 son copias con esas 3 líneas cambiadas.

- [ ] **Step 1: Crear la plantilla**

```groovy
pipeline {
    agent any

    options {
        disableConcurrentBuilds()
        timeout(time: 15, unit: 'MINUTES')
    }

    triggers {
        pollSCM('* * * * *')
    }

    environment {
        // Editar solo estas 3 líneas por repo
        APP_NAME       = 'my-app'
        HOST_PORT      = '8081'
        CONTAINER_PORT = '3000'
    }

    stages {
        stage('Build') {
            steps {
                sh 'docker build -t ${APP_NAME}:${BUILD_NUMBER} -t ${APP_NAME}:latest .'
            }
        }

        stage('Deploy') {
            steps {
                sh '''
                    docker rm -f ${APP_NAME} || true
                    docker run -d --name ${APP_NAME} \
                        -p ${HOST_PORT}:${CONTAINER_PORT} \
                        --restart unless-stopped \
                        ${APP_NAME}:latest
                '''
            }
        }

        stage('Smoke check') {
            steps {
                sh '''
                    for i in $(seq 1 15); do
                        if curl -fsS http://host.docker.internal:${HOST_PORT}/ > /dev/null; then
                            echo "App ${APP_NAME} OK en puerto ${HOST_PORT}"
                            exit 0
                        fi
                        sleep 2
                    done
                    echo "Smoke check fallo para ${APP_NAME}"
                    docker logs --tail 50 ${APP_NAME} || true
                    exit 1
                '''
            }
        }
    }
}
```

- [ ] **Step 2: Verificar sintaxis contra Jenkins**

Run (bash, desde el host; usa el usuario admin creado en Task 1, reemplazar `USER:PASS`):
```bash
curl -s -u USER:PASS -X POST -F "jenkinsfile=<templates/Jenkinsfile.template" http://localhost:8080/pipeline-model-converter/validate
```
Expected: `Jenkinsfile successfully validated.`

- [ ] **Step 3: Commit**

```bash
git add templates/Jenkinsfile.template
git commit -m "feat: add Jenkinsfile template with build, deploy and smoke check"
```

---

### Task 3: Ejemplo Node

**Files:**
- Create: `templates/examples/node/{package.json,server.js,Dockerfile,.dockerignore,Jenkinsfile}`

**Interfaces:**
- Consumes: plantilla de Task 2.
- Produces: app que responde `200` en `/` por el puerto 3000; `APP_NAME=node-example`, `HOST_PORT=8081`, `CONTAINER_PORT=3000`.

- [ ] **Step 1: Crear `package.json`**

```json
{
  "name": "node-example",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": { "start": "node server.js" },
  "dependencies": { "express": "^4.19.2" }
}
```

- [ ] **Step 2: Crear `server.js`**

```js
const express = require('express');
const app = express();
app.get('/', (_req, res) => res.send('node-example OK'));
app.listen(3000, '0.0.0.0', () => console.log('listening on 3000'));
```

- [ ] **Step 3: Crear `Dockerfile` y `.dockerignore`**

`Dockerfile`:
```dockerfile
FROM node:lts-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```
`.dockerignore`:
```
node_modules
.git
```

- [ ] **Step 4: Crear `Jenkinsfile`**

Copia exacta de `templates/Jenkinsfile.template` con:
```groovy
        APP_NAME       = 'node-example'
        HOST_PORT      = '8081'
        CONTAINER_PORT = '3000'
```

- [ ] **Step 5: Verificar build y respuesta**

Run (desde `templates/examples/node`):
```bash
docker build -t node-example:test .
docker run -d --rm --name node-example-test -p 8081:3000 node-example:test
sleep 3
curl -fsS http://localhost:8081/
docker stop node-example-test
```
Expected: `node-example OK`.

- [ ] **Step 6: Commit**

```bash
git add templates/examples/node
git commit -m "feat: add node example app"
```

---

### Task 4: Ejemplo Python

**Files:**
- Create: `templates/examples/python/{app.py,requirements.txt,Dockerfile,.dockerignore,Jenkinsfile}`

**Interfaces:**
- Consumes: plantilla de Task 2.
- Produces: app `200` en `/` puerto 5000; `APP_NAME=python-example`, `HOST_PORT=8082`, `CONTAINER_PORT=5000`.

- [ ] **Step 1: Crear `requirements.txt` y `app.py`**

`requirements.txt`:
```
flask==3.0.3
gunicorn==22.0.0
```
`app.py`:
```python
from flask import Flask

app = Flask(__name__)


@app.get("/")
def index():
    return "python-example OK"
```

- [ ] **Step 2: Crear `Dockerfile` y `.dockerignore`**

`Dockerfile`:
```dockerfile
FROM python:3-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5000
CMD ["gunicorn", "-b", "0.0.0.0:5000", "app:app"]
```
`.dockerignore`:
```
__pycache__
.git
.venv
```

- [ ] **Step 3: Crear `Jenkinsfile`**

Copia de la plantilla con:
```groovy
        APP_NAME       = 'python-example'
        HOST_PORT      = '8082'
        CONTAINER_PORT = '5000'
```

- [ ] **Step 4: Verificar**

Run (desde `templates/examples/python`):
```bash
docker build -t python-example:test .
docker run -d --rm --name python-example-test -p 8082:5000 python-example:test
sleep 3
curl -fsS http://localhost:8082/
docker stop python-example-test
```
Expected: `python-example OK`.

- [ ] **Step 5: Commit**

```bash
git add templates/examples/python
git commit -m "feat: add python example app"
```

---

### Task 5: Ejemplo .NET (C#)

**Files:**
- Create: `templates/examples/dotnet/{example.csproj,Program.cs,Dockerfile,.dockerignore,Jenkinsfile}`

**Interfaces:**
- Consumes: plantilla de Task 2.
- Produces: app `200` en `/` puerto interno 8080 (no choca con Jenkins: es el puerto del contenedor); `APP_NAME=dotnet-example`, `HOST_PORT=8083`, `CONTAINER_PORT=8080`.

- [ ] **Step 1: Crear `example.csproj` y `Program.cs`**

`example.csproj`:
```xml
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>
</Project>
```
`Program.cs`:
```csharp
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();
app.MapGet("/", () => "dotnet-example OK");
app.Run();
```

- [ ] **Step 2: Crear `Dockerfile` y `.dockerignore`**

`Dockerfile`:
```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY example.csproj .
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /out --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /out .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "example.dll"]
```
`.dockerignore`:
```
bin
obj
.git
```

- [ ] **Step 3: Crear `Jenkinsfile`**

Copia de la plantilla con:
```groovy
        APP_NAME       = 'dotnet-example'
        HOST_PORT      = '8083'
        CONTAINER_PORT = '8080'
```

- [ ] **Step 4: Verificar**

Run (desde `templates/examples/dotnet`):
```bash
docker build -t dotnet-example:test .
docker run -d --rm --name dotnet-example-test -p 8083:8080 dotnet-example:test
sleep 3
curl -fsS http://localhost:8083/
docker stop dotnet-example-test
```
Expected: `dotnet-example OK`.

- [ ] **Step 5: Commit**

```bash
git add templates/examples/dotnet
git commit -m "feat: add dotnet example app"
```

---

### Task 6: README y prueba de punta a punta

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: guía de operación; verificación E2E y de los casos de Review Focus.

- [ ] **Step 1: Crear `README.md`**

````markdown
# CI/CD local con Jenkins

Jenkins en Docker detecta (polling cada minuto) pushes a `main` de repos públicos de GitHub y despliega cada app en su contenedor.

## Arranque
```bash
docker compose up -d --build
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword   # solo primera vez
```
Abrir http://localhost:8080 (Jenkins ocupa el puerto 8080 del host).

## Añadir un repo
1. En el repo: `Dockerfile` en la raíz y `Jenkinsfile` copiado de `templates/Jenkinsfile.template`; editar `APP_NAME`, `HOST_PORT` (único, desde 8081), `CONTAINER_PORT` (puerto que escucha la app dentro del contenedor).
2. Jenkins: New Item -> Pipeline -> Pipeline script from SCM -> Git.
   - Repository URL: la del repo público.
   - Branch Specifier: `*/main`.
   - Script Path: `Jenkinsfile`.
3. Ejecutar "Build Now" una vez: así Jenkins registra el `pollSCM`. Desde ahí cada push a `main` despliega solo (retraso máx. ~1 min).

## Puertos
| App | Host | Contenedor |
|---|---|---|
| Jenkins | 8080 | 8080 |
| node-example | 8081 | 3000 |
| python-example | 8082 | 5000 |
| dotnet-example | 8083 | 8080 |

Los puertos de host no se validan: si dos apps usan el mismo, la segunda falla en `docker run`.

## Comportamiento ante fallos
- Build falla: el contenedor anterior sigue corriendo.
- `docker run` falla (ej. puerto ocupado): build rojo; el contenedor anterior de esa app ya fue removido.
- Smoke check falla: build rojo con últimas 50 líneas de log de la app.

## Límites conocidos
Solo repos públicos, sin webhooks (polling), mismo host Docker, sin reverse proxy.
````

- [ ] **Step 2: E2E con el ejemplo Node**

Manual: crear repo público en GitHub, subir el contenido de `templates/examples/node` a `main`, crear el job según README, "Build Now".
Expected: build verde; `curl -fsS http://localhost:8081/` devuelve `node-example OK`; `docker ps` muestra `node-example`.

- [ ] **Step 3: Verificar el polling**

Cambiar el texto en `server.js` a `node-example v2`, commit y push a `main`. Esperar ≤2 min sin tocar Jenkins.
Expected: nuevo build automático (`Started by an SCM change`); `curl http://localhost:8081/` devuelve `node-example v2`.

- [ ] **Step 4: Verificar caso build roto conserva contenedor viejo**

Romper el `Dockerfile` (ej. `FROM node:no-existe`), push.
Expected: build rojo en etapa Build; `curl http://localhost:8081/` sigue respondiendo con la versión anterior.
Restaurar el `Dockerfile` y push.

- [ ] **Step 5: Verificar choque de puerto**

En otro job/contenedor, ocupar 8081 (`docker run -d --name squat -p 8081:80 nginx`), parar `node-example`, forzar un build.
Expected: build rojo en Deploy con error de puerto. Limpiar: `docker rm -f squat`, re-ejecutar build para volver a verde.

- [ ] **Step 6: Verificar reinicio**

Run: `docker compose restart jenkins` y reiniciar Docker Desktop.
Expected: jobs siguen en Jenkins; `node-example` vuelve a correr solo (`restart unless-stopped`).

- [ ] **Step 7: Repetir E2E (pasos 2-3) para Python y .NET**

Expected: `curl` a 8082 y 8083 devuelven `python-example OK` y `dotnet-example OK`.

- [ ] **Step 8: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup and operation guide"
```
