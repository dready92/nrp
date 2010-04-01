/**

Reverse proxy steps :

1/ get client request
	=> set backend request
	=> set route handler
2/ open backend connection
3/ (eventually) stream client body on backend body
4/ get backend response
	=> set backend body encoding
	=> set client response headers
5/ send response headers to client
6/ stream response body
7/ close client & backend connections


*/

var sys  = require("sys"),
	url  = require("url"),
	http = require("http");
var objs = [] ;

var Routers = {}

var requestCount = 0;

var getRouteHandler = function (request) {
	for ( var index in objs ) {
		if ( objs[index].match(request) ) {			return objs[index];		}
	}
	return false;
};

var duplicateRequest = function (request) {
	return {
		"headers": JSON.parse(JSON.stringify(request.headers)),
		"method": request.method,
		"url": request.url,
		"httpVersion": request.httpVersion,
	};
};

var getEncoding = function ( resp ) {
	var encoding = "utf8";
	if ( resp.headers["content-type"] && resp.headers["content-type"].length ) {
		if ( 		resp.headers["content-type"].search(/^text/) < 0
				|| 	resp.headers["content-type"].search("javascript") < 0
				|| 	resp.headers["content-type"].search("json") < 0
				) {
			encoding="binary";
		}
	}
	return encoding;
};

var haveFun = function ( handler, request, response ) {

	var connection = {
		"id": requestCount,
		"request": {
			"client": request,
			"backend": null,
			"backendHeaders": JSON.parse(JSON.stringify(request.headers)),
			"backendHost": null,
			"backendPort": null,
			"backendUrl" : null,
			"backendMethod": request.method,
			"time": 0,
			"bytes": 0,
			"encoding": "utf8"
		},
		"answer": {
			"answer": null,
			"client": response,
			"backend": null,
			"clientHeaders": [],
			"statusCode": null,
			"time": 0,
			"bytes": 0,
			"body": null,
			"encoding": null
		}
	}

	requestCount++;
	sys.print(connection.id+": client request: "+request.method+" "+request.url);
	if ( request.headers.host ) sys.puts(" host = "+request.headers.host);
	else						sys.puts("");


// 	sys.puts("here "+sys.inspect(handler));
	//
	// here we call the handler
	// passing it the big connection data structure
	// As js pass objects by reference, changes made to connection will be available in this present function
	//
	handler.onProxyRequest(connection);

// sys.puts("here");

	if ( !connection.request.backendHost || !connection.request.backendPort || !connection.request.backendMethod || !connection.request.backendUrl ) {
		return false;
	}

	// create the connection to the backend server
	var backend = http.createClient(connection.request.backendPort, connection.request.backendHost);

	// send request to the backend
	connection.request.backend = backend.request(connection.request.backendMethod, connection.request.backendUrl, connection.request.backendHeaders);

	request.connection.addListener("close",function(is_error) {
		if ( is_error ) {
			sys.puts(connection.id+": client connection closed due to an error");
		}
	});
	request.connection.addListener("timeout",function() {
		sys.puts(connection.id+": client connection closed due to a timeout");
	});

	connection.request.backend.connection.addListener("close",function(is_error) {
		if ( is_error ) {
			sys.puts(connection.id+": backend connection closed due to an error");
		}
	});
	connection.request.backend.connection.addListener("timeout",function() {
		sys.puts(connection.id+": backend connection closed due to a timeout");
	});




	// stream client request body => backend request
	request.addListener("data", function(chunk) { 
		connection.request.bytes += chunk.length ;
		connection.request.backend.write(chunk, connection.request.encoding);
		sys.puts(connection.id+": => "+chunk.length);
	});

	// the request is sent
	request.addListener("end",function() {

		// listening for the backend's response
		connection.request.backend.addListener('response', function (backendResponse) {

			sys.puts(connection.id+": backend response: "+backendResponse.statusCode );

			connection.answer.backend = backendResponse;
			// here we set defaults mapping of backend response to client response
			connection.answer.clientHeaders = JSON.parse(JSON.stringify(backendResponse.headers));
			connection.answer.statusCode = backendResponse.statusCode;


			//
			// here we call once again the handler
			// only if it has the onProxyResponse function
			// 
			if ( handler.onProxyResponse ) {
				handler.onProxyResponse(connection);
			}

			// we set encoding with a very basic algorithm in case the handler didn't set it
			if ( !connection.answer.encoding ) {
				connection.answer.encoding = getEncoding(backendResponse);
			}

			// send response headers to the client
			response.writeHead(connection.answer.statusCode, connection.answer.clientHeaders);
			// set clients response body encoding
			backendResponse.setBodyEncoding(connection.answer.encoding);

			if ( connection.answer.data ) {
				response.write(connection.answer.data,connection.answer.encoding);
				connection.answer.bytes = connection.answer.data.length;
				response.close();
			} else {
				backendResponse.addListener("data", function (chunk) {
					response.write(chunk,connection.answer.encoding);
					connection.answer.bytes += chunk.length ;
					sys.puts(connection.id+": <= "+chunk.length);
				});
				backendResponse.addListener("end",function() {
				  response.close(); 
				  sys.puts(connection.id+": backend finished: "+connection.request.bytes+" "+connection.answer.bytes);
// 				sys.puts("Proxy request ended, read = "+connection.read+", written = "+connection.written);
				});
			}
		});
		connection.request.backend.close();
	});
	return true;
};

exports.registerRouter = function (name, def) {	Routers[name] = def; };

exports.ProxyPass = function (router, options) {
	if ( typeof Routers[router] != "undefined" ) {
		try {
			var r = new Routers[router](options);
			objs.push (
				r
			);
		} catch (e) {
			sys.puts("Failed to register ProxyPass "+router+" ("+JSON.stringify(options)+") : "+sys.inspect(e));
		}
	}
};

exports.ProxyMatch = function ( request ) {return getRouteHandler(request) === false ? false : true ;}
exports.ProxyRouteHandler = function ( request ) {	return getRouteHandler(request); }

exports.ProxyHandle = function (request, response) {
	var handler = getRouteHandler(request);
	if ( handler === false ) return false;
	haveFun(handler,request,response);
	return true;
}

exports.ManualHandle = function (request, response, handler) {
	haveFun(handler,request,response);
}
