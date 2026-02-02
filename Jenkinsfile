pipeline {
    agent any

    stages {
        stage('Deploy on server') {
            steps {
                echo '--- Entering stage ---'

                script {
                    def remoteUser = "ubuntu"
                    def remoteHost = "185.113.249.234"
                    def repoPath  = "/home/ubuntu/pesa_plan"

                    sh """
                        ssh -i /var/lib/jenkins/.ssh/jenkins_to_truehost_server \
                        -o StrictHostKeyChecking=no ${remoteUser}@${remoteHost} << 'EOF'

                        set -e

                        echo "✅ SSH connected"
                        echo "📁 Moving to project directory"
                        cd ${repoPath}

                        echo "⬇️ Pulling latest changes"
                        GIT_SSH_COMMAND="ssh -i ~/.ssh/truehost_to_github_connect -o IdentitiesOnly=yes" \
                          git pull github master

                        echo "📦 Frontend setup"
                        cd client

                        echo "🔧 Loading NVM"
                        export NVM_DIR="\$HOME/.nvm"
                        [ -s "\$NVM_DIR/nvm.sh" ] && . "\$NVM_DIR/nvm.sh"

                        nvm use 24

                        echo "🔍 Node versions"
                        node -v
                        npm -v

                        npm install
                        npm run build

                        echo "🚀 Restarting PM2"
                        pm2 startOrReload ecosystem.config.js --env production

                        cd ..

                        echo "🐍 Backend dependencies"
                        source .venv/bin/activate
                        pip install -r requirements.txt

                        alembic upgrade head
                        
                        deactivate

                        echo "🔁 Restarting services"
                        sudo supervisorctl restart nginx-main
                        sudo supervisorctl restart uvi-pesa-plan

                        echo "🎉 Deployment completed successfully"

                        EOF
                    """
                }
            }
        }
    }
}
