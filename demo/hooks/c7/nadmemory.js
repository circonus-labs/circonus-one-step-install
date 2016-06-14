"use strict";

var nadmemory = function(){};

nadmemory.prototype.run = function(d, cb, req, args, instance) {
	cb(d, process.memoryUsage(), instance);
	d.running = false;
};

module.exports = nadmemory;

	
