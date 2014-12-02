'use-strict'

var hookshot = require('hookshot'),
	fs         = require('fs'),
	exec       = require('child_process').exec,
	sh         = require('execSync'),
	request    = require('request'),
	colors     = require('colors'),
	nodemailer = require('nodemailer'),
	CronJob 	 = require('cron').CronJob,
	time 			 = require('time');

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

// Where we're storing our cronjobs by repo name
var jobs = {};

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

function sendEmail(context, mode, most_recent_commit, stdout, repo_name){
	var committer,
			committer_email,
			committer_name,
			body_text,
			now,
			here_and_now, // A timezone'd version of `now`.
			msg,
			commit_messages_and_urls,
			commit_length_text,
			commit_calculated_length,
			s,
			mode_verb,
			info,
			most_recent_commit,
			deploy_statement,
			deploy_type,
			bucket_environment,
			local_path,
			remote_path,
			when_msg = '',
			s3_output = '',
			tense = '',
			deploy_s = '',
			s3_verb = '';

	if (config.email.enabled) {
		if (mode == 'deploy'){
			mode_verb = 'performed';
			s3_verb = 'put';
		} else if (mode == 'schedule') {
			mode_verb = 'scheduled';
			tense = 'will ';
			s3_verb = 'put';
		} else if (mode == 'unschedule') {
			mode_verb = 'unscheduled';
			tense = 'won\'t ';
			deploy_s = 's';
			s3_verb = 'touch'
		}

		info = context.info;
		most_recent_commit = context.most_recent_commit;
		deploy_statement = context.deploy_statement;
		deploy_type = context.deploy_type;
		bucket_environment = context.bucket_environment;
		local_path = context.local_path;
		remote_path = context.remote_path;
		when = context.when.replace('T', ' '); // Remove the `T` for pretty printing

		committer = most_recent_commit.committer;
		committer_email = committer.email;
		committer_name  = committer.name;

		now = new time.Date();
		here_and_now = now.setTimezone(config.timezone).toString();

		commit_length_text = '.';
		commit_calculated_length = info.commits.length - 1;
		s = 's';

		// Make a string saying how many commits we have, minus the staging commit
		if (commit_calculated_length != 0){
			// Make sure we get our plurals correct.
			if (commit_calculated_length == 1) {
				s = '';
			}
			commit_length_text = ' containing ' +commit_calculated_length+' commit'+s+':<br/><br/>';
		}
		// Concatenate a string of urls for each of these commits along with the commit message
		// Reverse to put them in rever-cron order
		commit_messages_and_urls = info.commits.map(function(cmt){ return cmt.url + ' "' + cmt.message + '"'; }).reverse().slice(1,info.commits.length).join('<br/>');

		// In schedule mode there is no s3 output so it stays as an empty string
		if (mode == 'deploy'){
			s3_output = '<br/><br/><br/>';
			if (!stdout || !stdout.trim()){
				s3_output += 'S3 said everything was already up-to-date! If you\'ve removed files from your project and want to have that deletion reflected on S3 (possible if you\'ve renamed files, for instance) try doing a hard deploy.';
			} else {
				s3_output += 'Here\'s what S3 is telling me it did:<br/>';
				s3_output += stdout.replace(/remaining/g, 'remaining<br/>');
			}
		} else if (mode == 'schedule'){
			when_msg = ' for <strong>' + when + '</strong>';
		} else if (mode == 'unschedule'){
			deploy_type = 'all';
			local_path = repo_name;
		}

		// What's the main body message look like?
		msg = 'I just '+mode_verb+' a <strong>'+deploy_type+'</strong> deploy'+deploy_s+' to S3 <strong>*'+bucket_environment+'*</strong>'+when_msg+commit_length_text+commit_messages_and_urls+'<br/><br/>I '+tense+s3_verb+' the local folder of <strong>`' + local_path + '`</strong>';

		if (mode != 'unschedule'){
			msg += '<br/>onto S3 as <strong>`' + remote_path + '`</strong>'+s3_output;
		} else {
			// Get rid of the `a` since `deploys` is now plural
			msg = msg.replace('I just unscheduled a', 'I just unscheduled');
		}

		// Assemble an html version
		body_text = 'Hi '+ committer_name+',<br/><br/>' + msg + '<br/><br/><br/>'+'Talk to you later,<br/><br/>Kestrel Songs<br/><br/>Sent at: '+here_and_now;
		email_options.html = body_text;

		// And a plain-text version
		email_options.text = body_text.replace(/<br\/>/g, '\n')
																	.replace(/<(\/?)strong>/g, '*');

		// Fill out the rest of the information and send
		email_options.to = committer_email;
		email_transporter.sendMail(email_options, function(error, info){
			if(error){
				console.log('Error in email sending'.red, error);
			}else{
				console.log('Email success! To: '.green + committer_name + ' <' + committer_email + '>');
			}
		});
	}
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
	var commit_trigger = last_commit.message.split('::')[1], // 'bucket_environment::trigger::local_path::remote_path::when' -> "trigger"
	    cp_deploy_regx   = new RegExp(config.s3.hard_deploy.trigger),
	    sync_deploy_regx = new RegExp(config.s3.sync_deploy_trigger);

	if (config.s3.hard_deploy.enabled && cp_deploy_regx.exec(commit_trigger)) return 'hard';
	if (sync_deploy_regx.exec(commit_trigger)) return 'sync';
	return false;
}

