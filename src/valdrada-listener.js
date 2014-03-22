var hookshot = require('hookshot'),
	fs   = require('fs'),
	sh   = require('execSync');

var config = require('./config.json');
var port_number = 9001;

function verifyAccount(incoming_repo){
	if (incoming_repo == config.github_account) return true;
	return false;
}
function createDirGitInit(info){
	var repo_name = info.repository.name;
	fs.mkdirSync('./' + repo_name);
        sh.run('cd ' + repo_name + ' && git init && git remote add origin ' + info.repository.url + '.git');
}
function pullLatest(info){
	var repo_name = info.repository.name;
	if (!fs.existsSync('./' + repo_name)){
		createDirGitInit(info)
	}
	sh.run('cd ' + repo_name + ' &&  git fetch origin && git checkout origin/master');
}
function checkForDeployMsg(info){
	// The last commit in the array is the most recent
	var commit_msg = info.commits[info.commits.length - 1].message,
	    deploy_regx = new RegExp(config.deploy_trigger);
	if (deploy_regx.exec(commit_msg)) return true;
	return false;
}
function deployToS3(info){
	var repo_name = info.repository.name,
	    path      = (config.path) ? config.path + '/' : '';

	if (config.use_year_in_path) { path += new Date().getFullYear() + '/' };

	var deploy_result = sh.exec('aws s3 sync '+repo_name+' s3://'+config.bucket_name+'/'+path+repo_name+'/ --exclude ".git/*" --exclude ".*"');
	console.log(deploy_result.stdout);
}
hookshot('refs/heads/master', function(info){
	var account_verified = verifyAccount(info.repository.owner.name);
	if (account_verified){
		pullLatest(info);
		var deploy_msg = checkForDeployMsg(info);
		if (deploy_msg){
			deployToS3(info);
		}
	}
}).listen(port_number);
console.log('Listening on port... ' + port_number);	

