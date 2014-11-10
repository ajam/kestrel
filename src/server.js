'use-strict'

var hookshot = require('hookshot'),
	fs         = require('fs'),
	exec       = require('child_process').exec,
	sh         = require('execSync'),
	request    = require('request'),
	colors     = require('colors'),
	nodemailer = require('nodemailer');

var config      = require('../config.json'),
		sh_commands = require('./sh-commands.js'),
		email_transporter,
		email_options;

var xoauth2_generator = require('xoauth2').createXOAuth2Generator({
	user: config.email.address,
	clientId: config.email.clientId,
	clientSecret: config.email.clientSecret,
	refreshToken: config.email.refreshToken
});

if (config.email.enabled){
	// Create reusable transporter object using SMTP transport
	email_transporter = nodemailer.createTransport({
			service: config.email.service,
			auth: {
				xoauth2: xoauth2_generator
			}
		});

	email_options = {
		from: config.email.name + ' <'+config.email.address+'>' ,
		subject: '[Kestrel] Status update'
	};
}

function sendEmail(most_recent_commit, msg){
	var committer = most_recent_commit.committer;
	var committer_email = committer.email,
			committer_name  = committer.name;

	email_options.to = committer_email;
	email_options.text = 'Hi '+ committer_name+',\n\n' + msg + '\n\n\n'+'Talk to you later,\n\nKestrel Songs';
	email_transporter.sendMail(email_options, function(error, info){
		if(error){
			console.log('Error in email sending'.red, error);
		}else{
			console.log('Email success to '.green + committer_name + '<' + committer_email + '>' +'!');
		}
	});
}

function verifyAccount(incoming_repo){
	if (incoming_repo == config.github_listener.account_name) return true;
	return false;
}
function checkIfCommitterIsDeployer(members, committer){
	return members.some(function(member){
		return member.login === committer;
	});
}
function verifyCommitter(last_commit, cb){
	// You only need to verify the deployer if you're using teams, otherwise disable it and always allow anyone pushing to that repo to deploy.
	if (!config.verify_committer.enabled){
		cb(true);
	}else{
		var committer = last_commit.committer.username;
		request({
			url: 'https://api.github.com/teams/' + config.verify_committer.team_id + '/members?access_token=' + config.verify_committer.access_token,
			headers: {
        'User-Agent': 'Kestrel-publisher'
    		}
    	}, function (error, response, body) {
		  if (!error) {
		  	var committer_is_deployer = checkIfCommitterIsDeployer(JSON.parse(body), committer);
		    cb(committer_is_deployer);
		  } else {
		  	console.log('Error verifying committer'.red, JSON.stringify(error))
		  }
		})
	}
}

function createDirGitInit(info){
	console.log('Creating folder and git repository...'.yellow);
	var repo_name = info.repository.name;

	fs.mkdirSync('./repositories/' + repo_name);

	var remote_url_arr = info.repository.url.split('//');
	var authenticated_remote_url = remote_url_arr[0] + '//' + config.verify_committer.access_token + '@' + remote_url_arr[1];
	var create_statement = sh_commands.createGitRepoAndRemotes(repo_name, authenticated_remote_url);
	console.log(create_statement);
  sh.run(create_statement);
	console.log('Git created!'.green);
}
function pullLatest(info){
	var repo_name = info.repository.name,
			branch_name = info.ref.split('/')[2], // `ref: "refs/heads/<branchname>` => `branchname`
			delete_branch;

	if (!fs.existsSync('./repositories/' + repo_name)){
		createDirGitInit(info);
	}

	// Download latest data
	var fetch_statement = sh_commands.fetchLatest(repo_name);
	sh.run(fetch_statement);

	// If it's deleted, delete it!
	if (info.deleted) {
		delete_branch = sh_commands.deleteBranch(repo_name, branch_name);
		sh.run(delete_branch);
	}

	// Update all branches
	var track_all_branches = sh_commands.trackAllBranches(repo_name);
	sh.run(track_all_branches);

	// Put the working tree back on to master
	var checkout_master = sh_commands.checkoutMaster(repo_name);
	sh.run(checkout_master);
}
function checkForDeployMsg(last_commit){
	console.log('Checking if deploy message in...'.yellow, last_commit.message);
	var commit_trigger = last_commit.message.split('::')[1], // 'bucket_environment::trigger::local_path::remote_path' -> "trigger"
	    cp_deploy_regx   = new RegExp(config.s3.hard_deploy.trigger),
	    sync_deploy_regx = new RegExp(config.s3.sync_deploy_trigger);

	if (config.s3.hard_deploy.enabled && cp_deploy_regx.exec(commit_trigger)) return 'hard';
	if (sync_deploy_regx.exec(commit_trigger)) return 'sync';
	return false;
}
function deployToS3(deploy_type, info, most_recent_commit){
	var repo_name   = info.repository.name,
			last_commit_msg = most_recent_commit.message,
			commit_parts = last_commit_msg.split('::'), // 'bucket_environment::trigger::local_path::remote_path' -> [bucket_environment, trigger, local_path, remote_path], e.g. `staging::sync-flamingo::kestrel-test::2014/kestrel-cli` 
			bucket_environment  = commit_parts[0], // Either `prod` or `staging`
			local_path  = commit_parts[2], // Either `repo_name` or `repo_name/sub-directory`
	    remote_path = commit_parts[3] // The folder we'll be writing into. An enclosing folder and the repo name plus any sub-directory, e.g. `2014/kestrel-test` or `2014/kestrel-test/output`

	var deploy_statement = sh_commands.deploy(deploy_type, config.s3.buckets[bucket_environment], local_path, remote_path, config.s3.exclude);
	console.log('Attempting to deploy with'.yellow, deploy_statement);
	exec(deploy_statement, function(error, stdout){
		// Log deployment result
		console.log('Deployed!'.green, stdout);
		if (config.email.enabled) {
			sendEmail(most_recent_commit, 'I just performed a <strong>'+deploy_type+'</strong> to S3 <strong>*'+bucket_environment+'*</strong> containing '+ info.commits.length + commits.\n\nFrom the local folder of `' + local_path + '`\n\nTo the S3 folder `' + remote_path + '`\n\n\nHere\'s some more output:\n'+stdout);
		}
	});
}

hookshot(function(info){
	// Is this request coming from the specified GitHub Account?
	var is_account_verified = verifyAccount(info.repository.owner.name);
	// Is there a deploy message present?
	var most_recent_commit,
			deploy_status;
	// The last commit in the array is the most recent
	// But `info.commits` will be an empty array if you pushed a new branch with no commits
	if (info.commits.length) {
		most_recent_commit  = info.commits[info.commits.length - 1];
		deploy_status       = checkForDeployMsg(most_recent_commit);
		console.log('Deploy status is'.cyan, deploy_status);
	}
	// Is this coming from the whitelisted GitHub account?
	if (is_account_verified){
		pullLatest(info);
		// if (config.email.enabled){
		// 	sendEmail(most_recent_commit, 'Pulled down '+info.commits.length+' commits. The most recent was made at ' + most_recent_commit.timestamp + ': '+ most_recent_commit.url);
		// }

		// Are we deploying? Has that option been enabled and does the commit have the appropriate message?
		if (config.s3.enabled && deploy_status){
			verifyCommitter(most_recent_commit, function(committer_approved){

				// Does the committer have deploy? privileges?
				if (committer_approved) {
					deployToS3(deploy_status, info, most_recent_commit);
				} else {
					console.log('Unapproved committer attempted deployment.'.red)
				}
			
			});
		}
	}
}).listen(config.github_listener.port);

console.log('Listening on port... ' + config.github_listener.port);	