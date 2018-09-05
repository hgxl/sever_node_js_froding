
// 5202d6d0-da7a-4d2c-a0c1-a0b28dfa4308

var express = require('express')
var https = require('https');
var request = require('request');
var schedule = require('node-schedule');
var fs = require('fs');
var mysql = require('mysql');
var redis = require("redis"),
util = require('util');
var bodyParser = require('body-parser');

var time_agent_alert = 10
var time_file_cache = 216000
var key_list = 'cache_list_sations'

token_key_api = '3b036afe-0110-4202-b9ed-99718476c2e0'



//** CONFIG
/*********************************************************************************************************************/
/*********************************************************************************************************************/
/*********************************************************************************************************************/
/*********************************************************************************************************************/

client = redis.createClient();
getAsync = util.promisify(client.get).bind(client);



app = express()
app.use(bodyParser.urlencoded({ extended: true }));

var con = mysql.createConnection({
	host: "localhost",
	user: "root",
	password: "root"
});

con.connect(function(err) {
	if (err) throw err;
	console.log("Connected!");

	con.query("USE api", function (err, result) {
		if (err) throw err;
		console.log("use API");

		get_all_stations_names(con, function(resp){})
	});
});

client.on("error", function (err) {
	console.log("Error " + err);
});




//**SERVER
/*********************************************************************************************************************/
/*********************************************************************************************************************/
/*********************************************************************************************************************/
/*********************************************************************************************************************/


function perfom_work_req(latitude_start, longitude_start, latitude_end, longitude_end, callback) {

	var key = create_key([latitude_start,longitude_start,latitude_end,longitude_end])

	check_cache(key, function ( err, response ) {

		if ( response.length > 0 ){

			try {
				var e = JSON.parse(response)

				perform_controls(response).then(json => { 
					callback(JSON.stringify(json))
				})
			} catch(e){
				callback('error') 	
			}

		} else {

			var params = encodeURI( '?from='+latitude_start+';'+longitude_start+'&to='+latitude_end+';'+longitude_end)

			call_api_navitia (params, function ( err, response ){
				
				save_file(key, response)

				perform_controls(response).then(json => { 
					callback(JSON.stringify(json))
				})
			}) 
		}
	})

}

app.post('/', function (req, res) {

	try {

		var latitude_start = req.body.from.split(";")[0]
		var longitude_start = req.body.from.split(";")[1]

		var latitude_end = req.body.to.split(";")[0]
		var longitude_end = req.body.to.split(";")[1]

		perfom_work_req(latitude_start, longitude_start, latitude_end, longitude_end, function(json){
			res.send(json)
		})

	} catch(e){
		res.send("bad request")
	}
	
})


app.get('/', function (req, res) {

	try {

		var latitude_start = req.query.from.split(";")[0]
		var longitude_start = req.query.from.split(";")[1]

		var latitude_end = req.query.to.split(";")[0]
		var longitude_end = req.query.to.split(";")[1]

		perfom_work_req(latitude_start, longitude_start, latitude_end, longitude_end, function(json){
			res.send(json)
		})
	} catch(e){
		res.send("bad request")
	}
})



async function perform_controls(json_) {
	try{
		var json = JSON.parse(json_)

		for (var i = 0; i < json.length; i++){
			var item = json[i]

			for (var j = 0; j < item.length; j++ ){
				var stop = item[j]

				stop["stop_point_to_controleurs"] = 0
				var res1 = await getAsync(stop["stop_point_to"]);
				stop["stop_point_to_controleurs"] = res1 != null ? parseInt(res1) : 0

				var res1 = await getAsync(stop["stop_point_from"]);
				stop["stop_point_from_controleurs"] = res1 != null ? parseInt(res1) : 0
			}
		}

		return json

	} catch(e){
		console.log(e)
		return "null"
	}
}


app.get('/alert', function (req, res) {

	var id_station = req.query.id


	update_agent(id_station, con)
	res.send(id_station)
})


app.get('/get_list_stations', function (req, res) {

	client.get(key_list, function (err, reply) {

		if (reply == null){
			
			get_all_stations_names(con, function(resp){
				res.send(resp)
			})
		} else {
			res.send(reply)
		}
	})
	
})


