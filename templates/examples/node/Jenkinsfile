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
        APP_NAME       = 'node-example'
        HOST_PORT      = '8081'
        CONTAINER_PORT = '3000'
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
        always {
            sh '''
                docker images ${APP_NAME} --format '{{.Tag}}' | grep -E '^[0-9]+$' | tail -n +4 | xargs -r -I{} docker rmi ${APP_NAME}:{} || true
                docker image prune -f --filter label=app=${APP_NAME} || true
            '''
        }
    }
}
