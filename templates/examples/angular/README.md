# ci-cd-angular
App Angular 22 que lista personas consumiendo la API .NET (`ci-cd-dotnet`). Se despliega con Jenkins como contenedor `angular-example` (nginx) en `http://localhost:8085`. Forma parte del flujo CI/CD local descrito en el repositorio [ci-cd-template](https://github.com/ldmo07/ci-cd-template).

## Desarrollo local
```bash
npm install
npm start            # http://localhost:4200 (necesita la API en :8083)
npm run lint
npm test -- --no-watch
npm run build
```

## Flujo
`rama → Pull Request → GitHub Actions (check "test": lint + tests + build) → merge a main → Jenkins (Build → Deploy → Smoke check) → aviso a Discord`

## Despliegue
| Dato | Valor |
|---|---|
| Contenedor | `angular-example` |
| Puerto host → contenedor | 8085 → 80 |
| Pipeline | `Jenkinsfile` (copia de `templates/Jenkinsfile.template`) |

Verificar sin Jenkins:
```bash
docker build -t angular-example:test . && docker run -d --rm --name angular-test -p 8085:80 angular-example:test
curl -fsS http://localhost:8085/ ; docker stop angular-test ; docker rmi angular-example:test
```

## Tech Stack
Angular 22 · TypeScript · Vitest · angular-eslint · nginx · Docker · Jenkins