var helpers = {
	determineArchiveRemoteUrl: function(domain){
		domain = domain.toLowerCase().trim();
		var tld = {
			"bitbucket": ".org",
			"github": ".com"
		}
		return domain + tld[domain];
	},
	excludeFiles: function(exclusions){
		return exclusions.map(function(exclusion){
			return '--exclude "' + exclusion + '"';
		}).join(' ');
	}
}
var sh_commands = {
	createGitRepoAndRemotes: function(repo_name, url){
		return 'cd repositories/'+repo_name+' && git init && git remote add origin ' + url;
	},
	fetchLatest: function(repo_name){
		return 'cd repositories/' + repo_name + ' && git fetch --all';
	},
	trackAllBranches: function(repo_name){
		return 'cd repositories/' + repo_name + ' && for remote in $(git branch -r) ; do git checkout $(echo $remote | cut -d \'/\' -f2) && git pull origin $(echo $remote | cut -d \'/\' -f2); done';
	},
	checkoutMaster: function(repo_name){
		return 'cd repositories/' + repo_name + ' && git checkout master';
	},
	deleteBranch: function(repo_name, branch_name){
		return 'cd repositories/' + repo_name + ' && git branch -D ' + branch_name;
	},
	deploy: function(mode, repo_name, bucket_name, local_path, remote_path, exclusions){
		return 'cd repositories && aws s3 ' + mode + ' ' + repo_name + local_path + ' s3://' + bucket_name + '/' + remote_path + repo_name + '/ --acl public-read ' + ((mode == 'cp') ? '--recursive' : '') + ' ' + helpers.excludeFiles(exclusions)
	}
}

module.exports = sh_commands;