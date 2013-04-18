var express = require("express");
var config = require("./config");

module.exports = function(getKeyring, callback) {
	var app = express();

	if(config.trustProxy)
		app.enable("trust proxy");

	app.use(express.bodyParser({ maxFieldsSize: config.maxUploadSize }));
	app.use(app.router);
	app.use(function(req, res, next) {
		res.send(501, "Operation not implemented.");
	});

	function listener(cb) {
		return function(req, res, next) {
			getKeyring(req, function(err, keyring) {
				if(err)
					return next(err);

				var endBkp = res.end;
				res.end = function() {
					keyring.done();
					return endBkp.apply(this, arguments);
				};

				cb(keyring, req, res, next);
			});
		};
	}

	app.get("/pks/lookup", listener(require("./lookup")));
	app.post("/pks/add", listener(require("./add")));

	if(config.address)
		app.listen(config.port, config.address);
	else
		app.listen(config.port);

	callback();
};

function listen(keyring, callback) {
	return function(req, res, next) {

	}
}