var config = require("./config");
var pgp = require("node-pgp");
var async = require("async");

module.exports = function(keyring, req, res, next) {
	if(req.query.op == null || req.query.search == null)
		return res.send(400, "Missing op or search parameters.");

	if(req.query.search.length < config.searchMinLength)
		return res.send(400, "Search string must be at least "+config.searchMinLength+" characters long.");

	var fingerprints = (req.query.fingerprint == "on");
	// TODO: Implement "exact"

	switch(req.query.op) {
		case "get":
			var keys = { };
			keyring.search(req.query.search).forEachSeries(function(it, next) {
				keys[it.id] = true;
				next();
			}, function(err) {
				if(err)
					return next(err);

				keys = Object.keys(keys);

				if(keys.length == 0)
					return res.send(404, "No keys found.");

				res.attachment(keys.length == 1 ? "0x"+keys[0]+".asc" : "keys.asc");
				res.type("application/pgp-keys");

				var streams = [ ];
				for(var i=0; i<keys.length; i++)
					streams.push(keyring.exportKey(keys[i]));

				pgp.formats.enarmor(pgp.BufferedStream.concat(streams), pgp.consts.ARMORED_MESSAGE.PUBLIC_KEY).whilst(function(data, next) {
					res.write(data);
					next();
				}, function(err) {
					if(err)
						return next(err);

					res.end();
				});
			});

			break;
		case "index":
		case "vindex":
			var result = { };
			keyring.search(req.query.search).forEachSeries(function(it, next) {
				result[it.id] = true;
				next();
			}, function(err) {
					if(err)
						return next(err);

				result = Object.keys(result);

				if(result.length == 0)
					return res.send(404, "No keys found.");

				res.type("text/plain");
				res.write("info:1:"+result.length+"\n");

				async.forEachSeries(result, function(keyId, next) {
					keyring.getKey(keyId, function(err, keyInfo) {
						if(err)
							return next(err);

						// TODO: Leave pkalgo and size empty for gnewpg
						res.write([
							"pub",
							fingerprints ? keyInfo.fingerprint : keyInfo.id,
							keyInfo.pkalgo,
							keyInfo.size,
							Math.floor(keyInfo.date.getTime()/1000),
							keyInfo.expires ? Math.floor(keyInfo.expires.getTime()/1000) : 0,
							"" + (keyInfo.revoked ? "r" : "") + (keyInfo.expires && keyInfo.expires.getTime() < (new Date()).getTime() ? "e" : "")
						].join(":")+"\n");

						function printIdentity(identityInfo) {
							res.write([
								"uid",
								encodeURIComponent(identityInfo.id),
								"", // TODO: Creation date
								identityInfo.expires ? Math.floor(identityInfo.expires.getTime()/1000) : 0,
								"" + (identityInfo.revoked ? "r" : "") + (identityInfo.expires && identityInfo.expires.getTime() < (new Date()).getTime() ? "e" : "")
							].join(":")+"\n");
						}

						keyring.getPrimaryIdentity(keyId, function(err, primaryId) {
							if(err)
								return next(err);

							async.series([
								function(next) {
									if(primaryId) {
										// List primary identity first
										keyring.getSelfSignedIdentity(keyId, primaryId.id, function(err, identityInfo) {
											if(err)
												return next(err);

											printIdentity(identityInfo);
											next();
										}, [ "id", "expires", "revoked" ]);
									}
									else
										next();
								},
								function(next) {
									keyring.getSelfSignedIdentities(keyId, null, [ "id", "expires", "revoked" ]).forEachSeries(function(identityInfo, next) {
										if(identityInfo.id != primaryId.id)
											printIdentity(identityInfo);
										next();
									}, next);
								}
							], next);
						}, [ "id" ]);
					}, [ fingerprints ? "fingerprint" : "id", "pkalgo", "size", "date", "expires", "revoked" ]);
				}, function(err) {
					if(err)
						return next(err);

					res.end();
				});
			});

			break;

		default:
			res.send(501, "Operation not implemented.");
	}
};