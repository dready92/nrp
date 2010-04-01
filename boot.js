var sys = require("sys"),
	url  = require("url"),
	http = require("http"),
	rproxy = require("./reverse");



var simpleRoute = function(options) {
	if ( !options.source || !options.target ) {
		throw { "error": "ArgumentException", "reason": "source and target should be specified" };
	}
	var d = url.parse(options.target);
	if ( d.protocol != "http:" ) {
		throw { "error": "ArgumentException", "reason": "target protocol: only http is supported" };
	}
	this.options = options;
	this.options.hostname 	 = d.hostname;
	this.options.port 		 = d.port || 80;
	this.options.target_pathname  = d.pathname ;
	this.options.regexp = new RegExp("^"+this.options.source);
};

simpleRoute.prototype.options = {"source": null, "target": null};

simpleRoute.prototype.match = function ( request ) {
	var matches = request.url.match( this.options.regexp );
	return matches && matches.length ? true : false;
};
simpleRoute.prototype.getProxyRequest = function (connection) {
	var back =  {
		"headers": JSON.parse(JSON.stringify(connection.request.headers)),
		"method": connection.request.method,
		"url": connection.request.url,
		"httpVersion": connection.request.httpVersion
	};
	back.hostname     = this.options.hostname;
	back.port         = this.options.port
	back.headers.host = this.options.hostname;
	back.data 		  = connection.request.data;
	back.url = back.url.replace(this.options.regexp,this.options.target_pathname);
	return back;
};

simpleRoute.prototype.onProxyRequest = function (connection) {
// 	var back =  {
// 		"headers": JSON.parse(JSON.stringify(connection.request.headers)),
// 		"method": connection.request.method,
// 		"url": connection.request.url,
// 		"httpVersion": connection.request.httpVersion
// 	};

	
	connection.request.backendHost     = this.options.hostname;
	connection.request.backendPort         = this.options.port
	connection.request.backendHeaders.host = this.options.hostname;
// 	back.data 		  = connection.request.clientdata;
	connection.request.backendUrl = connection.request.client.url.replace(this.options.regexp,this.options.target_pathname);
};

simpleRoute.prototype.onProxyResponse = function(connection) {
	for (var index in connection.answer.clientHeaders) {
		if ( index.toLowerCase() == 'location' ) {
			sys.puts ("FOUND LOCATION HEADER : " + connection.answer.clientHeaders.location);
			var r = new RegExp("^"+this.options.target);
			connection.answer.clientHeaders.location = connection.answer.clientHeaders.location.replace(r,"http://"+connection.request.client.headers.host+this.options.source);
		}
	}
};

rproxy.registerRouter("simpleRoute",simpleRoute);
delete simpleRoute;

rproxy.ProxyPass("simpleRoute",
	{
		"source": "/",
		"target": "http://source.tho.centiv.net/"
	}
);

http.createServer(function (request, response) {
	request.setBodyEncoding("utf8");

	if ( rproxy.ProxyHandle(request,response) ) {
		return true;
	}

	response.writeHead(404, {"Content-Type": "text/plain"});
	response.write("The URL you're trying to reach, "+request.url+", was not found on this server.\n");
	response.close();

}).listen(8000);
sys.puts("Server running at http://127.0.0.1:8000/");
