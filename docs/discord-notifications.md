# Notificaciones de deploy a Discord

Jenkins avisa en un canal de Discord cuando un pipeline termina:

- `:white_check_mark: <app> #<build> desplegado en el puerto <puerto>` si todo sale bien.
- `:x: <app> #<build> fallo el pipeline ...` si falla el build, el deploy o el smoke check.

El aviso lo envía el bloque `post { success / failure }` del `Jenkinsfile` mediante la función `notifyDiscord()`, con un `curl` al webhook del canal. No usa plugins.

> Los avisos de PR, checks y merges de GitHub son otro tema: se configuran con la integración nativa de GitHub en el canal, sin código. GitHub Actions no notifica nada (solo hace de puerta de calidad en PRs).

## 1. Crear el webhook en Discord

Requiere el permiso **Gestionar webhooks** en el canal.

1. Abre el servidor y entra a los ajustes del canal (icono de engranaje junto al nombre del canal).
2. **Integraciones → Webhooks → Nuevo webhook**.
3. Ponle un nombre (por ejemplo `ci-cd-webhook`) y confirma que el canal es el correcto.
4. Pulsa **Copiar URL del webhook**. Tiene la forma `https://discord.com/api/webhooks/<id>/<token>`.

![Webhook en los ajustes del canal de Discord](discord-webhook.png)

> **La URL es un secreto.** Cualquiera que la tenga puede publicar en el canal. No la pegues en chats, issues ni en el repositorio (los repos son públicos). Si se filtra, usa **Eliminar webhook** en Discord y crea uno nuevo.

## 2. Guardar la URL como credencial en Jenkins

1. Abre Jenkins (`http://localhost:8080`).
2. **Manage Jenkins → Credentials → System → Global credentials (unrestricted) → Add Credentials**.
3. Completa el formulario:

   | Campo | Valor |
   |---|---|
   | Kind | `Secret text` |
   | Scope | `Global (Jenkins, nodes, items, all child items, etc)` |
   | Secret | la URL del webhook copiada en el paso anterior |
   | ID | `discord-webhook` (exacto, en minúsculas y con guion) |
   | Description | libre, por ejemplo `Webhook de Discord` |

4. Pulsa **Create**.

![Credencial discord-webhook en Jenkins](jenkins-discord-credential.png)

El **ID** no sale de Discord: es el nombre con el que el `Jenkinsfile` busca la credencial (`credentialsId: 'discord-webhook'`). Si lo escribes distinto, no hay error en el deploy, pero tampoco llegan los avisos.

Una sola credencial sirve para todos los jobs, porque el scope es global.

## 3. Probar

1. Sube un cambio a `main` de cualquier app (por PR, porque `main` está protegida) o lanza **Build Now** en el job.
2. Espera a que termine el pipeline: el mensaje debe aparecer en el canal.

Prueba rápida del webhook, sin Jenkins (reemplaza la URL):

```bash
curl -fsS -H "Content-Type: application/json" \
  -d '{"content":"prueba de webhook"}' "<URL_DEL_WEBHOOK>"
```

## Solución de problemas

Revisa el **Console Output** del build; los errores de notificación aparecen como `No se pudo notificar a Discord: ...` y **no rompen el pipeline**.

| Síntoma | Causa probable |
|---|---|
| No llega nada y el log dice que no se encontró la credencial | El ID no es exactamente `discord-webhook`, o se creó en otro scope/carpeta |
| `curl: (22) ... 404` | La URL está incompleta o el webhook fue eliminado en Discord |
| `curl: (22) ... 401` / `403` | Token del webhook incorrecto; vuelve a copiar la URL |
| `curl: (6) Could not resolve host` | El contenedor de Jenkins no tiene salida a internet / DNS |
| Llega el aviso de fallo pero no el de éxito (o al revés) | El pipeline terminó en otro estado (por ejemplo `ABORTED`, que no notifica) |

## Cambiar o rotar el webhook

Edita la credencial en Jenkins (**Credentials → discord-webhook → Update**) y pega la URL nueva en *Secret*. No hace falta tocar ningún `Jenkinsfile`.

## Dónde está en el código

- `templates/Jenkinsfile.template`: bloque `post` y función `notifyDiscord()` (los `Jenkinsfile` de `templates/examples/*` y de `ci-cd-*` son copias).
- Para otro canal (Slack, Teams) basta cambiar el cuerpo del JSON en `notifyDiscord()`: Slack y Teams esperan `{"text": "..."}` en lugar de `{"content": "..."}`.
