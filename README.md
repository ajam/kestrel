Professor Blastoff Server
==========================

A git server that mirrors repositories on a GitHub account at every commit and pushes that repository to a given S3 bucket if the commit message contains a specified trigger string. Tested on Ubuntu 12.04.

The Prof. Blastoff server requires that you've already set up a webhook from your Github repositry to your machines IP address on the proper port (see below for default port info). It's meant to be used in conjunction with the command-line tool [Professor Blastoff](https://github.com/mhkeller/professor-blastoff), which sets up a lot of that automatically for you.

# Installation

### If you already have Node.js, Python & Pip

````
git clone https://github.com/mhkeller/professor-blastoff-server
cd professor-blastoff-server && sudo npm install
````

You also want to install the Amazon Web Services Command-line interface, which is a python package.

````
sudo pip install awscli
````

### If you don't have Node.js, Python & Pip, Git, others...

````
sudo apt-get update
sudo apt-get install -y python-software-properties python g++ make python-pip
sudo apt-get install tmux
sudo add-apt-repository ppa:chris-lea/node.js
sudo apt-get update
sudo apt-get install nodejs
 
sudo apt-get install mailutils # For crontab logs, say okay to all prompts
sudo apt-get install git-core
````

# Configuration

### Server configuration

All settings are stored in `config.json`.

| Key          | Default value     | Description |
| ------------- |:----------------:|:---------:|
| `github_listener.account_name` | none   | The name of your GitHub account to account. This is used to make sure your server only responds to hooks from your account. |
| `github_listener.port` | `9001` | The port your server will listen on. Make sure to open up traffic to this port in your security group. |
| `s3.bucket_name` | none | The name of your S3 bucket to deploy to. |
| `s3.path` | `"2014/"` | The S3 path to put your repo. Must end with slash. |
| `s3.deploy_trigger` | none | The string in your commit message that will trigger an upload to S3. |
| `s3.exclude_from_sync` | `[".git/*", ".*"]` | An array of file or folder names to not transfer to S3. By default it doesn't transfer the Git folder or any hidden files. |
| `archive.enabled` | false | If you enable archives, the server will automatically push your repo to another GitHub or Bitbucket account. Set this to `true` to enable. |
| `archive.account_name` | none | The account name to archive this repo under. |
| `archive.type` | none | Can be either `bitbucket` or `github`. |
| `verify_committer.enabled` | false | If you enable committer verifiation, the server will only allow committers who are members of a designated GitHub team to push to S3, even if they use the deploy trigger in their commit message. This only works for organizations since it requires teams. |
| `verify_committer.team_id` | "000001" | The `team_id` as a string. |
| `verify_committer.access_token` | none | Generate an access token from an administrator's account at <https://github.com/settings/applications> in order to see the member list of your deployment team. This user **must** also be a member of the deployment team. |

### AWS Configuration

The AWS CLI looks for credentials in the file `~/.aws/config`.

Read the [Amazon documentation](http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html) for more details but the bare bones file looks like this:

````
[default]
aws_access_key_id=AKIAIOSFODNN7EXAMPLE
aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
````

# Start Professor Blastoff Server

````
node src/professor-blastoff-server
````

This will only run the listening server for your current session only. That's only recommended for testing. By default, the server runs on port 9001.

# Run Professor Blastoff as a service

If you want to run Professor Blastoff all day long, use the Forever module to run the server in the background.

You'll want to install the module globally:

````
npm install forever -g
````

Then start the service:

````
forever start professor-blastoff-server.js
````

You'll also want to make sure this server starts up if your machine reboots. You can do this through setting your crontab. To edit your crontab run:

````
crontab -e
````

Note: If this is the first time you're running `crontab` it will ask you what editor you want to use. 

Once you've picked an editor, add the following line to your crontab:

````
@reboot /usr/bin/forever start /full/path/to/professor-blastoff-server.js
````

To confirm the task was added, view your crontab with:

````
crontab -l
````

Note: The above line assumes that Forever is installed in `/usr/bin/`. To double check where your forever installed, run `which forever`.

# Start the staging server

Professor Blastoff uses [git-static-diffuse](https://github.com/mhkeller/git-static-diffuse) to allow you to view your all of the commits and branches of your repositories through a web server with the following url structure (defaulting to port 3000):

````
http://your-professor-blastoff-server.com:3000/repository-name/commit-or-branch-name/path/to/file.html
````

To test the server, run:

````
node full/path/to/professor-blastoff-server/node_modules/git-static-diffuse/examples/server.js --repositories full/path/to/professor-blastoff-server/repositories
````

You can specify a port other than 3000 by using `--port <replace-with-port-number>` as an option.

On Ubunutu, for instance, assuming you've installed Professor Blastoff in a folder called `tasks`, those paths and an alternate port setting could be:

````
node /home/ubuntu/tasks/professor-blastoff-server/node_modules/git-static-diffuse/examples/server.js --repositories /home/ubuntu/tasks/professor-blastoff-server/repositories --port 3001
````

# Start the staging server as a service

Follow the same instructions as above for using Forever and also add the `@reboot` statement to your crontab.

Starting Forever: 

````
/usr/bin/forever start /home/ubuntu/tasks/professor-blastoff-server/node_modules/git-static-diffuse/examples/server.js --repositories /home/ubuntu/tasks/professor-blastoff-server/repositories
````

And in your crontab:

````
@reboot /usr/bin/forever start /home/ubuntu/tasks/professor-blastoff-server/node_modules/git-static-diffuse/examples/server.js --repositories /home/ubuntu/tasks/professor-blastoff-server/repositories
````
