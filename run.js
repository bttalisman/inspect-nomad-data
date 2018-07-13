const Parse = require('parse/node');
const AWS = require('aws-sdk');
const sharp = require('sharp');
const fs = require('fs');
const fsPromises = require('fs.promises');


Parse.initialize('4U7qef9jXBFzdWPJ');
Parse.serverURL = 'http://nomad-v2-sandbox.herokuapp.com/parse';

AWS.config.setPromisesDependency(require('bluebird'));


AWS.config.accessKeyId = 'AKIAJQLTNTZNR2ZA2TQA';
AWS.config.secretAccessKey = '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';
AWS.config.region = 'us-west-2';

var s3 = new AWS.S3({apiVersion: '2006-03-01'});
const bucketName = 'nomad-ad-files';




// load list of images from text file

var imagesArray = fs.readFileSync('aap_images.txt').toString().split('\n');
console.log('read ' + imagesArray.length + ' images.');

start = new Date(2018, 5, 26);
end = new Date(2018, 5, 27);



function go(params)
{
	var file = params.file;
	var url = params.url;
	var downloadFilePath = params.downloadFilePath;
	var rotatedFilePath = params.rotatedFilePath;
	var lastModifiedDate;

	// query last modified date from s3
	s3.headObject({Bucket: bucketName, Key: file}).promise()

		.then((result) => {
	    	lastModifiedDate = result.LastModified;
	    	//console.log('lastModifiedDate: ' + lastModifiedDate); 

			if (lastModifiedDate >= start && lastModifiedDate <= end) 
			{
				// last mod date in range.
				// fetch the file from s3
				return s3.getObject({Bucket: bucketName, Key: file}).promise();
			} else {
				throw new Error('Last modified out of range.');
			}})

		.then(data => {
			// write the image to local
			return fsPromises.writeFile(downloadFilePath, data.Body);})

		.then(() => {
			//  rotate the image
			p = sharp(downloadFilePath)
			  		.rotate(90)
					.toBuffer();
			return p;})

	  	.then(data => {
	  		// save the rotated image
			return fsPromises.writeFile(rotatedFilePath, data);})

		.then(() => {
			// delete the original downloaded file
		    fs.unlinkSync(downloadFilePath);
		    // read the rotated file
			return fsPromises.readFile(rotatedFilePath);})

		.then((data) => {
			// post the rotated file back to s3
		  	var base64data = new Buffer(data, 'binary');
		  	ps = {Bucket: bucketName,
		    	  Key: file,
		    	  Body: base64data,
		    	  ACL: 'public-read'};
		  	return s3.putObject(ps).promise();})

		.then(() => {

			// remove the rotated image file
			fs.unlinkSync(rotatedFilePath);

			// call Parse to create Demographic
			var ps = {
				carrierId: 'h7BsTPxgzj',
				zoneName: 'Sweeto Burrito 1',
				file: file,
				zoneId: 'h7bqt5wLm5',
				url: url,
				companyId: 'i0dXjwNyKe',
				epoch: lastModifiedDate.getTime()
			}
			console.log('params: ' + JSON.stringify(ps));

			return Parse.Cloud.run('createNewDemographicWithCollection', ps);})

		.then((res) => {
			console.log('done with ' + file);
		})

		.catch( error => {
			console.log('ERROR: ' + error);
		});

}




// Log in to Parse
Parse.User.logIn('admin', 'ready')
	.then(user => {
		var type = user.get('type');
		if (type == 'admin') {
			console.log('Logged in as admin!');
		} else {
			console.log('Could NOT log in as admin.');
		}


		for( imageIndex = 0; imageIndex < 1; imageIndex++ )
		{
			file = imagesArray[imageIndex].split(/[ ]+/)[3];
			url = 'https://s3-us-west-2.amazonaws.com/nomad-ad-files/' + file;
			downloadFilePath = './temp/' + file;
			rotatedFilePath = downloadFilePath.replace('.jpg', '_rotated.jpg');

			params = {file: file,
			          url: url,
			 		  downloadFilePath: downloadFilePath,
			 		  rotatedFilePath: rotatedFilePath};
			//go(params);
		}

		});










