# CI/CD local con Jenkins

Jenkins en Docker detecta (polling cada minuto) pushes a `main` de repos públicos de GitHub y despliega cada app en su contenedor.

## Arranque
```bash
docker compose up -d --build
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword   # solo primera vez
```
Después del arranque inicial de Docker y Jenkins, el smoke check del `Jenkinsfile` alcanza el host a través de `host.docker.internal`, que ya está configurado en `docker-compose.yml` (no remover la entrada `extra_hosts`).

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
