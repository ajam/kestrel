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
		return 'cd repositories && git clone ' + url + '.git';
	},
	fetchLatest: function(repo_name){
		return 'cd repositories/' + repo_name + ' && git fetch';
	},
	deploy: function(mode, repo_name, bucket_name, path, exclusions){
		return 'aws s3 ' + mode + ' '+repo_name+' s3://'+bucket_name+'/'+path+repo_name+'/ --acl public-read ' + ((mode == 'cp') ? '--recursive' : '') + ' ' + helpers.excludeFiles(exclusions)
	}
}

module.exports = sh_commands;