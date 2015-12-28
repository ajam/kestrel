var path = require('path');

var helpers = {
	excludeFiles: function(exclusions){
		return exclusions.map(function(exclusion){
			return '--exclude "' + exclusion + '"';
		}).join(' ');
	}
}
var sh_commands = {
	createGitRepoAndRemotes: function(repo_name, url) {
		return 'cd ' + path.join('repositories', repo_name) + ' && git init && git remote add origin ' + url;
	},
	fetchLatest: function(repo_name) {
		return 'cd ' + path.join('repositories', repo_name) + ' && git fetch origin';
	},
	trackAllBranches: function(repo_name) {
		return 'cd ' + path.join('repositories', repo_name) + ' && for remote in $(git branch -r) ; do git checkout $(echo $remote | cut -d \'/\' -f2) && git pull origin $(echo $remote | cut -d \'/\' -f2); done';
	},
	checkoutBranch: function(repo_name, branch_name) {
		return 'cd ' + path.join('repositories', repo_name) + ' && git checkout ' + branch_name + ' && git pull origin ' + branch_name; // Pull this branch here just in case the above failed doing trackAllBranches
	},
	deleteBranch: function(repo_name, branch_name) {
		return 'cd ' + path.join('repositories', repo_name) + ' && git branch -D ' + branch_name;
	},
	deploy: function(mode, bucket_name, local_path, remote_path, exclusions) {
		return 'cd repositories && aws s3 sync ' + local_path + ' s3://' + bucket_name + '/' + remote_path + '/ --acl public-read ' + ((mode == 'hard') ? '--delete' : '') + ' ' + helpers.excludeFiles(exclusions)
	},
	rmRf: function(repo_name) {
		return 'rm -rf ' +  path.join('repositories', repo_name);
	}
}

module.exports = sh_commands;
