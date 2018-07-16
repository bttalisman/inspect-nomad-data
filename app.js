var http = require('http');
var express = require('express');

var app = express();

const querystring = require('querystring');  
const bodyParser = require('body-parser');  

const Parse = require('parse/node');
const fs = require('fs');
const fsPromises = require('fs.promises');
//const { exec } = require('child_process');
const exec = require('child-process-promise').exec;
const moment = require('moment');
const hash = require('object-hash');

var url = require('url');

app.use(express.static(__dirname + '/public'));
app.use(bodyParser.urlencoded({ extended: true }));  
app.use(bodyParser.json());


Parse.initialize('4U7qef9jXBFzdWPJ');
Parse.serverURL = 'http://nomad-v2-sandbox.herokuapp.com/parse';


function getDates(startDate, stopDate) {
    var dateArray = [];
    var currentDate = moment(startDate);
    var stopDate = moment(stopDate);
    while (currentDate <= stopDate) {
        dateArray.push( moment(currentDate).format('YYYY-MM-DD') )
        currentDate = moment(currentDate).add(1, 'days');
    }
    return dateArray;
}



function getPromiseToSortImage(desc, fileName, s3Date) {
	let demographicQuery = new Parse.Query('Demographic');
	demographicQuery.contains('url', fileName);
	demographicQuery.limit(1);

	p = Promise.all( [ demographicQuery.find(), fileName, s3Date ] )
		.then(([ demographics, s, s3Date ]) => {
			if (demographics.length > 0) {
				// image has a Demographic

				d = demographics[0];
				url = d.get('url');
				ts = d.get('timestamp');

				o = {'url': url,
					 'timestamp': ts};

				desc['has_faces'].push(o);
				console.log('Images with faces: ' + desc['has_faces'].length);
			} else {
				// image has NO demographic

				o = {'url': 'https://s3-us-west-2.amazonaws.com/nomad-ad-files/' + s,
					 'timestamp': s3Date};
				desc['has_no_faces'].push(o);
				console.log('Images with NO faces: ' + desc['has_no_faces'].length);

			}
		})

		.catch( error => {
			console.log('ERROR: ' + error);
		});

	return p;
}




app.post('/run', function(req, res) {
	console.log(req.body);

	let carrierId = req.body.carrierid;
	let zoneId = req.body.zoneid;
	let dateStart = req.body.datestart;
	let dateEnd = req.body.dateend;
	let dates = getDates(dateStart, dateEnd);
	let hashString = hash([dateStart, dateEnd]);                          // Cache on dates only
	let filterHashString = hash([dateStart, dateEnd, zoneId, carrierId])  // Cache on dates and filter terms
	let imageListFileName = './temp/' + hashString + '_images.txt';
	let descFileName = './temp/' + filterHashString + '_desc.jsn';

	console.log('carrierId: ' + carrierId);
	console.log('zoneId: ' + zoneId);
	console.log('dateStart: ' + dateStart);
	console.log('dateEnd: ' + dateEnd);
	console.log('dates: ' + dates);
	console.log('dates: ' + dates);
	console.log('imageListFileName: ' + imageListFileName);
	console.log('descFileName: ' + descFileName);

	let getListProm;
	if (fs.existsSync(imageListFileName)) 
	{
		console.log('Cached list found, reading it.');
		getListProm = fsPromises.readFile(imageListFileName);

	} else {

		console.log('NO list file found, running AWS client.');
		// Construct a regular expression to OR the dates in the date range.
		let regex = '';
		for( i = 0; i < dates.length; i++ )
		{
			d = dates[i];
			if (regex) {
				regex += '|' + d;
			} else {
				regex = d;}
		}
		console.log('regex: ' + regex);
		let comm = '/Users/benjamintuckertalisman/.local/lib/aws/bin/aws s3 ls s3://nomad-ad-files | egrep \'' + regex + '\' > ' + imageListFileName;
		console.log('comm: ' + comm);

		getListProm = exec(comm)
		.then(() => { return fsPromises.readFile(imageListFileName); });
	}



	getListProm.then((data) => {

		// Grep regex does not support AND, so for the other constraints we will cull the above results.

		let imagesArray = data.toString().split('\n');
		let totalResultsCount = imagesArray.length;
		console.log('read ' + totalResultsCount + ' images.');

		let results = imagesArray;
		// get results with carrier
		if (carrierId) {console.log('filtering carrierId.'); results = imagesArray.filter(line => { return line.includes(carrierId); });}
		// get results with zone
		if (zoneId) {console.log('filtering zoneId.'); results = results.filter(line => { return line.includes(zoneId); });}

		if (!results) { res.redirect('/noresults') }

		let filteredResultsCount = results.length;
		console.log('images count after filtering: ' + filteredResultsCount);

		let desc, start;
		try {
			desc = JSON.parse( fs.readFileSync(descFileName).toString() );
			start = desc['processed_image_count'] - 1;
			console.log('Read cached description file.');
		} catch( err ) {
			start = 0;
			desc = {'processed_image_count': 0,
					'has_faces': [],
					'has_no_faces': []}; 
		}
		console.log('Starting with image at index: ' + start);

		let lastP;
		for( let imageIndex = start; imageIndex < filteredResultsCount; imageIndex++ )
		{
			let fileName = results[imageIndex].split(/[ ]+/)[3];
			let s3Date = results[imageIndex].split(/[ ]+/)[0];

			if (fileName)
			{
				if (!lastP)
				{
					lastP = getPromiseToSortImage(desc, fileName, s3Date);
				
				} else {
					lastP = lastP.then(() => {
						desc['processed_image_count'] = desc['processed_image_count'] + 1;
						fs.writeFileSync(descFileName, JSON.stringify(desc));							
						return getPromiseToSortImage(desc, fileName, s3Date);
					});
				}
			} // if (fileName)					
		} // for each image on the page

		lastP.then(() => {
			console.log('writing json file');
			fs.writeFileSync(descFileName, JSON.stringify(desc));

			res.redirect('/display?hash=' + filterHashString + '&hasfaces=true');
		})
		.catch(err => {
			console.log('ERR: ' + err);
		});

	})
	.catch(err => {

		console.log('err: ' + err);
	});

});





