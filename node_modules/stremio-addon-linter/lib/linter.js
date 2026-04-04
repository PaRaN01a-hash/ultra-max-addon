const semver = require('semver')

function lintManifest(manifest) {
	var errors = []
	var warnings = []

	if (!manifest || typeof(manifest) != 'object')
		return { valid: false, errors: [new Error('manifest must be an object')] } 

	assertString(manifest.id, 'manifest.id')
	assertString(manifest.name, 'manifest.name')
	assertSemver(manifest.version, 'manifest.version')

	// WARNING: if we want to go through resources in detail, we need to keep in mind it can be a string or {name, types, ?idPrefixes}
	assertArray(manifest.resources, 'manifest.resources')
	if (Array.isArray(manifest.resources)) {
		var resourceNames = manifest.resources.map(function(r) {
			if (r && r.name) return r.name
			return r
		})
		warnIfNotAllInSet(resourceNames, ['catalog', 'meta', 'stream', 'subtitles'], 'manifest.resources')
	}

	assertArray(manifest.types, 'manifest.types')
	
	assertArray(manifest.catalogs, 'manifest.catalogs')

	// @TODO: this one is optional for now, but it will become even more convenient if we drop the resource shorthand: https://github.com/Stremio/stremio-addon-sdk/issues/27
	if (manifest.hasOwnProperty('idPrefixes') && manifest.idPrefixes !== null) assertArray(manifest.idPrefixes, 'manifest.idPrefixes')
	
	if (Array.isArray(manifest.catalogs)) manifest.catalogs.forEach(function(catalog, i) {
		// .type, .id are mandatory
		if (typeof(catalog.id) !== 'string' || typeof(catalog.type) !== 'string')
			errors.push(new Error('manifest.catalogs['+i+']: id and type must be string properties'))

		// extra: full notation: required to be an array
		// @TODO evaluate the inner contents
		if (catalog.hasOwnProperty('extra')) assertArray(catalog.extra, 'manifest.catalogs['+i+'].extra')

		// extra: short notation: .extraSupported and .extraRequired are optional but have to be arrays
		if (catalog.hasOwnProperty('extraSupported')) assertArray(catalog.extraSupported, 'manifest.catalogs['+i+'].extraSupported')
		if (catalog.hasOwnProperty('extraRequired')) assertArray(catalog.extraRequired, 'manifest.catalogs['+i+'].extraRequired')
	})

	// Asserts
	function assertString(val, name) {
		if (typeof(val) !== 'string')
			errors.push(new Error(name+' must be a string'))
	}

	function assertSemver(val, name) {
		if (typeof(val) != 'string' || !semver.valid(val))
			errors.push(new Error(name+' must be a valid semver string'))
	}

	function assertArray(val, name) {
		if (!Array.isArray(val))
			errors.push(new Error(name+' must be an array'))
	}

	function warnIfNotAllInSet(val, set, name) {
		if (!Array.isArray(val)) return
		val.forEach(function(m) {
			if (!set.includes(m))
				warnings.push(new Error(name+': unknown value '+m))
		})
	}

	return { valid: !errors.length, errors: errors, warnings: warnings }
}

function lintCollection(col) {
	var errors = []
	if (!Array.isArray(col)) errors.push(new Error('col is not an array'))
	else col.forEach(function(item, i) {
		// @TODO: transportUrl validation if it's a URL
		if (typeof(item.transportUrl) !== 'string')
			errors.push(new Error(i+': transportUrl must be a string'))

		if (typeof(item.transportName) !== 'string')
			errors.push(new Error(i+': transportName must be a string'))

		errors = errors.concat(lintManifest(item.manifest).errors)
	})
	return { valid: !errors.length, errors: errors, warnings: [] }
}

module.exports = {
	lintManifest: lintManifest,
	lintCollection: lintCollection,
}