app.listen(3000, function () {
	console.log('Example app listening on port 3000!')
})


//**API
/*********************************************************************************************************************/
/*********************************************************************************************************************/
/*********************************************************************************************************************/
/*********************************************************************************************************************/
// call_api_navitia_line(function(err, response){

// })

// var index = -1
// var line = 1

// setInterval(function(){

// 	if (index < 6) {
// 		index++
// 	} else {
// 		index=-1
// 		line++
// 	}

// 	call_api_navitia_line(function(err, response){

// 	})

// }, 4000)

function call_api_navitia_line (callback){

	var url = 'https://'+token_key_api+'@api.navitia.io/v1/coverage/sandbox/lines/line:RAT:M'+line+'/stop_schedules?start_page='+index

	request(url, function (error, response, body) {
		// console.log('error:', error);

		try {
			var json = JSON.parse(body)
			var journey_json = handle_json_line(json)
			callback(error,JSON.stringify(journey_json)) 
		} catch(e){
			callback(e,"") 
		}
	});
}

function handle_json_line(json) {

	var lines = []

	for (var i = 0; i < json["stop_schedules"].length ; i++) {
		var stop = json["stop_schedules"][i]
		var id_station = stop["stop_point"]["id"]
		var name_station = stop["stop_point"]["label"]
		insert_date(id_station, name_station, con)
	}

	return lines
}

function insert_date(id, name, bdd) {

	var sql = "INSERT INTO gare (id, agent, id_name, name) VALUES (null, 0, '"+id+"', '"+name+"');";
	bdd.query(sql, function (err, result) {
			// if (err) throw err;
			// console.log("1 record inserted");
		});

}

function update_agent(id, bdd) {

	client.set(id, 1, 'EX', time_agent_alert);
	
	var req = "SELECT * FROM gare WHERE id_name = '"+id+"' ;"
	// console.log(req)

	bdd.query(req, function (err, result) {
		if (err) {
			console.log(err)
			return
		}

		if (result != null ){

			var count = parseInt(result[0]["agent"])
			count++

			var sql = "UPDATE gare SET agent = "+count+" WHERE id_name = '"+id+"' ;";
			bdd.query(sql, function (err, result) {
				// console.log("1 record inserted");
			});
		}
	});

}


function get_all_stations_names(bdd, callback) {
	
	bdd.query("SELECT * FROM gare ;", function (err, result) {
		if (err) {
			console.log(err)
			return
		}

		if (result != null ){
			var items = []

			for (var i = 0; i < result.length; i++){
				var item = result[i]

				items.push({
					id: item["id"],
					id_name: item["id_name"],
					name: item["name"],
				})
			}

			client.set(key_list, JSON.stringify(result), 'EX', 100000);
			callback(JSON.stringify(result))
		}
	});

}


function call_api_navitia_nearby (params, callback){
	var url = 'https://'+token_key_api+'@api.navitia.io/v1/coord/'+params+'/places_nearby?'

	request(url, function (error, response, body) {
		try {
			var json = JSON.parse(body)
			var journey_json = handle_json_nearby(json)
			callback(error,JSON.stringify(journey_json)) 	
		} catch(e){
			callback(error,'') 	
		}
	});
}

function call_api_navitia (params, callback){

	var url = 'https://'+token_key_api+'@api.navitia.io/v1/coverage/sandbox/journeys'+params

	request(url, function (error, response, body) {
		// console.log('error:', error);

		try {
			var json = JSON.parse(body)
			var journey_json = handle_json_sncf(json)
			callback(error,JSON.stringify(journey_json)) 
		} catch(e){
			callback(e,'') 	
		}
		
	});
}


//**MECHANIC
/*********************************************************************************************************************/
/*********************************************************************************************************************/
/*********************************************************************************************************************/
/*********************************************************************************************************************/


function save_file(path, json) {

	let data = JSON.stringify(json, null, 2);

	fs.writeFile('caches/'+path+'.json' , data, (err) => {  
		if (! err){
			// console.log("saved "+ path)
			client.set(path, 'caches/'+path+'.json', 'EX', time_file_cache);
		} else {
			console.log(err)
		}
	});

	// fs.writeFile( 'caches/'+path+'.json', json, 'utf8', function(err){
	// 	if (! err){
	// 		console.log("saved "+ path)
	// 		client.set(path, 'caches/'+path+'.json', 'EX', 100000);
	// 	} else {
	// 		console.log(err)
	// 	}
	// });

}

