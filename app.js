var http = require('http');
var express = require('express');

var app = express();

const querystring = require('querystring');  
const bodyParser = require('body-parser');  

const Parse = require('parse/node');
const fs = require('fs');
const fsPromises = require('fs.promises');
const { exec } = require('child_process');
const moment = require('moment');

var url = require('url');

app.use(express.static(__dirname + '/public'));
app.use(bodyParser.urlencoded({ extended: true }));  
app.use(bodyParser.json());




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


app.get('/test', function(req, res) {


	var imagesArray = fs.readFileSync('wha.txt').toString().split('\n');
	console.log('read ' + imagesArray.length + ' images.');


	var result = imagesArray.filter(line => { return line.includes('21'); });


	console.log('result.length: ' + result.length);

});



app.post('/run', function(req, res) {
	console.log(req.body);

	let carrierId = req.body.carrierid;
	let zoneId = req.body.zoneid;
	let dateStart = req.body.datestart;
	let dateEnd = req.body.dateend;

	let dates = getDates(dateStart, dateEnd);

	console.log('carrierId: ' + carrierId);
	console.log('zoneId: ' + zoneId);
	console.log('dateStart: ' + dateStart);
	console.log('dateEnd: ' + dateEnd);
	console.log('dates: ' + dates);


	// Construct a regular expression to OR the dates in the date range.
	let regex = '';
	for( i = 0; i < dates.length; i++ )
	{
		d = dates[i];

		if (regex) {
			regex += '|' + d;
		} else {
			regex = d;
		}
	}
	console.log('regex: ' + regex);
	let comm = '/Users/benjamintuckertalisman/.local/lib/aws/bin/aws s3 ls s3://nomad-ad-files | egrep \'' + regex + '\' > images.txt';
	console.log('comm: ' + comm);



	exec(comm, (err, stdout, stderr) => {
		if (err) 
		{
	    	console.log('err: ' + err);

	  	} else {

	  		console.log('done running aws command.');

			// Grep regex does not support AND, so for the other constraints we will cull the above results.

			let imagesArray = fs.readFileSync('images.txt').toString().split('\n');
			console.log('read ' + imagesArray.length + ' images.');

			let result;

			// get results with carrier
			if (carrierId) {result = imagesArray.filter(line => { return line.includes(carrierId); });}
			// get results with zone
			if (zoneId) {result = imagesArray.filter(line => { return line.includes(zoneId); });}


			console.log('images count after filtering: ' + result.length);
			
			fs.writeFileSync('results.txt', JSON.stringify(result));

	  	}	  	
	});
	


});



app.get('/display', function(req, res) {

	var desc = JSON.parse( fs.readFileSync('desc.jsn').toString() );

	var sortFunc = (a, b) => {
  		let da = new Date(a.timestamp);
  		let db = new Date(b.timestamp);

  		if (da < db) { return -1; }
  		return 1;
	}

	var hasFaces = desc['has_faces'].sort(sortFunc);
	var hasNoFaces = desc['has_no_faces'].sort(sortFunc);

	var images = hasNoFaces;

	console.log('read ' + hasFaces.length + ' images with Demographics');
	console.log('read ' + hasNoFaces.length + ' images withOUT Demographics');

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
		o = images[i];
		if (o)
		{
			s += '<div>'
			s += '<a href="' + o.url + '" target="_new"><img src="' +  o.url + '" height="50" hspace="20"></img></a>';
			s += o.timestamp;
			s += '</div>';
		}
	}

	s += '</div>';
	s += '<a href="query?page=' + prev + '">prev</a>&nbsp;';
	s += '<a href="query?page=' + next + '">next</a>';

  	s += '</body></html>';

  	res.send(s);
});


app.listen(3000, function() {
  console.log('Example app listening on port 3000!');
});

