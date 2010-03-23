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
		if ( resp.headers["content-type"].search(/^text/) < 0 || resp.headers["content-type"].search("javascript") < 0 ) {
			encoding="binary";
		}
	}
	return encoding;
};

var haveFun = function ( handler, request, response ) {

	sys.print("client request: "+request.method+" "+request.url);
	if ( request.headers.host ) sys.puts(" host = "+request.headers.host);
	else						sys.puts("");

	// from the client request, the router gives backend request
	// query should have : hostname, port, method, url, headers
	var query = handler.getProxyRequest(request);
	if ( !query.hostname || !query.port || !query.method || !query.url || !query.headers ) {
		return false;
	}

	// create the connection to the backend server
	var backend = http.createClient(query.port, query.hostname);

	// send request to the backend
	var backendRequest = backend.request(query.method, query.url, query.headers);

	// stream client request body => backend request
	request.addListener("data", function(chunk) { backendRequest.write(chunk, "utf8"); });

	// the request is sent
	request.addListener("end",function() {

		// listening for the backend's response
		backendRequest.addListener('response', function (backendResponse) {

			sys.puts("backend response: "+backendResponse.statusCode );
			sys.puts(sys.inspect(backendResponse.headers));

			// determine encoding from backend response headers
			

			// clientResponse represents the reponse to send to the client
			// should have : statusCode, headers
			// can have : data (response body), encoding (response encoding)
			var clientResponse = handler.getProxyResponse ? handler.getProxyResponse(request,backendResponse) : backendResponse ;


			clientResponse.encoding = clientResponse.encoding ? clientResponse.encoding : getEncoding(backendResponse);
// 			var encoding = handler.getEncoding ? handler.getEncoding(backendResponse) : getEncoding(backendResponse);

			// send response headers to the client
			response.writeHead(clientResponse.statusCode, clientResponse.headers);
			// set clients response body encoding
			backendResponse.setBodyEncoding(clientResponse.encoding);

			if ( clientResponse.data ) {
				response.write(chunk,clientResponse.encoding);
			} else {
				backendResponse.addListener("data", function (chunk) {	response.write(chunk,clientResponse.encoding); });
				backendResponse.addListener("end",function() {			response.close(); });
			}
		});
		backendRequest.close();
		
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
