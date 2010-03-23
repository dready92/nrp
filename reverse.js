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

var haveFun = function (handler, request, response,buffer) {

	sys.print("client request: "+request.method+" "+request.url);
	if ( request.headers.host ) sys.puts(" host = "+request.headers.host);
	else						sys.puts("");

	// from the client request, the router gives backend request
	// query should have : hostname, port, method, url, headers
	var query = handler.getProxyRequest(request);

	var backend = http.createClient(query.port, query.hostname);
	var backendRequest = backend.request(query.method, query.url, query.headers);

	// stream client request body => backend request
	buffer.addListener("data", function(chunk) { backendRequest.write(chunk, "utf8"); });

	buffer.addListener("end",function() {
		backendRequest.addListener('response', function (backendResponse) {

			sys.puts("backend response: "+backendResponse.statusCode );
			sys.puts(sys.inspect(backendResponse.headers));

			var encoding = handler.getEncoding ? handler.getEncoding(backendResponse) : getEncoding(backendResponse);

			var clientResponse = handler.getProxyResponse ? handler.getProxyResponse(request,backendResponse) : backendResponse ;

			response.writeHead(backendResponse.statusCode, backendResponse.headers);
			backendResponse.setBodyEncoding(encoding);
			backendResponse.addListener("data", function (chunk) {	response.write(chunk,encoding); });
			backendResponse.addListener("end",function() {			response.close(); });
		});
		backendRequest.close();
		delete buffer;
	});
	return true;
};

exports.registerRouter = function (name, def) {
	Routers[name] = def;
};

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

exports.ProxyHandle = function (request, response,buffer) {
	var handler = getRouteHandler(request);
	if ( handler === false ) return false;
	haveFun(handler,request,response,buffer);
	return true;
}



/**
* an helper class to buffer client connection request events "data" and "end"
*
* Any class just have to bind on this object instead of the request object.
*
* This object buffers the request body : it can be huge.
* To address this, if the instance is created with singleListener set to true, 
* the class will buffer the request body as long as there isn't "data" listeners
* when a new "data" listener is registered, it's run with the buffered data, and then the buffered data is deleted,
* any subsequent request data is directly streamed to the listener
*
* Usage : in node.js createServer callback ;
*
*	http.createServer(function (request, response) {
		request.setBodyEncoding("utf8");
		var buffer = new rproxy.bufferedRequest();
		request.addListener("data", function(chunk) { buffer.event("data",chunk); } );
		request.addListener("end",  function(chunk) { buffer.event("end");        } );

		(..)


		buffer.addListener("data",function(chunk) {
			// request body part
			sys.puts("received request body chunk : "+chunk);
		});

		buffer.addListener("end",function(chunk) {
			// request body ended
			sys.puts("I got the full request");

			// don't have any use of the buffer anymore
			delete buffer;
		});
	});


*/
exports.bufferedRequest = function (singleListener) {
	var listeners = {"data": [], "end": []},
	buffer = '',
	ended = false;
	if ( singleListener )	singleListener = true;
	else					singleListener = false;
	this.event = function(evt, chunk) {
		if ( evt == "data" ) {
			if ( !singleListener || !listeners.data.length ) {
				buffer+=chunk;
			}
			for ( var index in listeners.data ) {
				listeners.data[index](chunk);
			}
		}
		if ( evt == "end" ) {
			ended = true;
			for ( var index in listeners.end ) {
				listeners.end[index]();
			}
		}
	};

	this.addListener = function (evt, callback) {
		if ( evt == "data" ) {
			listeners.data.push(callback);
			if ( buffer.length ) {
				callback(buffer);
				if ( singleListener ) {
					delete buffer;
				}
			}
		}
		if ( evt == "ended" ) {
			if ( ended === true ) {
				callback();
			}
		} else {
			listeners.end.push(callback);
		}
		
	};
};

