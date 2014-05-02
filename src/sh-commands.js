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
	createGitRepoAndRemotes: function(url){
		console.log(url);
		return 'cd repositories && git clone ' + url + '.git && for remote in $(git branch -r) ; do git branch --track $(echo $remote | cut -d '/' -f2) remotes/$remote; done';
	},
	fetchLatest: function(repo_name){
		return 'cd repositories/' + repo_name + ' && git fetch --all && git pull --all';
	},
	deploy: function(mode, repo_name, bucket_name, path, exclusions){
		return 'aws s3 ' + mode + ' '+repo_name+' s3://'+bucket_name+'/'+path+repo_name+'/ --acl public-read ' + ((mode == 'cp') ? '--recursive' : '') + ' ' + helpers.excludeFiles(exclusions)
	}
}

module.exports = sh_commands;