app.get('/noresults', function(req, res) {
	let s = '<!DOCTYPE html><html><head><link rel="stylesheet" href="./styles.css"></head><body>';
	s += 'No Results.</body></html>';
	res.send(s);
});


app.get('/display', function(req, res) {
	let hashString = req.query.hash;
	let hasFaces = (req.query.hasfaces === 'true');
	let descFileName = './temp/' + hashString + '_desc.jsn';

	console.log('/display - hashString: ' + hashString);
	console.log('/display - hasFaces: ' + hasFaces);


	var desc;
	try {
		desc = JSON.parse( fs.readFileSync(descFileName).toString() );
	} catch( err ) {
		console.log('err: ' + err);
	}

	var sortFunc = (a, b) => {
  		let da = new Date(a.timestamp);
  		let db = new Date(b.timestamp);

  		if (da < db) { return -1; }
  		return 1;
	}

	var imList;
	if (hasFaces) {
		imList = desc['has_faces'].sort(sortFunc);
	} else {
		imList = desc['has_no_faces'].sort(sortFunc);
	}
	console.log('read ' + imList.length + ' images.');

	let prev, next;
    let page = parseInt(req.query.page);
    if (!page) { page = 0; }

    if (page == 0) { prev = 0; } else { prev = page - 1; }
    next = page + 1;

	displayLimit = 100;

	start = page * displayLimit;
	end = start + displayLimit;

	var s = '<!DOCTYPE html><html><head><link rel="stylesheet" href="./styles.css"></head><body>';

	s += '<div class="flex-container">';
	
	for( i = start; i < end; i++ )
	{
		o = imList[i];
		if (o)
		{
			s += '<div>'
			s += '<a href="' + o.url + '" target="_new"><img src="' +  o.url + '" height="50" hspace="20"></img></a>';
			s += o.timestamp;
			s += '</div>';
		}
	}

	s += '</div>';
	s += '<a href="display?page=' + prev + '&hash=' + hashString + '&hasfaces=' + hasFaces.toString() + '">prev</a>&nbsp;';
	s += '<a href="display?page=' + next + '&hash=' + hashString + '&hasfaces=' + hasFaces.toString() + '">next</a>&nbsp;';

  	s += '</body></html>';

  	res.send(s);
});


app.listen(3000, function() {
  console.log('Example app listening on port 3000!');
});

