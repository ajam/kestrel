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
// function determineArchiveRemoteUrl(domain){
// 	domain = domain.toLowerCase().trim();
	
// 	var tld = {
// 		"bitbucket": ".org",
// 		"github": ".com"
// 	}
// 	return domain + tld[domain]
// }
function createDirGitInit(info){
	var repo_name = info.repository.name;
	fs.mkdirSync('./' + repo_name);

	var create_statement = sh_commands.createGitRepoAndRemotes(repo_name, info.repository.url, config.archive);
	// var create_statement = 'cd repositories/' + repo_name + ' && git init && git remote add origin ' + info.repository.url + '.git';
	// if (config.archive.enabled) create_statement += ' && git remote add archived https://' + determineArchiveRemoteUrl(config.archive.type) + '/' + config.archive.account_name + '/' + repo_name + '.git';
  
  sh.run(create_statement);
}
function pullLatest(info){
	var repo_name = info.repository.name;

	if (!fs.existsSync('./' + repo_name)){
		createDirGitInit(info);
	}

	var fetch_statement = sh_commands.fetchLatest(repo_name, config.archive);
	// var pull_statement = 'cd repositories/' + repo_name + ' &&  git fetch origin && git checkout origin/master';
	// if (config.archive.enabled) pull_statement += ' && git push origin archived';
	sh.run(fetch_statement);
}
function checkForDeployMsg(last_commit){
	var commit_msg = last_commit.message,
	    deploy_regx = new RegExp(config.s3.deploy_trigger);

	if (deploy_regx.exec(commit_msg)) return true;
	return false;
}
function deployToS3(info){
	var repo_name = info.repository.name,
	    path      = (config.s3.path) ? config.s3.path : '';

	var deploy_statement = setDeploy(repo_name, config.s3.bucket_name, path, config.s3.exclude_from_sync);
	var deploy_result = sh.exec(deploy_statement);
	// var deploy_result = sh.exec('aws s3 sync '+repo_name+' s3://'+config.bucket_name+'/'+path+repo_name+'/ --exclude ".git/*" --exclude ".*"');
	console.log(deploy_result.stdout);
}

hookshot('refs/heads/master', function(info){
	// The last commit in the array is the most recent
	var most_recent_commit  = info.commits[info.commits.length - 1];

	var is_account_verified = verifyAccount(info.repository.owner.name),
	    deploy_msg_found    = checkForDeployMsg(most_recent_commit);

	if (is_account_verified){
		pullLatest(info);

		if (deploy_msg_found){
			verifyCommitter(most_recent_commit, function(committer_approved){

				if (committer_approved) deployToS3(info);
			
			});
		}

	}
}).listen(config.github_listener.port);

console.log('Listening on port... ' + config.github_listener.port);	