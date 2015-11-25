var path = require('path')

var helpers = {
	excludeFiles: function(exclusions){
		return exclusions.map(function(exclusion){
			return '--exclude "' + exclusion + '"';
		}).join(' ');
	}
}
var sh_commands = {
	createGitRepoAndRemotes: function(repo_name, url){
		return 'cd ' + path.join('repositories', repo_name) + ' && git init && git remote add origin ' + url;
	},
	fetchLatest: function(repo_name){
		return 'cd ' + path.join('repositories', repo_name) + ' && git fetch origin';
	},
	trackAllBranches: function(repo_name){
		return 'cd ' + path.join('repositories', repo_name) + ' && for remote in $(git branch -r) ; do git checkout $(echo $remote | cut -d \'/\' -f2) && git pull origin $(echo $remote | cut -d \'/\' -f2); done';
	},
	checkoutMaster: function(repo_name){
		return 'cd ' + path.join('repositories', repo_name) + ' && git checkout master && git pull origin master'; // Pull master here just in case the above failed doing trackAllBranches
	},
	deleteBranch: function(repo_name, branch_name){
		return 'cd ' + path.join('repositories', repo_name) + ' && git branch -D ' + branch_name;
	},
	deploy: function(mode, bucket_name, local_path, remote_path, exclusions){
		var separater = path.sep;
		return 'cd repositories && aws s3 sync ' + local_path.split('>>').join(separater) + ' s3://' + bucket_name + '/' + remote_path + '/ --acl public-read ' + ((mode == 'hard') ? '--delete' : '') + ' ' + helpers.excludeFiles(exclusions)
	}
}

module.exports = sh_commands;
