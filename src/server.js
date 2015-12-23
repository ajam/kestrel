'use-strict'

var hookshot   = require('hookshot');
var fs         = require('fs');
var exec       = require('child_process').exec;
var sh         = require('execSync'); // If you ever upgrade to a later version of nodejs, replace this with the base node `execSync` function
var request    = require('request');
var chalk      = require('chalk');
var nodemailer = require('nodemailer');
var CronJob 	 = require('cron').CronJob;
var time 			 = require('time');
var io 				 = require('indian-ocean');
var path 			 = require('path');

var config      = require('../config.json');
var sh_commands = require('./sh-commands.js');
var email_transporter;
var email_options;

var REPOSITORIES = path.join(path.resolve('.'), 'repositories')

var xoauth2_generator = require('xoauth2').createXOAuth2Generator({
	user: config.email.address,
	clientId: config.email.clientId,
	clientSecret: config.email.clientSecret,
	refreshToken: config.email.refreshToken
});

// Where we're storing our cronjobs by environment and repo name
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
			here_and_now, // A timezone'd version of `now`
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
			when,
			here_and_when, // A timezone'd version of `when`
			here_and_when_str,
			when_msg = '',
			s3_output = '',
			tense = '',
			deploy_s = '',
			songs_count,
			song_index,
			tune_reason;

	if (config.email.enabled) {
		if (mode == 'deploy'){
			mode_verb = 'performed';
		} else if (mode == 'schedule') {
			mode_verb = 'scheduled';
			tense = 'will ';
		} else if (mode == 'unschedule') {
			mode_verb = 'unscheduled';
			tense = 'won\'t ';
			deploy_s = 's';
		}

		info = context.info;
		most_recent_commit = context.most_recent_commit;
		deploy_statement = context.deploy_statement;
		deploy_type = context.deploy_type;
		bucket_environment = context.bucket_environment;
		local_path = context.local_path;
		remote_path = context.remote_path;
		when = context.when;

		here_and_when = new time.Date(when, config.timezone);
		if (new Date(here_and_when).toString() != 'Invalid Date'){
			here_and_when_str = here_and_when.toString();
		} else if (when != 'now'){
			here_and_when_str = 'ERROR: You have entered an invalid schedule date of ' + when + '. Despite what it says below, I am aborting this request. Please reschedule using YYYY-MM-DD HH:MM format.'
			console.log(chalk.red('ERROR: Invalid schedule date!'), when);
			console.log(chalk.yellow('User has been warned via email'));
		}

		committer = most_recent_commit.committer;
		committer_email = committer.email;
		committer_name  = committer.name;

		now = new time.Date();
		here_and_now = now.setTimezone(config.timezone).toString();

		commit_length_text = '.';
		commit_calculated_length = info.commits.length - 1;
		s = 's';

		songs_count = config.songs.length;
		song_index = Math.floor(Math.random()*songs_count);

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
			tune_reason = 'to celebrate';
			if (!stdout || !stdout.trim()){
				s3_output += 'S3 said everything was already up-to-date! If you\'ve removed files from your project and want to have that deletion reflected on S3 (possible if you\'ve renamed files, for instance) try doing a hard deploy.';
			} else {
				s3_output += 'Here\'s what S3 is telling me it did:<br/>';
				s3_output += stdout.replace(/remaining/g, 'remaining<br/>');
			}
		} else if (mode == 'schedule'){
			when_msg = ' for <strong>' + here_and_when_str + '</strong>';
			tune_reason = 'while you wait';
		} else if (mode == 'unschedule'){
			tune_reason = 'to listen to while you think about what to do next';
			deploy_type = 'all';
		}

		// What's the main body message look like?
		msg = 'I just '+mode_verb+' a <strong>'+deploy_type+'</strong> deploy'+deploy_s+' to S3 <strong>*'+bucket_environment+'*</strong>';

		if (mode != 'unschedule'){
			msg += when_msg+commit_length_text+commit_messages_and_urls+'<br/><br/>I '+tense+'put the local folder of <strong>`' + local_path + '`</strong><br/>onto S3 as <strong>`' + remote_path + '`</strong>'+s3_output;
		} else {
			// Add the repo name
			msg += ' for the project <strong>'+repo_name+'</strong>.';
			// Get rid of the `a` since `deploys` is now plural
			// And change the bolding
			msg = msg.replace('I just unscheduled a', 'I just <strong>unscheduled</strong>')
								.replace('<strong>all</strong>', 'all');
		}

		// Add the list of jobs
		msg += '<br/><br/>Scheduled jobs:</br>' + getJobsStr('<br/>')

		// Assemble an html version
		body_text = 'Hi '+ committer_name+',<br/><br/>' + msg + '<br/><br/><br/>'+'Talk to you later,<br/><br/>Kestrel Songs<br/><br/><strong>Sent at</strong>: '+here_and_now+'<br/><strong>Here\'s some tunes '+tune_reason+'</strong>: '+config.songs[song_index];
		email_options.html = body_text;

		// And a plain-text version
		email_options.text = body_text.replace(/<br\/>/g, '\n')
																	.replace(/<(\/?)strong>/g, '*');

		// Fill out the rest of the information and send
		email_options.to = committer_email;
		email_transporter.sendMail(email_options, function(error, info){
			if(error){
				console.log(chalk.red('Error in email sending'), error);
			}else{
				console.log(chalk.green('Email success! To: ') + committer_name + ' <' + committer_email + '>');
			}
		});
	}
}

