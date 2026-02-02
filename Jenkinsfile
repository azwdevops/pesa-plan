pipeline {
    agent any
    
    stages {
        stage('Clone the repo on server') {
            steps {
                echo '--- Entering stage ---'
                script {
                    echo '--- Inside script block ---'
                    // define server details
                    def remoteUser = "ubuntu"
                    def remoteHost = "185.113.249.234"
                    def repoUrl = "git@github.com:azwdevops/pesa-plan.git"
                    def repoPath = "/home/ubuntu/pesa_plan"

                    // ssh command - improved with error handling and logging
                    def sshCommand = """
                        echo 'SSH to server works'

                        set -e  # Exit immediately if any command fails

                        echo '📁 Navigating to project directory...'

                        cd ${repoPath} || { echo "Failed to cd to ${repoPath}"; exit 1; }

                        echo '⬇️ Pulling latest changes...'
                        GIT_SSH_COMMAND="ssh -i ~/.ssh/truehost_to_github_connect -o IdentitiesOnly=yes" git pull github master

                        echo '📦 Installing dependencies...'
                        cd client

                        echo '🔧 Loading nvm and selecting Node 24...'
                        
                        export NVM_DIR="$HOME/.nvm"
                        [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

                        nvm use 24

                        echo 'Node version in Jenkins SSH session:'
                        node -v
                        npm -v

                        npm install

                        echo '🛠️ Building Next.js frontend...'
                        npm run build

                        echo '🚀 Restarting or starting PM2 app...'
                        pm2 startOrReload ecosystem.config.js --env production
                        
                        cd ..

                        source .venv/bin/activate

                        pip3 install -r requirements.txt

                        deactivate

                        echo 'Restarting nginx and uvicorn services'
                        sudo supervisorctl restart nginx-main
                        sudo supervisorctl restart uvi-pesa-plan

                        echo '✅ Frontend deployment completed successfully.'
                    """

                    // run ssh command via jenkins with proper quoting
                    sh """
                        ssh -i /var/lib/jenkins/.ssh/jenkins_to_truehost_server \
                        -o StrictHostKeyChecking=no ${remoteUser}@${remoteHost} '
                        ${sshCommand}
                    '
                    """
                }
            }
        }
    }
}
