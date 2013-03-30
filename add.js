var async = require("async");

module.exports = function(keyring, req, res, next) {
	if(req.body.keytext == null)
		return res.send(400, "Missing keytext parameter.");

	if(!Array.isArray(req.body.keytext))
		req.body.keytext = [ req.body.keytext ];

	async.forEachSeries(req.body.keytext, function(keytext, next) {
		keyring.importKeys(keytext, function(err, uploaded) {
			if(err || uploaded.failed.length != 0)
				return next(err || true);

			next();
		});
	}, function(err) {
		if(err)
		{
			keyring.revertChanges(function(err) {
				if(err)
					console.warn("Error reverting changes", err);

				res.send(500, "Error while uploading keys");
			});
		}
		else
		{
			keyring.saveChanges(function(err) {
				if(err)
					return res.send(500, "Error while uploading keys");

				res.send("Keys successfully uploaded");
			});
		}
	});
};