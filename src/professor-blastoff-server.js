var hookshot = require('hookshot'),
	fs         = require('fs'),
	sh         = require('execSync'),
	request    = require('request');

var config      = require('../config.json'),
		sh_commands = require('./sh-commands.js')

function verifyAccount(incoming_repo){
	if (incoming_repo == config.github_listener.account_name) return true;
	return false;
}
function checkIfCommitterIsDeployer(members, committer){
	members.some(function(member){
		return member.name === committer;
	})
}
function verifyCommitter(last_commit, cb){
	// You only need to verify the deployer if you're using teams, otherwise disable it and always allow anyone pushing to that repo to deploy.
	if (!config.verify_committer.enabled){
		cb(true);
	}else{
		var committer = last_commit.committer.username;
		request('https://api.github.com/teams/' + config.verify_committer.team_id + '/members?access_token=' + config.verify_committer.access_token, function (error, response, body) {
		  if (!error && response.statusCode == 200) {
		  	var committer_is_deployer = checkIfCommitterIsDeployer(JSON.parse(body), committer);
		    cb(committer_is_deployer);
		  }
		})
	}
}

function createDirGitInit(info){
	var repo_name = info.repository.name;
	fs.mkdirSync('./' + repo_name);

	var create_statement = sh_commands.createGitRepoAndRemotes(repo_name, info.repository.url, config.archive);
  sh.run(create_statement);
}
function pullLatest(info){
	var repo_name = info.repository.name;

	if (!fs.existsSync('./' + repo_name)){
		createDirGitInit(info);
	}

	var fetch_statement = sh_commands.fetchLatest(repo_name, config.archive);
	sh.run(fetch_statement);
}
function checkForDeployMsg(last_commit){
	var commit_msg = last_commit.message,
	    cp_deploy_regx   = new RegExp(config.s3.hard_deploy_trigger),
	    sync_deploy_regx = new RegExp(config.s3.sync_deploy_trigger);

	if (config.s3.hard_deploy_trigger.enabled && cp_deploy_regx.exec(commit_msg)) return 'cp';
	if (sync_deploy_regx.exec(commit_msg)) return 'sync';
	return false;
}
function deployToS3(deploy_type, info){
	var repo_name = info.repository.name,
	    path      = (config.s3.path) ? config.s3.path : '';

	var deploy_statement = sh_commands.deploy(deploy_type, repo_name, config.s3.bucket_name, path, config.s3.exclude_from_sync);
	var deploy_result = sh.exec(deploy_statement);
	// var deploy_result = sh.exec('aws s3 sync '+repo_name+' s3://'+config.bucket_name+'/'+path+repo_name+'/ --exclude ".git/*" --exclude ".*"');
	console.log(deploy_result.stdout);
}

hookshot('refs/heads/master', function(info){
	// The last commit in the array is the most recent
	var most_recent_commit  = info.commits[info.commits.length - 1];

	var is_account_verified = verifyAccount(info.repository.owner.name),
	    deploy_status       = checkForDeployMsg(most_recent_commit);

	// Is this coming from the whitelisted GitHub account?
	if (is_account_verified){
		pullLatest(info);

		// Are we deploying? Has that option been enabled and does the commit have the appropriate message?
		if (config.s3.enabled && deploy_status){
			verifyCommitter(most_recent_commit, function(committer_approved){

				// Does the committer have deploy? privileges?
				if (committer_approved) deployToS3(deploy_status, info);
			
			});
		}

	}
}).listen(config.github_listener.port);

console.log('Listening on port... ' + config.github_listener.port);	