const Parse = require('parse/node');
const AWS = require('aws-sdk');
const fs = require('fs');
const fsPromises = require('fs.promises');


Parse.initialize('4U7qef9jXBFzdWPJ');
Parse.serverURL = 'http://nomad-v2-sandbox.herokuapp.com/parse';

var desc;
try 
{
	desc = JSON.parse( fs.readFileSync('desc.jsn').toString() );
}
catch( err )
{
	desc = {'has_faces': [],
			'has_no_faces': []};
}



// load list of images from text file

var imagesArray = fs.readFileSync('aap_images.txt').toString().split('\n');
console.log('read ' + imagesArray.length + ' images.');


var page = 18;
var limit = 50;
var start = page * limit;
var end = Math.min( start + limit, imagesArray.length - 1);
var count = 0;


for( var imageIndex = start; imageIndex < end; imageIndex++ )
{
	var fileName = imagesArray[imageIndex].split(/[ ]+/)[3];
	var s3Date = imagesArray[imageIndex].split(/[ ]+/)[0];

	if (fileName)
	{

		var demographicQuery = new Parse.Query('Demographic');
		demographicQuery.contains('url', fileName);
		demographicQuery.limit(1);

		Promise.all( [ demographicQuery.find(), fileName, s3Date ] )
			.then(([ demographics, s, s3Date ]) => {

				if (demographics.length > 0) {
					// image has a Demographic

					d = demographics[0];
					url = d.get('url');
					ts = d.get('timestamp');

					o = {'url': url,
						 'timestamp': ts};

					desc['has_faces'].push(o);
				} else {
					// image has NO demographic

					o = {'url': 'https://s3-us-west-2.amazonaws.com/nomad-ad-files/' + s,
						 's3_date': s3Date};
					desc['has_no_faces'].push(o);
				}

			})

			.then(() => {
				count++;

				if (count == limit)
				{
					fs.writeFileSync('desc.jsn', JSON.stringify(desc));
					console.log('processed images ' + start + ' - ' + end);
				}
			})

			.catch( error => {
				console.log('ERROR: ' + error);
			});
		
	}
}

