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
	this.options.hostname 	 = d.host;
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
		"httpVersion": connection.request.httpVersion,
	};
	back.hostname     = this.options.hostname;
	back.port         = this.options.port
	back.headers.host = this.options.hostname;
	back.data 		  = connection.request.data;
	back.url = back.url.replace(this.options.regexp,this.options.target_pathname);
	return back;
};

rproxy.registerRouter("simpleRoute",simpleRoute);
delete simpleRoute;

rproxy.ProxyPass("simpleRoute",
	{
		"source": "/",
		"target": "http://localhost/"
	}
);

// setInterval(function() {
// 	var d = process.memoryUsage();
// 	d.rss = parseInt(d.rss/1024);
// 	d.vsize = parseInt(d.vsize/1024);
// 	d.heapTotal = parseInt(d.heaptotal/1024);
// 	d.heapUsed = parseInt(d.heapUsed/1024);
// 	sys.puts("rss: " +d.rss+", vsize: "+d.vsize+", heapTotal: "+d.heapTotal+" , heapUsed: "+d.heapUsed);
// },5000);

http.createServer(function (request, response) {
	request.setBodyEncoding("utf8");

// 	var buffer = new rproxy.bufferedRequest();
// 	request.addListener("data",function (chunk) {		buffer.event("data",chunk); });
// 	request.addListener("end",function () {				buffer.event("end"); });

	if ( rproxy.ProxyHandle(request,response) ) {
		return true;
	}


	response.writeHead(404, {"Content-Type": "text/plain"});
	response.write("The URL you're trying to reach, "+request.url+", was not found on this server.\n");
	response.close();



	
}).listen(8000);
sys.puts("Server running at http://127.0.0.1:8000/");