function getJobs(includeContext){
	return Object.keys(jobs).map(function(jobId){
			var info = {id: jobId, time: jobs[jobId].context.when };
			if (includeContext) {
				info.context = jobs[jobId].context
			}
			return info
		})
}

function getJobsStr(delimiter){
	return getJobs().map(function(job){
		return job.id + ': ' + job.time
	}).join(delimiter)
}

function removeCron(cronId){
	delete jobs[cronId]
	writeCron()
	console.log(chalk.green('Removed cron id from list of jobs after deploying:'), cronId)
}

function writeCron(){
	io.writeDataSync('scheduled-jobs.json', getJobs(true));
	io.fs.writeFileSync('scheduled-jobs-clean.json', JSON.stringify(getJobs(), null, 2));
}

function verifyAccount(incoming_repo){
	if (incoming_repo == config.github_listener.account_name) {
		return true;
	}
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
		  	var json_body = JSON.parse(body)
		  	var committer_is_deployer = checkIfCommitterIsDeployer(json_body, committer);
		    cb(committer_is_deployer, json_body, committer);
		  } else {
		  	console.log(chalk.red('Error verifying committer'), JSON.stringify(error))
		  }
		})
	}
}

function createDirGitInit(info){
	console.log(chalk.yellow('Creating folder and git repository...'));
	var repo_name = info.repository.name;

	fs.mkdirSync(path.join(REPOSITORIES, repo_name));

	var remote_url_arr = info.repository.url.split('//');
	var authenticated_remote_url = remote_url_arr[0] + '//' + config.verify_committer.access_token + '@' + remote_url_arr[1];
	var create_statement = sh_commands.createGitRepoAndRemotes(repo_name, authenticated_remote_url);
	console.log(create_statement);
  sh.run(create_statement);
	console.log(chalk.green('Git created!'));
}
function pullLatest(info){
	var repo_name = info.repository.name;
	var branch_name = info.ref.split('/')[2]; // `ref: "refs/heads/<branchname>` => `branchname`
	var delete_branch;

	// If we're in `removeOnPush` mode, delete the repo folder first
	if (config.removeOnPush) {
		sh.run(sh_commands.rmRf(repo_name))
	}
	console.log(path.join(REPOSITORIES, repo_name))
	console.log(io.existsSync(path.join(REPOSITORIES, repo_name)) )
	if ( !fs.existsSync(path.join(REPOSITORIES, repo_name)) ) {
		console.log('Creating project repository ' + chalk.bold(repo_name) + ' and running ' + chalk.bold('git init'))
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

	// Put the working tree back onto the desired branch
	var checkout_branch = sh_commands.checkoutBranch(repo_name, branch_name);
	sh.run(checkout_branch);
}
function checkForDeployMsg(last_commit){
	console.log(chalk.yellow('Checking if deploy message in...'), last_commit.message);
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

	console.log(chalk.yellow('Deploying with:\n'), deploy_statement);
	exec(deploy_statement, function(error, stdout){
		// Log deployment result
		console.log(chalk.green('Deployed!'));
		console.log(stdout);
		removeCron(this.cron_id)
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
			when = commit_parts[4]; // Date/time string in YYYY-MM-DD HH:MM format or `now` or `unschedule`

	var deploy_statement = sh_commands.deploy(deploy_type, config.s3.buckets[bucket_environment], local_path, remote_path, config.s3.exclude);
	
	var cron_id = bucket_environment + '_' + repo_name;
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
		when: when,
		cron_id: cron_id
	};

	// If we're scheduling or unscheduling, (in those cases, `when` is either `unschedule` or a date string)
	// Clear any previous cron in that namespace
	if (when != 'now' && jobs[cron_id]){
		jobs[cron_id].stop();
	}

	var date_is_valid;
	
	if (when == 'now'){
		deployToS3.call(context);
	} else if (when == 'unschedule'){
		console.log(chalk.yellow('Unscheduling all deploys for'), repo_name);
		sendEmail(context, 'unschedule', most_recent_commit, '', repo_name);
		// Remove from file
		removeCron(cron_id)
	} else {

		date_is_valid = new Date(new time.Date(when, config.timezone));
		if (date_is_valid != 'Invalid Date'){
			jobs[cron_id] = new CronJob({
				cronTime: new time.Date(when, config.timezone),
				onTick: deployToS3,
				start: true,
				timeZone: config.timezone,
				context: context
			});
			writeCron()
			console.log(chalk.yellow('Scheduling with id as :\n'), cron_id);
			console.log(chalk.yellow('And deploy statement as :\n'), deploy_statement);
		} else {
			console.log(chalk.red('Error. Invalid date given:'), when, cron_id);
			console.log(chalk.yellow('Sending email saying so :\n'), deploy_statement);
		}

		sendEmail(context, 'schedule', most_recent_commit);
		// Print our running job ids and the time they're going to deploy
		console.log('All scheduled jobs: ', getJobs())
	}

}

hookshot(function(info){
	console.log(chalk.cyan('\n\n\n\n## Incoming push from'), info.repository.owner.name);
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
		console.log(chalk.cyan('Deploy status is'), deploy_status);
	}
	// Is this coming from the whitelisted GitHub account?
	if (is_account_verified){
		pullLatest(info);
		// if (config.email.enabled){
		// 	sendEmail(most_recent_commit, 'Pulled down '+info.commits.length+' commits. The most recent was made at ' + most_recent_commit.timestamp + ': '+ most_recent_commit.url);
		// }

		// Are we deploying? Has that option been enabled and does the commit have the appropriate message?
		if (config.s3.enabled && deploy_status){
			verifyCommitter(most_recent_commit, function(committer_approved, publishersList, committer){

				// Does the committer have deploy? privileges?
				if (committer_approved) {
					prepS3Deploy(deploy_status, info, most_recent_commit);
				} else {
					console.log(chalk.red('Unapproved committer attempted deployment.'))
					console.log(chalk.red('Publisher list:'), publishersList)
					console.log(chalk.red('Publish attempted by:'), committer)
				}
			
			});
		}
	}
}).listen(config.github_listener.port);

console.log('Listening on port... ' + config.github_listener.port);	