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
			return '--exclude "' + exclusion + '"' ;
		}).join(' ');
	}
}
var sh_commands = {
	createGitRepoAndRemotes: function(repo_name, url, archive_info){
		return 'cd repositories/' + repo_name + ' && git init && git remote add origin ' + url + '.git' + (archive_info.enabled) ? this.setArchiveRemote(repo_name, archive_info) : '';
	},
	setArchiveRemote: function(repo_name, archive_info){
		return ' && git remote add archived https://' + helpers.determineArchiveRemoteUrl(archive_info.type) + '/' + archive_info.account_name + '/' + repo_name + '.git';
	},
	fetchLatest: function(repo_name, archive_info){
		return 'cd repositories/' + repo_name + ' && git fetch origin && git checkout origin/master' + (archive_info.enabled) ? pushToArchive() : '';
	},
	pushToArchive: function(){
		return ' && git push origin archived';
	},
	setDeploy: function(repo_name, bucket_name, path, exclusions){
		return 'aws s3 sync '+repo_name+' s3://'+bucket_name+'/'+path+repo_name+'/ ' + helpers.excludeFiles(exclusions)
	}
}

module.exports = sh_commands;