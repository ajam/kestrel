var hookshot = require('hookshot'),
	fs   = require('fs'),
	sh   = require('execSync');

var config = require('./config.json');

function verifyAccount(incoming_repo){
	if (incoming_repo == config.github_account) return true;
	return false;
}
function determineArchiveRemoteUrl(domain){
	domain = domain.toLowerCase().trim();
	var tld = {
		"bitbucket": ".org",
		"github": ".com"
	}
	return domain + tld[domain]

}
function createDirGitInit(info){
	var repo_name = info.repository.name;
	fs.mkdirSync('./' + repo_name);

	var create_statement = 'cd ' + repo_name + ' && git init && git remote add origin ' + info.repository.url + '.git';
	if (config.archive.enabled) create_statement += ' && git remote add archived https://' + determineArchiveRemoteUrl(config.archive.type) + '/' + config.archive.account_name + '/' + repo_name + '.git';
  
  sh.run(create_statement);
}
function pullLatest(info){
	var repo_name = info.repository.name;
	if (!fs.existsSync('./' + repo_name)){
		createDirGitInit(info);
	}

	var pull_statement = 'cd ' + repo_name + ' &&  git fetch origin && git checkout origin/master';
	if (config.archive.enabled) pull_statement += ' && git push origin archived';
	sh.run(pull_statement);
}
function checkForDeployMsg(commits){
	// The last commit in the array is the most recent
	var commit_msg = commits[commits.length - 1].message,
	    deploy_regx = new RegExp(config.deploy_trigger);
	if (deploy_regx.exec(commit_msg)) return true;
	return false;
}
function deployToS3(info){
	var repo_name = info.repository.name,
	    path      = (config.path) ? config.path + '/' : '';

	var deploy_result = sh.exec('aws s3 sync '+repo_name+' s3://'+config.bucket_name+'/'+path+repo_name+'/ --exclude ".git/*" --exclude ".*"');
	console.log(deploy_result.stdout);
}
hookshot('refs/heads/master', function(info){
	var is_account_verified = verifyAccount(info.repository.owner.name),
	    deploy_msg_found    = checkForDeployMsg(info.commits);

	if (is_account_verified){
		pullLatest(info);

		if (deploy_msg_found){
			deployToS3(info);
		}

	}
}).listen(config.port);
console.log('Listening on port... ' + config.port);	