function deployToS3(){
	var that = this;
	var deploy_statement = this.deploy_statement,
			most_recent_commit = this.most_recent_commit;

	console.log('Deploying with:\n'.yellow, deploy_statement);
	exec(deploy_statement, function(error, stdout){
		// Log deployment result
		console.log('Deployed!'.green);
		console.log(stdout);
		sendEmail(that, 'deploy', most_recent_commit, stdout);
	});
	
}
function prepS3Deploy(deploy_type, info, most_recent_commit){
	var repo_name   = info.repository.name,
			last_commit_msg = most_recent_commit.message,
			commit_parts = last_commit_msg.split('::'), // 'bucket_environment::trigger::local_path::remote_path::when' -> [bucket_environment, trigger, local_path, remote_path], e.g. `staging::sync-flamingo::kestrel-test::2014/kestrel-cli:2014-11-11T14:02` 
			bucket_environment  = commit_parts[0], // Either `prod` or `staging`
			local_path  = commit_parts[2], // Either `repo_name` or `repo_name/sub-directory`
	    remote_path = commit_parts[3], // The folder we'll be writing into. An enclosing folder and the repo name plus any sub-directory, e.g. `2014/kestrel-test` or `2014/kestrel-test/output`
			when = commit_parts[4]; // Date/time string in YYYY-MM-DDTHH:MM format or `now` or `unschedule`

	var deploy_statement = sh_commands.deploy(deploy_type, config.s3.buckets[bucket_environment], local_path, remote_path, config.s3.exclude);
	// These are the variables packaged up so they can be accessed by `deployToS3`
	// We can't really pass them super easily since `CronJob` wants a function by reference
	var context = {
		info: info,
		most_recent_commit: most_recent_commit,
		deploy_type: deploy_type,
		bucket_environment: bucket_environment,
		local_path: local_path,
		remote_path: remote_path,
		deploy_statement: deploy_statement,
		when: when
	};

	var cron_id = repo_name+bucket_environment;

	// If we're scheduling or unscheduling, (in those cases, `when` is either `unschedule` or a date string)
	// Clear any previous cron in that namespace
	if (when != 'now' && jobs[cron_id]){
		jobs[cron_id].stop();
	}
	
	if (when == 'now'){
		deployToS3.call(context);
	} else if (when == 'unschedule'){
		console.log('Unscheduling all deploys for'.yellow, repo_name);
		sendEmail(context, 'unschedule', most_recent_commit, '', repo_name);
	} else {
		jobs[cron_id] = new CronJob({
			cronTime: new time.Date(when, config.timezone),
			onTick: deployToS3,
			start: true,
			timeZone: config.timezone,
			context: context
		});
		console.log('Scheduling with:\n'.yellow, deploy_statement);
		sendEmail(context, 'schedule', most_recent_commit);
	}

}

hookshot(function(info){
	console.log('\n\n\n\n## Incoming push from'.cyan, info.repository.owner.name);
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
					prepS3Deploy(deploy_status, info, most_recent_commit);
				} else {
					console.log('Unapproved committer attempted deployment.'.red)
				}
			
			});
		}
	}
}).listen(config.github_listener.port);

console.log('Listening on port... ' + config.github_listener.port);	