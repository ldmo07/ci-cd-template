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
        APP_NAME       = 'dotnet-example'
        HOST_PORT      = '8083'
        CONTAINER_PORT = '8080'
    }

    stages {
        stage('Build') {
            steps {
                sh 'docker build --label app=${APP_NAME} -t${APP_NAME}:${BUILD_NUMBER} -t ${APP_NAME}:latest .'
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

    post {
        success {
            script { notifyDiscord(":white_check_mark: ${APP_NAME} #${BUILD_NUMBER} desplegado en el puerto ${HOST_PORT}") }
        }
        failure {
            script { notifyDiscord(":x: ${APP_NAME} #${BUILD_NUMBER} fallo el pipeline (el contenedor anterior se conserva si el build fallo)") }
        }
        always {
            sh '''
                docker images ${APP_NAME} --format '{{.Tag}}' | grep -E '^[0-9]+$' | sort -rn | tail -n +4 | xargs -r -I{} docker rmi ${APP_NAME}:{} || true
                docker image prune -f --filter label=app=${APP_NAME} || true
            '''
        }
    }
}

// Notifica a Discord. Requiere la credencial Jenkins "discord-webhook" (Secret text);
// si no existe o falla el envio, solo avisa en el log y no rompe el pipeline.
def notifyDiscord(String message) {
    try {
        withCredentials([string(credentialsId: 'discord-webhook', variable: 'DISCORD_WEBHOOK_URL')]) {
            withEnv(["MSG=${message}"]) {
                sh '''curl -fsS -H "Content-Type: application/json" -d "{\\"content\\":\\"${MSG}\\"}" "$DISCORD_WEBHOOK_URL" > /dev/null'''
            }
        }
    } catch (err) {
        echo "No se pudo notificar a Discord: ${err.message}"
    }
}