function create_key(values){

	var key = ""

	for ( var i = 0; i < values.length; i++ ){
		var str = values[i];
		key += str.slice(0, -1);
		key += ";"
	}

	// console.log("create_key : "+key)
	return  key
}

function check_cache(key, callback) {

	client.get(key, function (err, reply) {

		// console.log("check_cache " + reply)

		if ( reply != null ) {
			console.log(reply);
			
			read_file(reply, function(err, response){
				// console.log("from cache")
				callback(err,response) 
			})
			
		} else {
			// console.log("no cache");
			callback(err,"") 
		} 

	});

}

function read_file(path, callback){
	try {
		fs.readFile(path, function readFileCallback(err, data){
			if (err){
				console.log(err);
				callback(err, '')
			} else {

				try {
					var d = JSON.parse(data)
					callback(err, d)
				} catch(e){
					callback(e,'') 	
				}

			}
		})
	} catch(e) {

		try {
			var d = JSON.parse(data)
			callback(err, d)
		} catch(e){
			callback(e,'') 	
		}

		console.log(e)
	}
}


function handle_json_nearby(json) {

	var place_json = {}

	for( var s = 0; s < json["places_nearby"].length; s++ ){

		var place = json["places_nearby"][s]

		if ( place['embedded_type'] == 'stop_point') {
			place_json["name"] = place["name"]
			place_json["id"] = place["id"]
			place_json["distance"] = place["distance"]
			break
		}
	}

	return place_json
}

function handle_json_sncf(json) {

	try {
		var journey_json = []

		if ( json["journeys"] == undefined ){
			return journey_json
		} 

		for( var s = 0; s < json["journeys"].length; s++ ){

			var sections = json["journeys"][s]["sections"]
			var sections_json = []

			for (var i = 0; i < sections.length; i++){

				var type = sections[i]["type"]

				if(sections[i]["from"] != undefined ){

					var embedded_type = sections[i]["from"]["embedded_type"]

					if ( embedded_type == "stop_point" ) {
						var from_name_station = sections[i]["from"]["name"]
						var vehicule = "no_vehicule"
						var transfer_type = "walking"

						var duration = parseFloat(sections[i]["duration"]) / 60

						if ( sections[i]["links"][1] != undefined ){
							vehicule = sections[i]["links"][1]["id"]
							transfer_type = sections[i]["links"][3]["id"]
						} else if ( sections[i]["transfer_type"] != undefined) {
							transfer_type = sections[i]["transfer_type"]
						}

						var to_name_station = sections[i]["to"]["name"]

						var section_json = {}
						section_json["embedded_type"] = embedded_type
						section_json["from_name_station"] = from_name_station
						section_json["vehicule"] = vehicule
						section_json["transfer_type"] = transfer_type
						section_json["to_name_station"] = to_name_station
						section_json["type"] = type
						section_json["duration"] = duration
						section_json["stop_point_from"] = sections[i]["from"]["id"]
						section_json["stop_point_to"] = sections[i]["to"]["id"]
						sections_json.push(section_json)
					}
				}

			}
			journey_json.push(sections_json)

		}
	} catch(e){
		return journey_json
	}

	return journey_json
}





//**CRON
/*********************************************************************************************************************/
/*********************************************************************************************************************/
/*********************************************************************************************************************/
/*********************************************************************************************************************/


var j = schedule.scheduleJob('* * * * *', function(){
	clean_cache_files()
	console.log('The answer to life, the universe, and everything!');
});

async function clean_cache_files() {
	console.log("clean_cache_files")

	fs.readdir('caches/', (err, files) => {
		files.forEach(file => {

			var key = file.slice(0, -5)

			console.log(key);	

			check_cache(key, function ( err, response ) {

				if ( response.length == 0 ){
					console.log("Delete: "+file)
					fs.unlinkSync('caches/'+file);
				}
			})
		});

		return '**cleaned**';
	})
}

















