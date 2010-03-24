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
		"request": request,
		"response": response,
		"read": 0,
		"written": 0
	};
	sys.print("client request: "+request.method+" "+request.url);
	if ( request.headers.host ) sys.puts(" host = "+request.headers.host);
	else						sys.puts("");

	// from the client request, the router gives backend request
	// query should have : hostname, port, method, url, headers
	connection.query = handler.getProxyRequest(connection);
	if ( !connection.query.hostname || !connection.query.port || !connection.query.method || !connection.query.url || !connection.query.headers ) {
		return false;
	}

	// create the connection to the backend server
	var backend = http.createClient(connection.query.port, connection.query.hostname);

	// send request to the backend
	connection.backendRequest = backend.request(connection.query.method, connection.query.url, connection.query.headers);

	// stream client request body => backend request
	request.addListener("data", function(chunk) { connection.read += chunk.length ; connection.backendRequest.write(chunk, "utf8"); });

	// the request is sent
	request.addListener("end",function() {

		// listening for the backend's response
		connection.backendRequest.addListener('response', function (backendResponse) {

			sys.puts("backend response: "+backendResponse.statusCode );
			sys.puts(sys.inspect(backendResponse.headers));
			connection.backendResponse = backendResponse;
			// determine encoding from backend response headers
			

			// clientResponse represents the reponse to send to the client
			// should have : statusCode, headers
			// can have : data (response body), encoding (response encoding)
			connection.clientResponse = handler.getProxyResponse ? handler.getProxyResponse(connection) : backendResponse ;


			connection.clientResponse.encoding = connection.clientResponse.encoding ? connection.clientResponse.encoding : getEncoding(backendResponse);
// 			var encoding = handler.getEncoding ? handler.getEncoding(backendResponse) : getEncoding(backendResponse);

			// send response headers to the client
			response.writeHead(connection.clientResponse.statusCode, connection.clientResponse.headers);
			// set clients response body encoding
			backendResponse.setBodyEncoding(connection.clientResponse.encoding);

			if ( connection.clientResponse.data ) {
				response.write(connection.clientResponse.data,connection.clientResponse.encoding);
				connection.written = connection.clientResponse.data.length;
				response.close();
			} else {
				backendResponse.addListener("data", function (chunk) {	connection.written += chunk.length ; response.write(chunk,connection.clientResponse.encoding); });
				backendResponse.addListener("end",function() {			response.close(); sys.puts("backend finished: "+connection.read+" "+connection.written);});
			}
		});
		connection.backendRequest.close();
		
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
